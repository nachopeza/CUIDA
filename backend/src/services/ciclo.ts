import { prisma } from "../lib/prisma.js";
import { registrarHistorial, TRANSICIONES_SERVICIO } from "./estados.js";
import { notificarUsuario, notificarGestores } from "./notificaciones.js";
import { retirarJornadasSinEmpezar } from "./archivado.js";

// ---------------------------------------------------------------------------
// La vida de un servicio, de punta a punta
//
//   PENDIENTE → ASIGNADO → CONFIRMADO → EN_CURSO → FINALIZADO → VALIDADO → CERRADO
//                                          ↘ CANCELADO (desde cualquiera de las anteriores al cierre)
//
// Cada paso lo empuja un hecho, no un botón que alguien tenga que acordarse de
// pulsar:
//
//   la primera jornada que se ficha     → EN_CURSO
//   todo verificado (o se da por terminado) → FINALIZADO → VALIDADO
//   la familia ha pagado y la profesional ha cobrado → CERRADO
//
// Antes el servicio se quedaba en CONFIRMADO al fichar, y desde ahí no podía
// llegar a FINALIZADO: nadie podía terminarlo, ni siquiera después de facturar y
// pagar. La solicitud quedaba «aceptada» para siempre.
// ---------------------------------------------------------------------------

async function pasarA(servicioId: string, desde: string, hacia: string, motivo: string) {
  if (!(TRANSICIONES_SERVICIO[desde] ?? []).includes(hacia)) return false;
  await prisma.servicio.update({ where: { id: servicioId }, data: { estado: hacia as never } });
  await registrarHistorial({ entidadTipo: "Servicio", estadoAnterior: desde, estadoNuevo: hacia, motivo, servicioId });
  return true;
}

// Se ficha la primera jornada: el servicio deja de estar «confirmado» y pasa a
// estar en marcha.
export async function servicioEnCurso(servicioId: string): Promise<void> {
  const s = await prisma.servicio.findUnique({ where: { id: servicioId }, select: { estado: true } });
  if (s?.estado === "CONFIRMADO") await pasarA(servicioId, "CONFIRMADO", "EN_CURSO", "Primera jornada fichada");
}

// Cierra la solicitud junto con el servicio: una solicitud «aceptada» detrás de
// un servicio ya cerrado es una fila que nunca sale de las listas de trabajo.
async function cerrarSolicitud(solicitudId: string, servicioEstado: "CERRADO" | "CANCELADO", motivo: string) {
  const solicitud = await prisma.solicitud.findUnique({ where: { id: solicitudId }, select: { estado: true } });
  if (!solicitud || ["CERRADA", "CANCELADA"].includes(solicitud.estado)) return;
  const nuevo = servicioEstado === "CANCELADO" ? "CANCELADA" : "CERRADA";
  await prisma.solicitud.update({ where: { id: solicitudId }, data: { estado: nuevo } });
  await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: solicitud.estado, estadoNuevo: nuevo, motivo, solicitudId });
}

// Todo lo hecho está verificado y no hay una incidencia abierta que lo impida:
// el servicio pasa a FINALIZADO y VALIDADO. Sirve tanto para un puntual —que
// termina solo— como para un servicio al que se le ha dado fin.
export async function avanzarSiEstaVerificado(servicioId: string): Promise<void> {
  const s = await prisma.servicio.findUnique({
    where: { id: servicioId },
    include: { visitas: true, incidencias: true },
  });
  if (!s) return;
  const abiertas = s.visitas.filter((v) => ["PROGRAMADA", "CONFIRMADA", "EN_CURSO", "FINALIZADA", "INCIDENCIA"].includes(v.estado));
  const incidencia = s.incidencias.some((i) => i.tipo === "GENERAL" && !["RESUELTA", "CERRADA"].includes(i.estado));
  if (incidencia || s.visitas.length === 0) return;

  // Un recurrente sigue esperando más jornadas mientras nadie lo dé por
  // terminado: sólo avanza si ya está FINALIZADO (lo terminó coordinación).
  if (s.tipoServicio === "RECURRENTE" && s.estado !== "FINALIZADO") return;
  if (abiertas.length > 0) return;

  let estado: string = s.estado;
  for (const siguiente of ["EN_CURSO", "FINALIZADO", "VALIDADO"]) {
    if (estado === siguiente) continue;
    if (!(await pasarA(servicioId, estado, siguiente, "Todo lo hecho está verificado"))) continue;
    estado = siguiente;
  }
  await cerrarSiProcede(servicioId);
}

// El último paso es el dinero: se cierra cuando la familia ha pagado lo
// facturado y la profesional ha cobrado lo suyo. Cerrarlo antes escondería un
// cobro pendiente; no cerrarlo nunca dejaba servicios terminados para siempre.
export async function cerrarSiProcede(servicioId: string): Promise<boolean> {
  const s = await prisma.servicio.findUnique({
    where: { id: servicioId },
    include: { visitas: { include: { factura: { select: { estado: true } } } } },
  });
  if (!s || s.estado !== "VALIDADO") return false;

  const conCobro = s.tarifaTipo === "PAGADO" ? s.visitas.filter((v) => Number(v.importeCliente ?? 0) > 0) : [];
  if (conCobro.some((v) => !v.facturaId || v.factura?.estado !== "PAGADA")) return false;

  const conPago = s.tarifaTipo === "PAGADO" ? s.visitas.filter((v) => Number(v.importeProfesional ?? 0) > 0) : [];
  if (conPago.length > 0) {
    const lineas = await prisma.lineaLiquidacion.findMany({
      where: { visitaId: { in: conPago.map((v) => v.id) } },
      include: { liquidacion: { select: { estado: true } } },
    });
    const pagadas = new Set(lineas.filter((l) => l.liquidacion.estado === "PAGADA").map((l) => l.visitaId));
    if (conPago.some((v) => !pagadas.has(v.id))) return false;
  }

  await pasarA(servicioId, "VALIDADO", "CERRADO", "Cobrado a la familia y pagado a la profesional");
  await cerrarSolicitud(s.solicitudId, "CERRADO", "Servicio cerrado");
  return true;
}

export class CicloRechazado extends Error {}

// Dar por terminado un servicio en marcha —el caso normal de un recurrente que
// se acaba—: no se generan más jornadas, las que nadie ha empezado salen de la
// agenda y el servicio sigue su camino hasta cerrarse cuando esté todo verificado,
// cobrado y pagado. No se termina con una jornada abierta ni con una incidencia
// abierta: primero se resuelven.
export async function terminarServicio(servicioId: string, motivo: string): Promise<{ jornadasRetiradas: string[]; estado: string }> {
  const s = await prisma.servicio.findUnique({
    where: { id: servicioId },
    include: { visitas: true, incidencias: true, solicitud: { include: { plan: true } } },
  });
  if (!s) throw new CicloRechazado("Servicio no encontrado");
  if (!["CONFIRMADO", "EN_CURSO"].includes(s.estado)) {
    throw new CicloRechazado(
      s.estado === "PENDIENTE" || s.estado === "ASIGNADO"
        ? "Todavía no ha empezado: si ya no hace falta, cancélalo."
        : "Este servicio ya está terminado o cancelado.",
    );
  }
  if (s.visitas.some((v) => v.estado === "EN_CURSO")) throw new CicloRechazado("Hay una jornada abierta ahora mismo: hay que cerrarla antes.");
  const incidencia = s.incidencias.find((i) => i.tipo === "GENERAL" && !["RESUELTA", "CERRADA"].includes(i.estado));
  if (incidencia) throw new CicloRechazado(`Tiene la incidencia ${incidencia.codigo} abierta: resuélvela antes de terminar.`);
  const conTrabajo = s.visitas.some((v) => ["FINALIZADA", "INCIDENCIA", "REVISADA", "LIQUIDADA"].includes(v.estado));
  if (!conTrabajo) throw new CicloRechazado("Todavía no se ha hecho ninguna jornada: si ya no hace falta, cancélalo.");

  const retiradas = await retirarJornadasSinEmpezar(s.id, motivo);
  // Que no vuelva a generar jornadas: el plan termina hoy.
  if (s.solicitud.plan && !s.solicitud.plan.fechaFin) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    await prisma.plan.update({ where: { id: s.solicitud.plan.id }, data: { fechaFin: hoy } });
  }

  let estado: string = s.estado;
  if (estado === "CONFIRMADO") {
    await pasarA(s.id, "CONFIRMADO", "EN_CURSO", motivo);
    estado = "EN_CURSO";
  }
  await pasarA(s.id, "EN_CURSO", "FINALIZADO", motivo);
  await avanzarSiEstaVerificado(s.id);
  const despues = await prisma.servicio.findUnique({ where: { id: s.id }, select: { estado: true } });
  return { jornadasRetiradas: retiradas, estado: despues?.estado ?? "FINALIZADO" };
}

// Cancelar un servicio: sale de la agenda de la profesional, se cancela su
// solicitud y se avisa a quien estaba esperando. Lo ya trabajado se conserva y
// se cobra; lo que no había empezado se retira sin cargo.
export async function cancelarServicio(servicioId: string, motivo: string): Promise<{ jornadasRetiradas: string[] }> {
  const s = await prisma.servicio.findUnique({
    where: { id: servicioId },
    include: { visitas: true, solicitud: { include: { persona: { include: { usuario: true } } } }, profesional: { include: { usuario: true } } },
  });
  if (!s) throw new CicloRechazado("Servicio no encontrado");
  if (["CANCELADO", "CERRADO"].includes(s.estado)) throw new CicloRechazado("Este servicio ya está cerrado.");
  if (s.visitas.some((v) => v.estado === "EN_CURSO")) throw new CicloRechazado("Hay una jornada abierta ahora mismo: hay que cerrarla antes de cancelar.");
  if (!(TRANSICIONES_SERVICIO[s.estado] ?? []).includes("CANCELADO")) {
    throw new CicloRechazado("Ya se ha hecho trabajo y está pendiente de verificar o de cobrar: ciérralo en vez de cancelarlo.");
  }

  const retiradas = await retirarJornadasSinEmpezar(s.id, motivo);
  await pasarA(s.id, s.estado, "CANCELADO", motivo);
  await cerrarSolicitud(s.solicitudId, "CANCELADO", motivo);

  // Las incidencias abiertas de un servicio que ya no existe no piden nada a
  // nadie: se cierran, no se quedan en la bandeja para siempre.
  const abiertas = await prisma.incidencia.findMany({ where: { servicioId: s.id, estado: { notIn: ["RESUELTA", "CERRADA"] } } });
  for (const i of abiertas) {
    await prisma.incidencia.update({ where: { id: i.id }, data: { estado: "RESUELTA" } });
    await registrarHistorial({ entidadTipo: "Incidencia", estadoAnterior: i.estado, estadoNuevo: "RESUELTA", motivo: "Servicio cancelado", incidenciaId: i.id });
  }

  const aviso = `El servicio ${s.codigo} se ha cancelado${motivo ? `: ${motivo}` : "."}`;
  if (s.profesional?.usuario) await notificarUsuario(s.profesional.usuario.id, "servicio_cancelado", aviso, s.solicitudId).catch(() => undefined);
  if (s.solicitud.persona.usuario) await notificarUsuario(s.solicitud.persona.usuario.id, "servicio_cancelado", aviso, s.solicitudId).catch(() => undefined);
  const familiares = await prisma.familiarRelacion.findMany({ where: { personaId: s.solicitud.personaId, revocadoAt: null }, select: { usuarioId: true } });
  for (const f of familiares) await notificarUsuario(f.usuarioId, "servicio_cancelado", aviso, s.solicitudId).catch(() => undefined);
  await notificarGestores(s.organizacionId, "servicio_cancelado", aviso, s.solicitudId).catch(() => undefined);
  return { jornadasRetiradas: retiradas };
}

async function serviciosDe(visitaIds: string[]): Promise<string[]> {
  if (visitaIds.length === 0) return [];
  const visitas = await prisma.visita.findMany({ where: { id: { in: visitaIds } }, select: { servicioId: true } });
  return Array.from(new Set(visitas.map((v) => v.servicioId)));
}

// Tras cobrar una factura o pagar una liquidación: los servicios de esas
// jornadas pueden haber completado ya su ciclo.
export async function cierreTrasMovimiento(visitaIds: string[]): Promise<void> {
  for (const id of await serviciosDe(visitaIds)) await cerrarSiProcede(id);
}

// «Pagado a la profesional» sólo cuando TODA su parte del servicio está en
// liquidaciones pagadas. Marcarlo con la primera liquidación de un recurrente
// decía «pagado» con meses todavía por pagar.
export async function marcarPagoProfesional(visitaIds: string[]): Promise<void> {
  for (const servicioId of await serviciosDe(visitaIds)) {
    const s = await prisma.servicio.findUnique({ where: { id: servicioId }, include: { visitas: true } });
    if (!s) continue;
    const trabajadas = s.visitas.filter((v) => ["FINALIZADA", "INCIDENCIA", "REVISADA", "LIQUIDADA"].includes(v.estado) && Number(v.importeProfesional ?? 0) > 0);
    const lineas = await prisma.lineaLiquidacion.findMany({
      where: { visitaId: { in: trabajadas.map((v) => v.id) } },
      include: { liquidacion: { select: { estado: true } } },
    });
    const pagadas = new Set(lineas.filter((l) => l.liquidacion.estado === "PAGADA").map((l) => l.visitaId));
    const todoPagado = trabajadas.every((v) => pagadas.has(v.id));
    // Un recurrente en marcha sigue teniendo jornadas por hacer y por pagar.
    const enMarcha = s.tipoServicio === "RECURRENTE" && ["CONFIRMADO", "EN_CURSO"].includes(s.estado);
    if (todoPagado && !enMarcha) await prisma.servicio.update({ where: { id: servicioId }, data: { pagoProfesionalEstado: "PAGADO" } });
  }
}
