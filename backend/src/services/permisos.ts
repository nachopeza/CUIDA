import { prisma } from "../lib/prisma.js";
import type { TokenPayload } from "../lib/jwt.js";

// Matriz de roles/permisos (sección 4). Minimización: el acceso a una
// persona concreta requiere ser la propia persona, un familiar autorizado no
// revocado, o pertenecer a la organización que la atiende.
export async function puedeAccederPersona(usuario: TokenPayload, personaId: string): Promise<boolean> {
  if (usuario.rol === "SUPERADMIN") return true;
  if (usuario.rol === "PERSONA") return usuario.personaId === personaId;

  if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { personaId, usuarioId: usuario.sub, revocadoAt: null },
    });
    return relacion !== null;
  }

  if (usuario.rol === "COORDINADOR" || usuario.rol === "ORGANIZACION" || usuario.rol === "ADMIN") {
    const persona = await prisma.persona.findUnique({ where: { id: personaId } });
    return persona?.organizacionId === usuario.organizacionId;
  }

  return false;
}

export function esGestorOrganizacion(usuario: TokenPayload): boolean {
  return ["COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"].includes(usuario.rol);
}

export function scopeOrganizacion(usuario: TokenPayload): { organizacionId: string } | {} {
  if (usuario.rol === "SUPERADMIN") return {};
  return { organizacionId: usuario.organizacionId ?? "__none__" };
}
