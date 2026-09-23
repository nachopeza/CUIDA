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

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });

  const { email, password } = parsed.data;
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const valido = await bcrypt.compare(password, usuario.passwordHash);
  if (!valido) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

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
