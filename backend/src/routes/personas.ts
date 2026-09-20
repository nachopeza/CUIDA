import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { puedeAccederPersona } from "../services/permisos.js";

export const personasRouter = Router();
personasRouter.use(autenticar);

const crearPersonaSchema = z.object({
  nombre: z.string().min(1),
  apellidos: z.string().min(1),
  fechaNacimiento: z.string().datetime().optional(),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  preferencias: z.string().optional(),
});

// Alta de persona (sección 6: alta, identificación permanente...)
personasRouter.post("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = crearPersonaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!req.usuario!.organizacionId) return res.status(400).json({ error: "Usuario sin organización" });

  const codigo = await generarCodigo("persona");
  const persona = await prisma.persona.create({
    data: {
      codigo,
      estado: "ACTIVA",
      organizacionId: req.usuario!.organizacionId,
      ...parsed.data,
      fechaNacimiento: parsed.data.fechaNacimiento ? new Date(parsed.data.fechaNacimiento) : undefined,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "crear_persona",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });

  res.status(201).json(persona);
});

personasRouter.get("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const personas = await prisma.persona.findMany({
    where: { organizacionId: req.usuario!.organizacionId ?? undefined },
    orderBy: { createdAt: "desc" },
  });
  res.json(personas);
});

personasRouter.get("/:id", async (req, res) => {
  const permitido = await puedeAccederPersona(req.usuario!, req.params.id);
  if (!permitido) return res.status(403).json({ error: "Sin permiso para ver esta persona" });

  const persona = await prisma.persona.findUnique({
    where: { id: req.params.id },
    include: { familiares: true },
  });
  if (!persona) return res.status(404).json({ error: "No encontrada" });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "ver_persona",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });

  res.json(persona);
});

const vincularFamiliarSchema = z
  .object({
    usuarioId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    parentesco: z.string().min(1),
    esRepresentante: z.boolean().default(false),
    puedeSolicitar: z.boolean().default(true),
    puedeVerHistorial: z.boolean().default(true),
    puedeVerImportes: z.boolean().default(true),
  })
  .refine((d) => d.usuarioId ?? (d.email && d.password), {
    message: "Indica usuarioId (familiar ya existente) o email+password (familiar nuevo)",
  });

// Vincular familiar/representante autorizado (sección 6: Familia -
// representantes, permisos). Si no existe usuario todavía, se crea aquí
// mismo con rol FAMILIAR — así el coordinador no necesita una pantalla
// aparte de gestión de usuarios para dar de alta a un familiar nuevo.
personasRouter.post("/:id/familiares", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = vincularFamiliarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const permitido = await puedeAccederPersona(req.usuario!, req.params.id);
  if (!permitido) return res.status(403).json({ error: "Sin permiso sobre esta persona" });

  let usuarioId = parsed.data.usuarioId;
  if (!usuarioId && parsed.data.email && parsed.data.password) {
    const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
    if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese email" });
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const usuario = await prisma.usuario.create({
      data: { email: parsed.data.email, passwordHash, rol: "FAMILIAR", organizacionId: req.usuario!.organizacionId },
    });
    usuarioId = usuario.id;
  }

  const relacion = await prisma.familiarRelacion.create({
    data: {
      personaId: req.params.id,
      usuarioId: usuarioId!,
      parentesco: parsed.data.parentesco,
      esRepresentante: parsed.data.esRepresentante,
      puedeSolicitar: parsed.data.puedeSolicitar,
      puedeVerHistorial: parsed.data.puedeVerHistorial,
      puedeVerImportes: parsed.data.puedeVerImportes,
    },
    include: { usuario: { select: { email: true } } },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "vincular_familiar",
    entidadTipo: "Persona",
    entidadId: req.params.id,
  });

  res.status(201).json(relacion);
});
