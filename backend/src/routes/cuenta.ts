import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion } from "../services/permisos.js";

// Gestión de la propia cuenta y, para gestores, de otras cuentas de
// coordinación (sección "poder gestionar el perfil de coordinación. Y crear
// otros perfiles de coordinación y demás").
export const cuentaRouter = Router();
cuentaRouter.use(autenticar);

cuentaRouter.get("/me", async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario!.sub },
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
  });
  if (!usuario) return res.status(404).json({ error: "No encontrado" });
  res.json(usuario);
});

const editarMeSchema = z.object({
  nombre: z.string().min(1).optional(),
  email: z.string().email().optional(),
  passwordActual: z.string().optional(),
  passwordNueva: z.string().min(6).optional(),
});

cuentaRouter.patch("/me", async (req, res) => {
  const parsed = editarMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.sub } });
  if (!usuario) return res.status(404).json({ error: "No encontrado" });

  const datos: { nombre?: string; email?: string; passwordHash?: string } = {};
  if (parsed.data.nombre) datos.nombre = parsed.data.nombre;
  if (parsed.data.email && parsed.data.email !== usuario.email) {
    const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
    if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese email" });
    datos.email = parsed.data.email;
  }
  if (parsed.data.passwordNueva) {
    if (!parsed.data.passwordActual || !(await bcrypt.compare(parsed.data.passwordActual, usuario.passwordHash))) {
      return res.status(400).json({ error: "La contraseña actual no es correcta" });
    }
    datos.passwordHash = await bcrypt.hash(parsed.data.passwordNueva, 10);
  }

  const actualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: datos,
    select: { id: true, nombre: true, email: true, rol: true, activo: true },
  });

  await registrarAuditoria({
    usuarioId: usuario.id,
    organizacionId: usuario.organizacionId,
    accion: "editar_mi_perfil",
    entidadTipo: "Usuario",
    entidadId: usuario.id,
  });

  res.json(actualizado);
});

// Otras cuentas de coordinación de la misma organización (sección "crear
// otros perfiles de coordinación"): cualquier gestor puede ver/crear, igual
// que ya puede dar de alta personas o profesionales.
cuentaRouter.get("/coordinadores", async (req, res) => {
  const usuario = req.usuario!;
  if (!esGestorOrganizacion(usuario)) return res.status(403).json({ error: "Sin permiso" });

  const coordinadores = await prisma.usuario.findMany({
    where: { organizacionId: usuario.organizacionId ?? "__none__", rol: { in: ["COORDINADOR", "ORGANIZACION", "ADMIN"] } },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(coordinadores);
});

const crearCoordinadorSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

cuentaRouter.post("/coordinadores", async (req, res) => {
  const usuario = req.usuario!;
  if (!esGestorOrganizacion(usuario)) return res.status(403).json({ error: "Sin permiso" });
  if (!usuario.organizacionId) return res.status(400).json({ error: "Usuario sin organización" });

  const parsed = crearCoordinadorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
  if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese email" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const nuevo = await prisma.usuario.create({
    data: {
      nombre: parsed.data.nombre,
      email: parsed.data.email,
      passwordHash,
      rol: "COORDINADOR",
      organizacionId: usuario.organizacionId,
    },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "crear_coordinador",
    entidadTipo: "Usuario",
    entidadId: nuevo.id,
  });

  res.status(201).json(nuevo);
});

const editarCoordinadorSchema = z.object({ nombre: z.string().min(1).optional(), activo: z.boolean().optional() });

cuentaRouter.patch("/coordinadores/:id", async (req, res) => {
  const usuario = req.usuario!;
  if (!esGestorOrganizacion(usuario)) return res.status(403).json({ error: "Sin permiso" });

  const parsed = editarCoordinadorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const objetivo = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!objetivo || objetivo.organizacionId !== usuario.organizacionId || !["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(objetivo.rol)) {
    return res.status(404).json({ error: "No encontrado" });
  }
  if (objetivo.id === usuario.sub && parsed.data.activo === false) {
    return res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
  }

  const actualizado = await prisma.usuario.update({
    where: { id: objetivo.id },
    data: parsed.data,
    select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
  });
  res.json(actualizado);
});

cuentaRouter.post("/coordinadores/:id/password", async (req, res) => {
  const usuario = req.usuario!;
  if (!esGestorOrganizacion(usuario)) return res.status(403).json({ error: "Sin permiso" });

  const objetivo = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!objetivo || objetivo.organizacionId !== usuario.organizacionId || !["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(objetivo.rol)) {
    return res.status(404).json({ error: "No encontrado" });
  }

  const passwordGenerada = Math.random().toString(36).slice(2, 10);
  const passwordHash = await bcrypt.hash(passwordGenerada, 10);
  await prisma.usuario.update({ where: { id: objetivo.id }, data: { passwordHash } });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "resetear_password_coordinador",
    entidadTipo: "Usuario",
    entidadId: objetivo.id,
  });

  res.json({ email: objetivo.email, passwordGenerada });
});
