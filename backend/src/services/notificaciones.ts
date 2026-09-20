import { prisma } from "../lib/prisma.js";

// Avisos a coordinación: nueva solicitud, cancelación pedida, etc. Se crea
// una Notificacion por cada usuario gestor de la organización (sección 6:
// "Notificaciones: recordatorios, ... alertas").
export async function notificarGestores(organizacionId: string, tipo: string, mensaje: string) {
  const gestores = await prisma.usuario.findMany({
    where: { organizacionId, rol: { in: ["COORDINADOR", "ORGANIZACION", "ADMIN"] }, activo: true },
    select: { id: true },
  });
  if (gestores.length === 0) return;
  await prisma.notificacion.createMany({
    data: gestores.map((g) => ({ usuarioId: g.id, tipo, mensaje })),
  });
}

export async function notificarUsuario(usuarioId: string, tipo: string, mensaje: string) {
  await prisma.notificacion.create({ data: { usuarioId, tipo, mensaje } });
}
