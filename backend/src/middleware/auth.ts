import type { NextFunction, Request, Response } from "express";
import { verificarToken, type TokenPayload } from "../lib/jwt.js";

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
export function autenticar(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  try {
    req.usuario = verificarToken(header.slice("Bearer ".length));
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o caducado" });
  }
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
