import { prisma } from "../lib/prisma.js";

// A qué ficha lleva el aviso al pincharlo. Antes solo se sabía apuntar a una
// solicitud y el resto de notificaciones nacían muertas: se pinchaban y no
// pasaba nada.
export type Referencia = { tipo: "Solicitud" | "Incidencia"; id: string };

function referenciaDe(ref?: Referencia | string) {
  // Se admite el id de solicitud suelto por compatibilidad con las llamadas
  // que ya existían.
  if (!ref) return { entidadTipo: undefined, entidadId: undefined };
  if (typeof ref === "string") return { entidadTipo: "Solicitud", entidadId: ref };
  return { entidadTipo: ref.tipo, entidadId: ref.id };
}

// Avisos a coordinación: nueva solicitud, cancelación pedida, etc. Se crea
// una Notificacion por cada usuario gestor de la organización (sección 6:
// "Notificaciones: recordatorios, ... alertas").
export async function notificarGestores(organizacionId: string, tipo: string, mensaje: string, ref?: Referencia | string) {
  const gestores = await prisma.usuario.findMany({
    where: { organizacionId, rol: { in: ["COORDINADOR", "ORGANIZACION", "ADMIN"] }, activo: true },
    select: { id: true },
  });
  if (gestores.length === 0) return;
  const { entidadTipo, entidadId } = referenciaDe(ref);
  await prisma.notificacion.createMany({
    data: gestores.map((g) => ({ usuarioId: g.id, tipo, mensaje, entidadTipo, entidadId })),
  });
}

export async function notificarUsuario(usuarioId: string, tipo: string, mensaje: string, ref?: Referencia | string) {
  const { entidadTipo, entidadId } = referenciaDe(ref);
  await prisma.notificacion.create({ data: { usuarioId, tipo, mensaje, entidadTipo, entidadId } });
}
