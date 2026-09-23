import { prisma } from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// Regularizaciones
//
// Coordinación aprueba 15 minutos de más en una jornada del mes pasado porque
// la familia se los pidió. El motor de tiempo rehace la cuenta en el acto —esa
// jornada pasa a valer 3 h 15 min, con su precio y su reparto—, pero la
// factura de aquel mes ya está emitida y la liquidación ya está aprobada, y
// ninguna de las dos se puede reescribir: una factura emitida se rectifica, no
// se edita, y una liquidación aprobada es lo que se le prometió a quien
// trabajó.
//
// Así que la diferencia no se pierde ni se apaña a mano: se arrastra. La
// siguiente factura y la siguiente liquidación llevan una línea por cada
// jornada cuyo importe de hoy no coincide con lo que ya se documentó, diciendo
// de qué jornada viene. Cuando esa línea se aprueba, la suma vuelve a cuadrar
// y la regularización desaparece sola.
//
// Sirve en los dos sentidos: si se rechaza un tiempo que ya se había cobrado,
// la diferencia sale en negativo y se devuelve.
// ---------------------------------------------------------------------------

export interface Regularizacion {
  visitaId: string;
  codigo: string;
  fecha: Date;
  concepto: string;
  // La diferencia, no el total: lo que falta por pagar o por cobrar de esa
  // jornada. En negativo cuando se cobró o se pagó de más.
  importe: number;
  minutos: number;
  // Dónde se documentó antes, para poder explicarlo en una línea.
  documentado: string;
}

const CENTIMO = 0.005;
const redondear = (n: number) => Math.round(n * 100) / 100;

function describir(codigo: string, fecha: Date, quePaso: string) {
  const dia = fecha.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return `Regularización de ${codigo} · ${dia} · ${quePaso}`;
}

// Lo que falta por pagarle a un profesional de jornadas que ya entraron en una
// liquidación aprobada o pagada.
export async function pagosPendientes(profesionalId: string, organizacionId: string, hasta: Date): Promise<Regularizacion[]> {
  const lineas = await prisma.lineaLiquidacion.findMany({
    where: {
      visitaId: { not: null },
      liquidacion: { profesionalId, organizacionId, estado: { in: ["APROBADA", "PAGADA"] } },
    },
    select: { visitaId: true, importe: true, minutos: true },
  });
  if (lineas.length === 0) return [];

  const pagado = new Map<string, { importe: number; minutos: number }>();
  for (const l of lineas) {
    const actual = pagado.get(l.visitaId!) ?? { importe: 0, minutos: 0 };
    actual.importe += Number(l.importe);
    actual.minutos += l.minutos;
    pagado.set(l.visitaId!, actual);
  }

  const visitas = await prisma.visita.findMany({
    where: {
      id: { in: [...pagado.keys()] },
      fecha: { lt: hasta },
      ajusteEstado: { not: "PENDIENTE" },
      importeProfesional: { not: null },
    },
    include: { servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } } },
    orderBy: { fecha: "asc" },
  });

  const regularizaciones: Regularizacion[] = [];
  for (const v of visitas) {
    const ya = pagado.get(v.id)!;
    const diferencia = redondear(Number(v.importeProfesional) - ya.importe);
    if (Math.abs(diferencia) < CENTIMO) continue;
    const minutos = (v.minutosLiquidables ?? 0) - ya.minutos;
    regularizaciones.push({
      visitaId: v.id,
      codigo: v.codigo,
      fecha: v.fecha,
      concepto: describir(
        v.codigo,
        v.fecha,
        `${v.servicio.solicitud.necesidad.nombre} · ${v.servicio.solicitud.persona.nombre} ${v.servicio.solicitud.persona.apellidos}${
          minutos > 0 ? ` · ${minutos} min aprobados después` : minutos < 0 ? ` · ${-minutos} min que no entraban` : ""
        }`,
      ),
      importe: diferencia,
      minutos,
      documentado: "liquidación anterior",
    });
  }
  return regularizaciones;
}

// Lo mismo por el lado de la familia: jornadas ya facturadas cuyo importe de
// hoy no es el que se facturó.
export async function cobrosPendientes(personaId: string, organizacionId: string, hasta: Date): Promise<Regularizacion[]> {
  const facturas = await prisma.factura.findMany({
    where: { personaId, organizacionId, estado: { in: ["EMITIDA", "PAGADA", "IMPAGADA"] } },
    select: { id: true, serie: true, numero: true, ejercicio: true, lineas: { select: { visitaId: true, importe: true, minutos: true, ivaPorcentaje: true } } },
  });
  if (facturas.length === 0) return [];

  const facturado = new Map<string, { importe: number; minutos: number; iva: number; referencia: string }>();
  for (const f of facturas) {
    const referencia = f.numero ? `${f.serie}/${f.ejercicio}/${String(f.numero).padStart(4, "0")}` : "factura anterior";
    for (const l of f.lineas) {
      if (!l.visitaId) continue;
      const actual = facturado.get(l.visitaId) ?? { importe: 0, minutos: 0, iva: Number(l.ivaPorcentaje), referencia };
      actual.importe += Number(l.importe);
      actual.minutos += l.minutos ?? 0;
      facturado.set(l.visitaId, actual);
    }
  }
  if (facturado.size === 0) return [];

  const visitas = await prisma.visita.findMany({
    where: {
      id: { in: [...facturado.keys()] },
      fecha: { lt: hasta },
      ajusteEstado: { not: "PENDIENTE" },
      importeCliente: { not: null },
    },
    include: { servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } } },
    orderBy: { fecha: "asc" },
  });

  const regularizaciones: Regularizacion[] = [];
  for (const v of visitas) {
    const ya = facturado.get(v.id)!;
    const diferencia = redondear(Number(v.importeCliente) - ya.importe);
    if (Math.abs(diferencia) < CENTIMO) continue;
    const minutos = (v.minutosFacturables ?? 0) - ya.minutos;
    regularizaciones.push({
      visitaId: v.id,
      codigo: v.codigo,
      fecha: v.fecha,
      concepto: describir(
        v.codigo,
        v.fecha,
        `${v.servicio.solicitud.necesidad.nombre}${minutos > 0 ? ` · ${minutos} min aprobados después` : minutos < 0 ? ` · ${-minutos} min que no entraban` : ""} (${ya.referencia})`,
      ),
      importe: diferencia,
      minutos,
      documentado: ya.referencia,
    });
  }
  return regularizaciones;
}

// Para avisar en el momento de aprobar el tiempo: ¿esta jornada ya está
// documentada en algún sitio que no se pueda tocar?
export async function yaDocumentada(visitaId: string): Promise<{ facturada: string | null; liquidada: boolean }> {
  const [lineaFactura, lineaLiquidacion] = await Promise.all([
    prisma.lineaFactura.findFirst({
      where: { visitaId, factura: { estado: { in: ["EMITIDA", "PAGADA", "IMPAGADA"] } } },
      select: { factura: { select: { serie: true, numero: true, ejercicio: true } } },
    }),
    prisma.lineaLiquidacion.findFirst({
      where: { visitaId, liquidacion: { estado: { in: ["APROBADA", "PAGADA"] } } },
      select: { id: true },
    }),
  ]);
  const f = lineaFactura?.factura;
  return {
    facturada: f?.numero ? `${f.serie}/${f.ejercicio}/${String(f.numero).padStart(4, "0")}` : null,
    liquidada: lineaLiquidacion != null,
  };
}
