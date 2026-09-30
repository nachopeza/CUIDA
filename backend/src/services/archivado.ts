import { prisma } from "../lib/prisma.js";
import { registrarHistorial } from "./estados.js";

// ---------------------------------------------------------------------------
// Archivar lo que no se puede borrar
//
// Eliminar una solicitud sólo es posible mientras no haya servicio detrás: en
// cuanto lo hay, hay historial operativo y puede haber facturas. Pero "no se
// puede eliminar" dejaba a coordinación con la lista llena de lo ya terminado y
// sin ningún gesto para quitarlo de en medio. Archivar es ese gesto: cierra lo
// que hay que cerrar, deja el rastro y saca el asunto de las listas de trabajo.
//
// Cerrar no es un cambio de etiqueta. Un servicio cancelado con jornadas todavía
// programadas las dejaba en la agenda de la profesional, y la bandeja acababa
// avisando de una "visita no iniciada" de un servicio que ya no existía. Por eso
// primero se retiran las jornadas que no han empezado.
// ---------------------------------------------------------------------------

export class ArchivadoRechazado extends Error {}

const TERMINALES_SERVICIO = ["CERRADO", "CANCELADO"];

// Las jornadas programadas que nadie ha empezado dejan de existir en la agenda.
// Se marcan canceladas y sin cargo: la retirada es una decisión de coordinación,
// no un aviso tardío de la familia, así que no hay porcentaje que cobrar.
export async function retirarJornadasSinEmpezar(servicioId: string, motivo: string): Promise<string[]> {
  const pendientes = await prisma.visita.findMany({
    where: { servicioId, estado: { in: ["PROGRAMADA", "CONFIRMADA"] }, horaInicioReal: null },
    select: { id: true, codigo: true, estado: true },
  });
  for (const v of pendientes) {
    await prisma.visita.update({ where: { id: v.id }, data: { estado: "CANCELADA" } });
    await registrarHistorial({
      entidadTipo: "Visita",
      estadoAnterior: v.estado,
      estadoNuevo: "CANCELADA",
      motivo: `${motivo} · retirada sin cargo`,
      visitaId: v.id,
    });
  }
  return pendientes.map((v) => v.codigo);
}

export async function archivarSolicitud(solicitudId: string, motivo: string): Promise<{ resultado: "CANCELADA" | "CERRADA"; jornadasRetiradas: string[] }> {
  const solicitud = await prisma.solicitud.findUnique({
    where: { id: solicitudId },
    include: { servicio: { include: { visitas: true, incidencias: true } } },
  });
  if (!solicitud) throw new ArchivadoRechazado("Solicitud no encontrada");
  if (["CERRADA", "CANCELADA"].includes(solicitud.estado)) throw new ArchivadoRechazado("Ya está archivada");

  const servicio = solicitud.servicio;

  // Sin servicio detrás: no hay nada operativo que recoger.
  if (!servicio) {
    await prisma.solicitud.update({ where: { id: solicitud.id }, data: { estado: "CANCELADA" } });
    await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: solicitud.estado, estadoNuevo: "CANCELADA", motivo, solicitudId: solicitud.id });
    return { resultado: "CANCELADA", jornadasRetiradas: [] };
  }

  const abiertas = servicio.incidencias.filter((i) => i.tipo === "GENERAL" && !["RESUELTA", "CERRADA"].includes(i.estado));
  if (abiertas.length > 0 && !TERMINALES_SERVICIO.includes(servicio.estado)) {
    throw new ArchivadoRechazado(`Tiene la incidencia ${abiertas[0].codigo} abierta: resuélvela antes de archivar.`);
  }
  if (servicio.visitas.some((v) => v.estado === "EN_CURSO")) {
    throw new ArchivadoRechazado("Hay una jornada abierta ahora mismo: hay que cerrarla antes.");
  }
  const porVerificar = servicio.visitas.filter((v) => ["FINALIZADA", "INCIDENCIA"].includes(v.estado));
  if (porVerificar.length > 0) {
    throw new ArchivadoRechazado(
      `Tiene ${porVerificar.length === 1 ? "1 jornada" : `${porVerificar.length} jornadas`} por verificar: verifícala${porVerificar.length === 1 ? "" : "s"} antes, o se perdería lo que hay que cobrar y pagar.`,
    );
  }

  const conTrabajoHecho = servicio.visitas.some((v) => ["REVISADA", "LIQUIDADA"].includes(v.estado));
  const jornadasRetiradas = await retirarJornadasSinEmpezar(servicio.id, motivo);

  // Sin trabajo hecho es una cancelación; con él, un cierre normal.
  const destinoServicio = conTrabajoHecho || ["FINALIZADO", "VALIDADO"].includes(servicio.estado) ? "CERRADO" : "CANCELADO";

  if (destinoServicio === "CANCELADO") {
    if (!TERMINALES_SERVICIO.includes(servicio.estado)) {
      await prisma.servicio.update({ where: { id: servicio.id }, data: { estado: "CANCELADO", profesionalId: servicio.profesionalId } });
      await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: servicio.estado, estadoNuevo: "CANCELADO", motivo, servicioId: servicio.id });
    }
    await prisma.solicitud.update({ where: { id: solicitud.id }, data: { estado: "CANCELADA" } });
    await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: solicitud.estado, estadoNuevo: "CANCELADA", motivo, solicitudId: solicitud.id });
    return { resultado: "CANCELADA", jornadasRetiradas };
  }

  // Cierre: se recorre la cadena de estados de una en una para que el
  // historial cuente lo que pasó, en vez de saltar de EN_CURSO a CERRADO.
  const camino = ["EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO"];
  let actual = servicio.estado;
  for (const siguiente of camino.slice(Math.max(0, camino.indexOf(actual)) + 1)) {
    await prisma.servicio.update({ where: { id: servicio.id }, data: { estado: siguiente as never } });
    await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: actual, estadoNuevo: siguiente, motivo, servicioId: servicio.id });
    actual = siguiente as typeof actual;
  }
  await prisma.solicitud.update({ where: { id: solicitud.id }, data: { estado: "CERRADA" } });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: solicitud.estado, estadoNuevo: "CERRADA", motivo, solicitudId: solicitud.id });
  return { resultado: "CERRADA", jornadasRetiradas };
}

// Eliminar de verdad —que no quede rastro en las listas— sólo se puede si el
// servicio nunca llegó a existir en la práctica: ninguna jornada empezada, nada
// facturado ni liquidado, ningún documento. Con actividad real hay historial
// contable que conservar (y la ley lo exige): ahí la salida es cancelar/archivar.
export async function eliminarSolicitudSinActividad(solicitudId: string): Promise<{ codigo: string }> {
  const solicitud = await prisma.solicitud.findUnique({
    where: { id: solicitudId },
    include: { servicio: { include: { visitas: true } } },
  });
  if (!solicitud) throw new ArchivadoRechazado("Solicitud no encontrada");
  const servicio = solicitud.servicio;
  const visitas = servicio?.visitas ?? [];
  const visitaIds = visitas.map((v) => v.id);

  if (servicio) {
    const conActividad = visitas.some((v) => v.horaInicioReal || v.facturaId || !["PROGRAMADA", "CONFIRMADA", "CANCELADA"].includes(v.estado));
    if (conActividad) {
      throw new ArchivadoRechazado("Ya hay jornadas trabajadas o facturadas: no se puede borrar, pero sí cancelar o archivar para sacarlo de las listas.");
    }
    const [enFactura, enLiquidacion, documentos] = await Promise.all([
      prisma.lineaFactura.count({ where: { visitaId: { in: visitaIds } } }),
      prisma.lineaLiquidacion.count({ where: { visitaId: { in: visitaIds } } }),
      prisma.documento.count({ where: { OR: [{ servicioId: servicio.id }, { visitaId: { in: visitaIds } }] } }),
    ]);
    if (enFactura + enLiquidacion > 0) throw new ArchivadoRechazado("Tiene importes facturados o liquidados: cancélalo o archívalo, no se puede borrar.");
    if (documentos > 0) throw new ArchivadoRechazado("Tiene documentos adjuntos: cancélalo o archívalo, no se puede borrar.");
  }

  const incidencias = servicio ? await prisma.incidencia.findMany({ where: { servicioId: servicio.id }, select: { id: true } }) : [];
  const incidenciaIds = incidencias.map((i) => i.id);

  await prisma.$transaction([
    prisma.correccionFichaje.deleteMany({ where: { visitaId: { in: visitaIds } } }),
    prisma.actuacion.deleteMany({ where: { visitaId: { in: visitaIds } } }),
    prisma.tarea.deleteMany({ where: { visitaId: { in: visitaIds } } }),
    prisma.estadoHistorial.deleteMany({
      where: {
        OR: [
          { solicitudId },
          ...(servicio ? [{ servicioId: servicio.id }] : []),
          { visitaId: { in: visitaIds } },
          { incidenciaId: { in: incidenciaIds } },
        ],
      },
    }),
    prisma.incidencia.deleteMany({ where: { id: { in: incidenciaIds } } }),
    prisma.visita.deleteMany({ where: { id: { in: visitaIds } } }),
    ...(servicio
      ? [
          prisma.servicioInteres.deleteMany({ where: { servicioId: servicio.id } }),
          prisma.servicio.delete({ where: { id: servicio.id } }),
        ]
      : []),
    prisma.plan.deleteMany({ where: { solicitudId } }),
    prisma.solicitud.delete({ where: { id: solicitudId } }),
  ]);
  return { codigo: solicitud.codigo };
}
