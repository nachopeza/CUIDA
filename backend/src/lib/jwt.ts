import jwt from "jsonwebtoken";

// Con el secreto por defecto cualquiera puede fabricarse un token de coordinación:
// en producción no se arranca sin uno propio.
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("Falta JWT_SECRET: en producción hay que definir un secreto propio para firmar las sesiones.");
}
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

export interface TokenPayload {
  sub: string; // usuarioId
  rol: string;
  organizacionId: string | null;
  personaId: string | null;
  profesionalId: string | null;
}

export function firmarToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function verificarToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
