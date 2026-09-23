import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion } from "../services/permisos.js";
import { notificarUsuario } from "../services/notificaciones.js";
import { pagosPendientes } from "../services/regularizaciones.js";
import { minutosFichados } from "../services/economia.js";
import { redondear } from "../services/facturacion.js";

// Lo que la empresa debe a quien ha trabajado. Hasta ahora sólo existía un
// sí/no de "pagado" colgando del servicio: no se podía decir a nadie "esto es
// lo que has hecho este mes y esto es lo que cobras", ni darle un papel.
//
// El cálculo se bifurca según cómo trabaje cada quien: a un autónomo se le
// retiene IRPF y su liquidación es la base de la factura que él emite; a un
// empleado no se le retiene aquí —eso lo hace la nómina— y la liquidación es
// el resumen de horas que se manda a la gestoría.
export const liquidacionesRouter = Router();
liquidacionesRouter.use(autenticar);

const soloGestion = requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN");
const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

function rangoMes(mes: string): { desde: Date; hasta: Date } {
  const [anio, mesNum] = mes.split("-").map(Number);
  return { desde: new Date(Date.UTC(anio, mesNum - 1, 1)), hasta: new Date(Date.UTC(anio, mesNum, 1)) };
}

const INCLUDE_LIQ = {
  profesional: { select: { id: true, codigo: true, nombre: true, apellidos: true, dni: true, numeroCuenta: true, tipoRelacion: true } },
  lineas: { orderBy: { fecha: "asc" } },
} as const;

liquidacionesRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  if (esGestorOrganizacion(usuario)) {
    const liquidaciones = await prisma.liquidacion.findMany({
      where: { organizacionId: usuario.organizacionId ?? "__none__" },
      include: INCLUDE_LIQ,
      orderBy: [{ mes: "desc" }, { createdAt: "desc" }],
    });
    return res.json(liquidaciones);
  }
  if (usuario.rol === "PROFESIONAL") {
    // Cada quien ve las suyas y sólo a partir de que se aprueban: un borrador
    // es un cálculo en curso de coordinación, no una promesa de cobro.
    const liquidaciones = await prisma.liquidacion.findMany({
      where: { profesionalId: usuario.profesionalId ?? "__none__", estado: { in: ["APROBADA", "PAGADA"] } },
      include: INCLUDE_LIQ,
      orderBy: { mes: "desc" },
    });
    return res.json(liquidaciones);
  }
  res.json([]);
});

const generarSchema = z.object({
  mes: z.string().regex(mesRegex, "Formato esperado: AAAA-MM"),
  profesionalId: z.string().optional(),
});

// Genera (o rehace, si sigue en borrador) la liquidación del mes con las
// jornadas verificadas. Sólo entran las verificadas: liquidar algo que
// coordinación todavía no ha dado por bueno es pagar a ciegas.
liquidacionesRouter.post("/generar", soloGestion, async (req, res) => {
  const parsed = generarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const organizacionId = req.usuario!.organizacionId!;
  const { desde, hasta } = rangoMes(parsed.data.mes);

  const profesionales = await prisma.profesional.findMany({
    where: {
      organizacionId,
      ...(parsed.data.profesionalId ? { id: parsed.data.profesionalId } : {}),
    },
  });
  if (profesionales.length === 0) return res.status(404).json({ error: "No hay profesionales" });

  const generadas: string[] = [];
  const saltadas: string[] = [];

  for (const profesional of profesionales) {
    const visitas = await prisma.visita.findMany({
      where: {
        // Una jornada cancelada o con la persona ausente también se le paga,
        // en el porcentaje que digan las reglas: reservó el hueco o se
        // desplazó. Lo que nunca se liquida es un tiempo sin decidir.
        estado: { in: ["REVISADA", "CANCELADA", "NO_PRESENTADO"] },
        ajusteEstado: { not: "PENDIENTE" },
        fecha: { gte: desde, lt: hasta },
        OR: [{ profesionalId: profesional.id }, { profesionalId: null, servicio: { profesionalId: profesional.id } }],
        servicio: { organizacionId, tarifaTipo: "PAGADO" },
      },
      include: { servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } } },
      orderBy: { fecha: "asc" },
    });

    // Lo que quedó a deber (o de más) de meses ya liquidados: aprobar tiempo
    // de una jornada vieja no puede quedarse sin llegar a la nómina sólo
    // porque aquella liquidación ya estaba aprobada.
    const regularizaciones = await pagosPendientes(profesional.id, organizacionId, hasta);

    if (visitas.length === 0 && regularizaciones.length === 0) {
      saltadas.push(`${profesional.nombre} ${profesional.apellidos}`);
      continue;
    }

    const existente = await prisma.liquidacion.findUnique({
      where: { profesionalId_mes: { profesionalId: profesional.id, mes: parsed.data.mes } },
    });
    if (existente && existente.estado !== "BORRADOR") {
      saltadas.push(`${profesional.nombre} ${profesional.apellidos} (ya aprobada)`);
      continue;
    }

    // Lo que se le paga sale del motor de tiempo: el tiempo liquidable de esa
    // jornada a su precio/hora, ya congelados cuando se cerró. Antes se
    // rehacía aquí la cuenta a partir de las horas fichadas y del importe del
    // servicio, y podía no coincidir con lo que el desglose le había enseñado
    // al profesional.
    const lineas = visitas.map((v) => {
      const delMotor = v.importeProfesional != null;
      const minutos = delMotor
        ? (v.minutosLiquidables ?? 0)
        : (minutosFichados(v.horaInicioReal, v.horaFinReal) ?? 0);
      let importe: number;
      if (delMotor) {
        importe = Number(v.importeProfesional);
      } else {
        // Jornadas anteriores al motor: se conserva el cálculo antiguo para no
        // dejar sin pagar trabajo ya hecho.
        const minutosPrevistos = v.servicio.minutosPrevistos ?? minutos;
        const importePorJornada = Number(v.servicio.importeProfesional ?? 0);
        const porMinuto = minutosPrevistos > 0 ? importePorJornada / minutosPrevistos : 0;
        importe = redondear(porMinuto * minutos);
      }
      const noPrestada = v.estado === "CANCELADA" ? " · cancelada fuera de plazo" : v.estado === "NO_PRESENTADO" ? " · la persona no estaba" : "";
      return {
        visitaId: v.id,
        fecha: v.fecha,
        concepto: `${v.servicio.solicitud.necesidad.nombre} · ${v.servicio.solicitud.persona.nombre} ${v.servicio.solicitud.persona.apellidos}${noPrestada}`,
        minutos,
        importe,
      };
    });

    for (const r of regularizaciones) {
      lineas.push({ visitaId: r.visitaId, fecha: r.fecha, concepto: r.concepto, minutos: r.minutos, importe: r.importe });
    }

    const minutos = lineas.reduce((a, l) => a + l.minutos, 0);
    const bruto = redondear(lineas.reduce((a, l) => a + l.importe, 0));
    // La retención sólo tiene sentido en los autónomos. En un contrato
    // laboral el IRPF lo calcula la nómina, fuera de aquí.
    const irpfPorcentaje = profesional.tipoRelacion === "AUTONOMO" ? Number(profesional.irpfPorcentaje ?? 15) : 0;
    const irpfImporte = redondear(bruto * (irpfPorcentaje / 100));
    const neto = redondear(bruto - irpfImporte);

    const datos = {
      mes: parsed.data.mes,
      profesionalId: profesional.id,
      organizacionId,
      tipoRelacion: profesional.tipoRelacion,
      minutos,
      bruto,
      irpfPorcentaje,
      irpfImporte,
      neto,
      estado: "BORRADOR" as const,
    };

    if (existente) {
      await prisma.lineaLiquidacion.deleteMany({ where: { liquidacionId: existente.id } });
      await prisma.liquidacion.update({ where: { id: existente.id }, data: { ...datos, lineas: { create: lineas } } });
      generadas.push(existente.codigo);
    } else {
      const creada = await prisma.liquidacion.create({
        data: { codigo: await generarCodigo("liquidacion"), ...datos, lineas: { create: lineas } },
      });
      generadas.push(creada.codigo);
    }
  }

  if (generadas.length === 0) {
    return res.status(409).json({ error: "Ninguna jornada verificada que liquidar en ese mes" });
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "generar_liquidaciones",
    entidadTipo: "Liquidacion",
    entidadId: generadas[0],
    detalle: `${parsed.data.mes} · ${generadas.length} liquidaciones`,
  });

  const liquidaciones = await prisma.liquidacion.findMany({
    where: { organizacionId, mes: parsed.data.mes },
    include: INCLUDE_LIQ,
  });
  res.status(201).json({ generadas, saltadas, liquidaciones });
});

async function cargarPropia(id: string, organizacionId: string | null | undefined) {
  const liquidacion = await prisma.liquidacion.findUnique({ where: { id }, include: INCLUDE_LIQ });
  if (!liquidacion || liquidacion.organizacionId !== organizacionId) return null;
  return liquidacion;
}

// Aprobar es el momento en que la cifra deja de moverse y el profesional la
// ve: hasta entonces coordinación puede regenerarla tantas veces como quiera.
liquidacionesRouter.post("/:id/aprobar", soloGestion, async (req, res) => {
  const liquidacion = await cargarPropia(req.params.id, req.usuario!.organizacionId);
  if (!liquidacion) return res.status(404).json({ error: "No encontrada" });
  if (liquidacion.estado !== "BORRADOR") return res.status(409).json({ error: "Esta liquidación ya está aprobada" });

  const aprobada = await prisma.liquidacion.update({ where: { id: liquidacion.id }, data: { estado: "APROBADA" }, include: INCLUDE_LIQ });

  // Verificada → liquidable → liquidada. Aprobar la liquidación es lo que
  // cierra el ciclo de esas jornadas: quedan marcadas y ya no pueden volver a
  // entrar en la liquidación del mes siguiente.
  const jornadasLiquidadas = aprobada.lineas.map((l) => l.visitaId).filter((id): id is string => id != null);
  if (jornadasLiquidadas.length > 0) {
    await prisma.visita.updateMany({
      where: { id: { in: jornadasLiquidadas }, estado: "REVISADA" },
      data: { estado: "LIQUIDADA" },
    });
  }

  const cuenta = await prisma.usuario.findFirst({ where: { profesionalId: liquidacion.profesionalId }, select: { id: true } });
  if (cuenta) {
    await notificarUsuario(
      cuenta.id,
      "liquidacion_aprobada",
      `Tu liquidación de ${liquidacion.mes} está lista: ${Number(aprobada.neto).toFixed(2)} €.`,
    );
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: liquidacion.organizacionId,
    accion: "aprobar_liquidacion",
    entidadTipo: "Liquidacion",
    entidadId: liquidacion.id,
  });
  res.json(aprobada);
});

const pagoSchema = z.object({ referenciaPago: z.string().optional(), fechaPago: z.string().optional() });

liquidacionesRouter.post("/:id/pagar", soloGestion, async (req, res) => {
  const parsed = pagoSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const liquidacion = await cargarPropia(req.params.id, req.usuario!.organizacionId);
  if (!liquidacion) return res.status(404).json({ error: "No encontrada" });
  if (liquidacion.estado === "BORRADOR") return res.status(409).json({ error: "Apruébala antes de darla por pagada" });
  if (liquidacion.estado === "PAGADA") return res.status(409).json({ error: "Ya estaba pagada" });

  const pagada = await prisma.liquidacion.update({
    where: { id: liquidacion.id },
    data: {
      estado: "PAGADA",
      fechaPago: parsed.data.fechaPago ? new Date(`${parsed.data.fechaPago}T00:00:00`) : new Date(),
      referenciaPago: parsed.data.referenciaPago ?? null,
    },
    include: INCLUDE_LIQ,
  });

  // Los servicios de esas jornadas quedan marcados como pagados al
  // profesional: es el dato que ya existía y que ahora se rellena solo.
  const visitaIds = liquidacion.lineas.map((l) => l.visitaId).filter((v): v is string => v != null);
  if (visitaIds.length > 0) {
    const visitas = await prisma.visita.findMany({ where: { id: { in: visitaIds } }, select: { servicioId: true } });
    await prisma.servicio.updateMany({
      where: { id: { in: Array.from(new Set(visitas.map((v) => v.servicioId))) } },
      data: { pagoProfesionalEstado: "PAGADO" },
    });
  }

  const cuenta = await prisma.usuario.findFirst({ where: { profesionalId: liquidacion.profesionalId }, select: { id: true } });
  if (cuenta) {
    await notificarUsuario(cuenta.id, "liquidacion_pagada", `Pagada tu liquidación de ${liquidacion.mes}: ${Number(pagada.neto).toFixed(2)} €.`);
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: liquidacion.organizacionId,
    accion: "pagar_liquidacion",
    entidadTipo: "Liquidacion",
    entidadId: liquidacion.id,
    detalle: `${Number(pagada.neto).toFixed(2)} €`,
  });
  res.json(pagada);
});

liquidacionesRouter.get("/:id", async (req, res) => {
  const liquidacion = await prisma.liquidacion.findUnique({ where: { id: req.params.id }, include: INCLUDE_LIQ });
  if (!liquidacion) return res.status(404).json({ error: "No encontrada" });
  const usuario = req.usuario!;
  const esSuya = usuario.rol === "PROFESIONAL" && usuario.profesionalId === liquidacion.profesionalId;
  const esGestor = esGestorOrganizacion(usuario) && liquidacion.organizacionId === usuario.organizacionId;
  if (!esSuya && !esGestor) return res.status(403).json({ error: "Sin permiso" });
  if (esSuya && liquidacion.estado === "BORRADOR") return res.status(404).json({ error: "No encontrada" });
  res.json(liquidacion);
});
