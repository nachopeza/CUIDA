import { prisma } from "../lib/prisma.js";

// Máquinas de estado de la sección 8. Cada transición debe registrar quién,
// cuándo, estado anterior, nuevo estado y motivo — aquí solo el qué/cuándo/
// motivo vía EstadoHistorial; el "quién" lo registra el AuditLog del llamador.

// "Se acepta y entra a buscar un profesional": aceptar es una única acción
// desde ENVIADA, no una cadena de pasos intermedios que haya que ir
// pulsando uno a uno — la búsqueda de profesional ocurre después, a nivel
// de Servicio (PENDIENTE → interesados/asignar → ASIGNADO), no aquí.
// EN_REVISION/BUSCANDO/PROPUESTA se conservan solo por compatibilidad con
// historiales ya guardados en esos estados.
export const TRANSICIONES_SOLICITUD: Record<string, string[]> = {
  BORRADOR: ["ENVIADA", "CANCELADA"],
  ENVIADA: ["ACEPTADA", "CANCELADA"],
  EN_REVISION: ["ACEPTADA", "CANCELADA"],
  BUSCANDO: ["ACEPTADA", "CANCELADA"],
  PROPUESTA: ["ACEPTADA", "CANCELADA"],
  ACEPTADA: ["CERRADA"],
  CANCELADA: [],
  CERRADA: [],
};

export const TRANSICIONES_SERVICIO: Record<string, string[]> = {
  PENDIENTE: ["ASIGNADO", "CANCELADO"],
  ASIGNADO: ["CONFIRMADO", "PENDIENTE", "CANCELADO"],
  CONFIRMADO: ["EN_CURSO", "CANCELADO"],
  EN_CURSO: ["FINALIZADO", "CANCELADO"],
  FINALIZADO: ["VALIDADO"],
  VALIDADO: ["CERRADO"],
  CERRADO: [],
  CANCELADO: [],
};

export const TRANSICIONES_VISITA: Record<string, string[]> = {
  PROGRAMADA: ["CONFIRMADA", "EN_CURSO"],
  CONFIRMADA: ["EN_CURSO"],
  EN_CURSO: ["FINALIZADA", "INCIDENCIA"],
  FINALIZADA: ["REVISADA"],
  INCIDENCIA: ["FINALIZADA", "REVISADA"],
  REVISADA: [],
};

export const TRANSICIONES_INCIDENCIA: Record<string, string[]> = {
  NUEVA: ["EN_REVISION"],
  EN_REVISION: ["ASIGNADA"],
  ASIGNADA: ["EN_RESOLUCION"],
  EN_RESOLUCION: ["RESUELTA"],
  RESUELTA: ["CERRADA"],
  CERRADA: [],
};

export class TransicionInvalidaError extends Error {
  constructor(entidad: string, desde: string, hasta: string) {
    super(`Transición no permitida en ${entidad}: ${desde} → ${hasta}`);
  }
}

function validarTransicion(mapa: Record<string, string[]>, entidad: string, desde: string, hasta: string) {
  if (desde === hasta) return;
  const permitidas = mapa[desde] ?? [];
  if (!permitidas.includes(hasta)) {
    throw new TransicionInvalidaError(entidad, desde, hasta);
  }
}

export async function registrarHistorial(params: {
  entidadTipo: "Solicitud" | "Servicio" | "Visita" | "Incidencia";
  estadoAnterior: string;
  estadoNuevo: string;
  motivo?: string;
  solicitudId?: string;
  servicioId?: string;
  visitaId?: string;
  incidenciaId?: string;
}) {
  await prisma.estadoHistorial.create({
    data: {
      entidadTipo: params.entidadTipo,
      estadoAnterior: params.estadoAnterior,
      estadoNuevo: params.estadoNuevo,
      motivo: params.motivo,
      solicitudId: params.solicitudId,
      servicioId: params.servicioId,
      visitaId: params.visitaId,
      incidenciaId: params.incidenciaId,
    },
  });
}

export const validaciones = {
  solicitud: (desde: string, hasta: string) => validarTransicion(TRANSICIONES_SOLICITUD, "Solicitud", desde, hasta),
  servicio: (desde: string, hasta: string) => validarTransicion(TRANSICIONES_SERVICIO, "Servicio", desde, hasta),
  visita: (desde: string, hasta: string) => validarTransicion(TRANSICIONES_VISITA, "Visita", desde, hasta),
  incidencia: (desde: string, hasta: string) => validarTransicion(TRANSICIONES_INCIDENCIA, "Incidencia", desde, hasta),
};
