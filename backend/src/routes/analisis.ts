import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";

// ---------------------------------------------------------------------------
// Análisis
//
// Desde que el motor de tiempo escribe en cada jornada los cuatro tiempos y
// los tres importes, se puede responder a las preguntas de dirección sin
// rehacer ninguna cuenta: cuántas horas se acordaron, cuántas se trabajaron,
// cuántas se cobraron y cuántas se pagaron, y dónde se van separando.
//
// Todo sale de las mismas cifras que la factura y la liquidación, así que un
// número de aquí siempre se puede perseguir hasta una jornada concreta.
// ---------------------------------------------------------------------------
export const analisisRouter = Router();
analisisRouter.use(autenticar);

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const consulta = z.object({
  desde: z.string().regex(mesRegex).optional(),
  hasta: z.string().regex(mesRegex).optional(),
});

function mesDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Los doce meses hasta el actual, para que el eje no tenga huecos raros.
function mesesPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = mesDe(hoy);
  const atras = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 11, 1));
  return { desde: mesDe(atras), hasta };
}

function rango(desde: string, hasta: string) {
  const [a1, m1] = desde.split("-").map(Number);
  const [a2, m2] = hasta.split("-").map(Number);
  return { inicio: new Date(Date.UTC(a1, m1 - 1, 1)), fin: new Date(Date.UTC(a2, m2, 1)) };
}

const cero = () => ({
  jornadas: 0,
  minutosProgramados: 0,
  minutosReales: 0,
  minutosFacturables: 0,
  minutosLiquidables: 0,
  importeCliente: 0,
  importeProfesional: 0,
  importeCuida: 0,
});
type Acumulado = ReturnType<typeof cero>;

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function cerrar(a: Acumulado): Acumulado {
  return {
    ...a,
    importeCliente: redondear(a.importeCliente),
    importeProfesional: redondear(a.importeProfesional),
    importeCuida: redondear(a.importeCuida),
  };
}

analisisRouter.get("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = consulta.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const porDefecto = mesesPorDefecto();
  const desde = parsed.data.desde ?? porDefecto.desde;
  const hasta = parsed.data.hasta ?? porDefecto.hasta;
  const { inicio, fin } = rango(desde, hasta);

  // Solo lo que ya pasó. Una jornada todavía programada no tiene tiempo
  // fichado ni importe, así que aparecía como "1 jornada · 0 €" y bajaba las
  // medias de todo el mes. La carga que viene se mira en Cobertura, que es
  // donde tiene sentido.
  const jornadas = await prisma.visita.findMany({
    where: {
      fecha: { gte: inicio, lt: fin },
      estado: { in: ["FINALIZADA", "REVISADA", "LIQUIDADA", "CANCELADA", "NO_PRESENTADO", "FALTA_PROFESIONAL"] },
      servicio: { organizacionId: req.usuario!.organizacionId! },
    },
    include: {
      profesional: { select: { id: true, nombre: true, apellidos: true } },
      servicio: {
        select: {
          profesional: { select: { id: true, nombre: true, apellidos: true } },
          solicitud: {
            select: {
              persona: { select: { id: true, nombre: true, apellidos: true } },
              necesidad: { select: { id: true, nombre: true, codigo: true } },
            },
          },
        },
      },
    },
  });

  const porMes = new Map<string, Acumulado>();
  const porPersona = new Map<string, Acumulado & { id: string; nombre: string }>();
  const porProfesional = new Map<string, Acumulado & { id: string; nombre: string; retrasoTotal: number; conRetraso: number }>();
  const porNecesidad = new Map<string, Acumulado & { id: string; nombre: string; codigo: string }>();

  // Dónde se separan lo acordado y lo trabajado. No es una curiosidad: cada
  // línea de aquí es dinero que alguien tuvo que decidir a mano.
  const desviaciones = {
    conRetraso: 0,
    minutosRetrasoTotal: 0,
    conExceso: 0,
    minutosExcesoTotal: 0,
    conDefecto: 0,
    extraPendiente: 0,
    extraAprobado: 0,
    extraRechazado: 0,
    cierresManuales: 0,
    canceladas: 0,
    noPresentados: 0,
    // Jornadas a las que no fue nadie. Si esta cifra crece, lo que falla no es
    // el fichaje: es la plantilla o la planificación.
    faltasProfesional: 0,
  };

  const sumar = (a: Acumulado, v: (typeof jornadas)[number]) => {
    a.jornadas += 1;
    a.minutosProgramados += v.minutosProgramados ?? 0;
    a.minutosReales += v.minutosReales ?? 0;
    a.minutosFacturables += v.minutosFacturables ?? 0;
    a.minutosLiquidables += v.minutosLiquidables ?? 0;
    a.importeCliente += Number(v.importeCliente ?? 0);
    a.importeProfesional += Number(v.importeProfesional ?? 0);
    a.importeCuida += Number(v.importeCuida ?? 0);
  };

  for (const v of jornadas) {
    const mes = mesDe(v.fecha);
    if (!porMes.has(mes)) porMes.set(mes, cero());
    sumar(porMes.get(mes)!, v);

    const persona = v.servicio.solicitud.persona;
    if (!porPersona.has(persona.id)) {
      porPersona.set(persona.id, { ...cero(), id: persona.id, nombre: `${persona.nombre} ${persona.apellidos}` });
    }
    sumar(porPersona.get(persona.id)!, v);

    // El sello de la jornada manda sobre el profesional del servicio: si se
    // reasignó después, las horas siguen siendo de quien las hizo.
    const pro = v.profesional ?? v.servicio.profesional;
    if (pro) {
      if (!porProfesional.has(pro.id)) {
        porProfesional.set(pro.id, {
          ...cero(),
          id: pro.id,
          nombre: `${pro.nombre} ${pro.apellidos}`,
          retrasoTotal: 0,
          conRetraso: 0,
        });
      }
      const acc = porProfesional.get(pro.id)!;
      sumar(acc, v);
      if (v.retrasoMinutos != null && v.retrasoMinutos > 0) {
        acc.retrasoTotal += v.retrasoMinutos;
        acc.conRetraso += 1;
      }
    }

    const nec = v.servicio.solicitud.necesidad;
    if (!porNecesidad.has(nec.id)) {
      porNecesidad.set(nec.id, { ...cero(), id: nec.id, nombre: nec.nombre, codigo: nec.codigo });
    }
    sumar(porNecesidad.get(nec.id)!, v);

    if (v.retrasoMinutos != null && v.retrasoMinutos > 0) {
      desviaciones.conRetraso += 1;
      desviaciones.minutosRetrasoTotal += v.retrasoMinutos;
    }
    if (v.desviacionMinutos != null && v.desviacionMinutos > 0) {
      desviaciones.conExceso += 1;
      desviaciones.minutosExcesoTotal += v.desviacionMinutos;
    }
    if (v.desviacionMinutos != null && v.desviacionMinutos < 0) desviaciones.conDefecto += 1;
    if (v.ajusteEstado === "PENDIENTE") desviaciones.extraPendiente += 1;
    if (v.ajusteEstado === "APROBADO") desviaciones.extraAprobado += 1;
    if (v.ajusteEstado === "RECHAZADO") desviaciones.extraRechazado += 1;
    if (v.cierreManual) desviaciones.cierresManuales += 1;
    if (v.estado === "CANCELADA") desviaciones.canceladas += 1;
    if (v.estado === "NO_PRESENTADO") desviaciones.noPresentados += 1;
    if (v.estado === "FALTA_PROFESIONAL") desviaciones.faltasProfesional += 1;
  }

  const correcciones = await prisma.correccionFichaje.count({
    where: { visita: { fecha: { gte: inicio, lt: fin }, servicio: { organizacionId: req.usuario!.organizacionId! } } },
  });

  // Los meses con cero también salen: un hueco en la serie dice tanto como un
  // pico, y si se omite parece que no hubo mes.
  const meses: (Acumulado & { mes: string })[] = [];
  const [a1, m1] = desde.split("-").map(Number);
  const [a2, m2] = hasta.split("-").map(Number);
  for (let a = a1, m = m1; a < a2 || (a === a2 && m <= m2); m === 12 ? ((a += 1), (m = 1)) : (m += 1)) {
    const clave = `${a}-${String(m).padStart(2, "0")}`;
    meses.push({ mes: clave, ...cerrar(porMes.get(clave) ?? cero()) });
  }

  const total = cerrar(
    meses.reduce((acc, m) => {
      acc.jornadas += m.jornadas;
      acc.minutosProgramados += m.minutosProgramados;
      acc.minutosReales += m.minutosReales;
      acc.minutosFacturables += m.minutosFacturables;
      acc.minutosLiquidables += m.minutosLiquidables;
      acc.importeCliente += m.importeCliente;
      acc.importeProfesional += m.importeProfesional;
      acc.importeCuida += m.importeCuida;
      return acc;
    }, cero()),
  );

  const ordenarPorImporte = <T extends { importeCliente: number }>(xs: T[]) => xs.sort((a, b) => b.importeCliente - a.importeCliente);

  res.json({
    desde,
    hasta,
    total,
    meses,
    porPersona: ordenarPorImporte([...porPersona.values()].map((x) => ({ ...cerrar(x), id: x.id, nombre: x.nombre }))),
    porProfesional: [...porProfesional.values()]
      .map((x) => ({
        ...cerrar(x),
        id: x.id,
        nombre: x.nombre,
        // Media sobre las jornadas en que llegó tarde, no sobre todas: decir
        // "2 min de media" cuando llegó 20 min tarde una vez de diez esconde
        // justo el caso que hay que mirar.
        retrasoMedio: x.conRetraso > 0 ? Math.round(x.retrasoTotal / x.conRetraso) : 0,
        jornadasConRetraso: x.conRetraso,
      }))
      .sort((a, b) => b.minutosLiquidables - a.minutosLiquidables),
    porNecesidad: ordenarPorImporte([...porNecesidad.values()].map((x) => ({ ...cerrar(x), id: x.id, nombre: x.nombre, codigo: x.codigo }))),
    desviaciones: { ...desviaciones, correcciones },
  });
});
