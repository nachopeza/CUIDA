import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { firmarToken } from "../lib/jwt.js";
import { registrarAuditoria } from "../services/audit.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Freno a las contraseñas probadas a ciegas: tras varios fallos seguidos de la
// misma cuenta desde el mismo sitio, se para un rato. Vive en memoria (se
// reinicia con el servidor) y cuenta sólo los fallos: entrar bien lo borra.
const MAX_FALLOS = 8;
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map<string, { n: number; desde: number }>();

function claveDeIntento(email: string, ip: string | undefined) {
  return `${email.toLowerCase()}|${ip ?? "?"}`;
}

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });

  const { email, password } = parsed.data;
  const clave = claveDeIntento(email, req.ip);
  const previo = fallos.get(clave);
  if (previo && Date.now() - previo.desde > VENTANA_MS) fallos.delete(clave);
  const vigente = fallos.get(clave);
  if (vigente && vigente.n >= MAX_FALLOS) {
    const minutos = Math.max(1, Math.ceil((vigente.desde + VENTANA_MS - Date.now()) / 60000));
    return res.status(429).json({ error: `Demasiados intentos fallidos. Espera ${minutos} min antes de volver a probar.` });
  }
  const anotarFallo = () => {
    const f = fallos.get(clave) ?? { n: 0, desde: Date.now() };
    fallos.set(clave, { n: f.n + 1, desde: f.desde });
  };

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) {
    anotarFallo();
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const valido = await bcrypt.compare(password, usuario.passwordHash);
  if (!valido) {
    anotarFallo();
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }
  fallos.delete(clave);

  const token = firmarToken({
    sub: usuario.id,
    rol: usuario.rol,
    organizacionId: usuario.organizacionId,
    personaId: usuario.personaId,
    profesionalId: usuario.profesionalId,
  });

  await registrarAuditoria({
    usuarioId: usuario.id,
    organizacionId: usuario.organizacionId,
    accion: "login",
  });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      // El nombre de pila: la cabecera saluda a una persona, no a una
      // dirección de correo. "Buenos días, Laura" y no "coordinadora".
      nombre: usuario.nombre,
      rol: usuario.rol,
      organizacionId: usuario.organizacionId,
      personaId: usuario.personaId,
      profesionalId: usuario.profesionalId,
    },
  });
});
