import { prisma } from "../lib/prisma.js";

// Avisos a coordinación: nueva solicitud, cancelación pedida, etc. Se crea
// una Notificacion por cada usuario gestor de la organización (sección 6:
// "Notificaciones: recordatorios, ... alertas"). `solicitudId`, cuando se
// indica, permite que el frontend abra directamente la ficha de la
// solicitud al pinchar la notificación (vista unificada solicitud+servicio).
export async function notificarGestores(organizacionId: string, tipo: string, mensaje: string, solicitudId?: string) {
  const gestores = await prisma.usuario.findMany({
    where: { organizacionId, rol: { in: ["COORDINADOR", "ORGANIZACION", "ADMIN"] }, activo: true },
    select: { id: true },
  });
  if (gestores.length === 0) return;
  await prisma.notificacion.createMany({
    data: gestores.map((g) => ({
      usuarioId: g.id,
      tipo,
      mensaje,
      entidadTipo: solicitudId ? "Solicitud" : undefined,
      entidadId: solicitudId,
    })),
  });
}

export async function notificarUsuario(usuarioId: string, tipo: string, mensaje: string, solicitudId?: string) {
  await prisma.notificacion.create({
    data: { usuarioId, tipo, mensaje, entidadTipo: solicitudId ? "Solicitud" : undefined, entidadId: solicitudId },
  });
}
