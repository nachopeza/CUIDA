import { Router } from "express";
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

const vincularFamiliarSchema = z.object({
  usuarioId: z.string().min(1),
  parentesco: z.string().min(1),
  esRepresentante: z.boolean().default(false),
  puedeSolicitar: z.boolean().default(true),
  puedeVerHistorial: z.boolean().default(true),
});

// Vincular familiar/representante autorizado (sección 6: Familia -
// representantes, permisos).
personasRouter.post("/:id/familiares", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = vincularFamiliarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const permitido = await puedeAccederPersona(req.usuario!, req.params.id);
  if (!permitido) return res.status(403).json({ error: "Sin permiso sobre esta persona" });

  const relacion = await prisma.familiarRelacion.create({
    data: { personaId: req.params.id, ...parsed.data },
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
