import type { NextFunction, Request, Response } from "express";
import { verificarToken, type TokenPayload } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: TokenPayload;
    }
  }
}

// El acceso a información personal debe estar justificado y limitado a lo
// necesario (AEPD, sección 4/14). Este middleware solo identifica quién hace
// la petición; cada ruta decide qué datos concretos puede ver ese rol.
// Una baja o una cuenta desactivada tiene que cortar el acceso ya, no cuando
// caduque la sesión (12 h). Se comprueba en cada petición con una memoria de unos
// segundos para no ir a la base de datos por cada una.
const CADUCIDAD_ESTADO_MS = 15_000;
const estadoCuenta = new Map<string, { activo: boolean; hasta: number }>();

async function cuentaActiva(usuarioId: string): Promise<boolean> {
  const guardado = estadoCuenta.get(usuarioId);
  if (guardado && guardado.hasta > Date.now()) return guardado.activo;
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { activo: true } });
  const activo = u?.activo ?? false;
  estadoCuenta.set(usuarioId, { activo, hasta: Date.now() + CADUCIDAD_ESTADO_MS });
  return activo;
}

export async function autenticar(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  let payload: TokenPayload;
  try {
    payload = verificarToken(header.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: "Token inválido o caducado" });
  }
  try {
    if (!(await cuentaActiva(payload.sub))) {
      return res.status(401).json({ error: "Cuenta desactivada" });
    }
  } catch (err) {
    return next(err);
  }
  req.usuario = payload;
  next();
}

export function requiereRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) return res.status(401).json({ error: "No autenticado" });
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "Sin permiso para esta acción" });
    }
    next();
  };
}
