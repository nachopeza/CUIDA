import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";

// El EQUIPO es el personal interno de la empresa: coordinación,
// administración y cualquier otro puesto de oficina. No presta servicios en
// casa de nadie — eso son los PROFESIONALES, que viven en /profesionales y
// cuya parte laboral está en /personal.
//
// Confundir las dos cosas era el problema: el expediente de una auxiliar de
// ayuda a domicilio y el alta de una administrativa no son la misma gestión
// ni las mira la misma persona.
export const equipoRouter = Router();
equipoRouter.use(autenticar);

const soloGestion = requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN");

const ROLES_INTERNOS = ["COORDINADOR", "ORGANIZACION", "ADMIN"] as const;

equipoRouter.get("/", soloGestion, async (req, res) => {
  const usuario = req.usuario!;
  const miembros = await prisma.usuario.findMany({
    where: { organizacionId: usuario.organizacionId ?? "__none__", rol: { in: [...ROLES_INTERNOS] } },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      puesto: true,
      telefono: true,
      fechaAlta: true,
      fechaBaja: true,
      activo: true,
      createdAt: true,
    },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });
  // Quién eres tú dentro de la lista: no tiene sentido ofrecer "desactivar"
  // sobre tu propia cuenta.
  res.json(miembros.map((m) => ({ ...m, esTu: m.id === usuario.sub })));
});

const crearSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  rol: z.enum(ROLES_INTERNOS).default("COORDINADOR"),
  puesto: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
});

equipoRouter.post("/", soloGestion, async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const usuario = req.usuario!;

  const existe = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
  if (existe) return res.status(409).json({ error: "Ya hay una cuenta con ese correo" });

  const creado = await prisma.usuario.create({
    data: {
      nombre: parsed.data.nombre,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      rol: parsed.data.rol,
      puesto: parsed.data.puesto || null,
      telefono: parsed.data.telefono || null,
      fechaAlta: new Date(),
      organizacionId: usuario.organizacionId,
    },
    select: { id: true, nombre: true, email: true, rol: true, puesto: true, activo: true },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "alta_personal_interno",
    entidadTipo: "Usuario",
    entidadId: creado.id,
    detalle: `${parsed.data.nombre} · ${parsed.data.puesto ?? parsed.data.rol}`,
  });
  res.status(201).json(creado);
});

const editarSchema = z.object({
  nombre: z.string().min(1).optional(),
  rol: z.enum(ROLES_INTERNOS).optional(),
  puesto: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  activo: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

equipoRouter.patch("/:id", soloGestion, async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const usuario = req.usuario!;

  const miembro = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!miembro || miembro.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });
  if (!ROLES_INTERNOS.includes(miembro.rol as (typeof ROLES_INTERNOS)[number])) {
    return res.status(409).json({ error: "Esa cuenta no es de personal interno" });
  }
  // Quitarse a uno mismo el acceso deja la organización sin quien administre.
  if (miembro.id === usuario.sub && parsed.data.activo === false) {
    return res.status(409).json({ error: "No puedes desactivar tu propia cuenta" });
  }

  const actualizado = await prisma.usuario.update({
    where: { id: miembro.id },
    data: {
      nombre: parsed.data.nombre,
      rol: parsed.data.rol,
      puesto: parsed.data.puesto === undefined ? undefined : parsed.data.puesto || null,
      telefono: parsed.data.telefono === undefined ? undefined : parsed.data.telefono || null,
      activo: parsed.data.activo,
      // Dar de baja deja fecha: el expediente tiene que decir desde cuándo.
      fechaBaja: parsed.data.activo === false ? new Date() : parsed.data.activo === true ? null : undefined,
      ...(parsed.data.password ? { passwordHash: await bcrypt.hash(parsed.data.password, 10) } : {}),
    },
    select: { id: true, nombre: true, email: true, rol: true, puesto: true, activo: true, fechaBaja: true },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "editar_personal_interno",
    entidadTipo: "Usuario",
    entidadId: miembro.id,
    detalle: parsed.data.activo === false ? "baja" : parsed.data.activo === true ? "reactivación" : "datos",
  });
  res.json(actualizado);
});
