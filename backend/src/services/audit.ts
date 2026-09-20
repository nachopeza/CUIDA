import { prisma } from "../lib/prisma.js";

interface RegistrarAuditoriaInput {
  usuarioId?: string | null;
  organizacionId?: string | null;
  accion: string;
  entidadTipo?: string;
  entidadId?: string;
  detalle?: string;
}

// Auditoría de solo-inserción: quién, cuándo, qué acción (sección 6 y 14).
// La AEPD advierte que incluso un acceso interno no autorizado puede
// constituir una brecha, así que registramos también accesos de lectura a
// datos sensibles, no solo escrituras.
export async function registrarAuditoria(input: RegistrarAuditoriaInput) {
  await prisma.auditLog.create({
    data: {
      usuarioId: input.usuarioId ?? null,
      organizacionId: input.organizacionId ?? null,
      accion: input.accion,
      entidadTipo: input.entidadTipo,
      entidadId: input.entidadId,
      detalle: input.detalle,
    },
  });
}
