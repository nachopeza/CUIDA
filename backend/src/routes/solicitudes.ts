import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { puedeAccederPersona, esGestorOrganizacion } from "../services/permisos.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";

export const solicitudesRouter = Router();
solicitudesRouter.use(autenticar);

const crearSolicitudSchema = z.object({
  personaId: z.string().min(1),
  necesidadId: z.string().min(1),
  descripcionLibre: z.string().min(1),
});

// "1. Necesidad" + "2. Solicitud" del caso Herminia: lenguaje humano → dato
// estructurado, trazable con SOL-xxxxxx (sección 3).
solicitudesRouter.post("/", async (req, res) => {
  const parsed = crearSolicitudSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { personaId, necesidadId, descripcionLibre } = parsed.data;

  const permitido = await puedeAccederPersona(req.usuario!, personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso para solicitar por esta persona" });

  if (req.usuario!.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { personaId, usuarioId: req.usuario!.sub, revocadoAt: null },
    });
    if (!relacion?.puedeSolicitar) {
      return res.status(403).json({ error: "El familiar no tiene permiso para solicitar" });
    }
  }

  const persona = await prisma.persona.findUnique({ where: { id: personaId } });
  if (!persona) return res.status(404).json({ error: "Persona no encontrada" });

  const codigo = await generarCodigo("solicitud");
  const solicitud = await prisma.solicitud.create({
    data: {
      codigo,
      descripcionLibre,
      necesidadId,
      personaId,
      organizacionId: persona.organizacionId,
      creadaPorUsuarioId: req.usuario!.sub,
      estado: "BORRADOR",
    },
  });

  await registrarHistorial({
    entidadTipo: "Solicitud",
    estadoAnterior: "BORRADOR",
    estadoNuevo: "BORRADOR",
    motivo: "Creación",
    solicitudId: solicitud.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: persona.organizacionId,
    accion: "crear_solicitud",
    entidadTipo: "Solicitud",
    entidadId: solicitud.id,
  });

  res.status(201).json(solicitud);
});

solicitudesRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  let where: Record<string, unknown> = {};

  if (usuario.rol === "PERSONA") {
    where = { personaId: usuario.personaId ?? "__none__" };
  } else if (usuario.rol === "FAMILIAR") {
    const relaciones = await prisma.familiarRelacion.findMany({
      where: { usuarioId: usuario.sub, revocadoAt: null },
      select: { personaId: true },
    });
    where = { personaId: { in: relaciones.map((r) => r.personaId) } };
  } else if (esGestorOrganizacion(usuario) && usuario.rol !== "SUPERADMIN") {
    where = { organizacionId: usuario.organizacionId ?? "__none__" };
  }

  const solicitudes = await prisma.solicitud.findMany({
    where,
    include: { persona: true, necesidad: true, plan: true, servicio: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(solicitudes);
});

solicitudesRouter.get("/:id", async (req, res) => {
  const solicitud = await prisma.solicitud.findUnique({
    where: { id: req.params.id },
    include: { persona: true, necesidad: true, plan: true, servicio: true, estadoHistorial: { orderBy: { createdAt: "asc" } } },
  });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });

  const permitido = await puedeAccederPersona(req.usuario!, solicitud.personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  res.json(solicitud);
});

const planSchema = z.object({
  fechaInicio: z.string().datetime(),
  fechaFin: z.string().datetime(),
  recurrencia: z.string().optional(),
  franjaHoraria: z.string().optional(),
  tareasPrevistas: z.string().optional(),
  notas: z.string().optional(),
});

// "3. Plan": fechas + horas + tareas → Servicio definido (sección 3 y 6).
solicitudesRouter.post("/:id/plan", async (req, res) => {
  if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const solicitud = await prisma.solicitud.findUnique({ where: { id: req.params.id } });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });
  if (solicitud.organizacionId !== req.usuario!.organizacionId && req.usuario!.rol !== "SUPERADMIN") {
    return res.status(403).json({ error: "Sin permiso" });
  }

  const plan = await prisma.plan.upsert({
    where: { solicitudId: solicitud.id },
    update: {
      ...parsed.data,
      fechaInicio: new Date(parsed.data.fechaInicio),
      fechaFin: new Date(parsed.data.fechaFin),
    },
    create: {
      solicitudId: solicitud.id,
      ...parsed.data,
      fechaInicio: new Date(parsed.data.fechaInicio),
      fechaFin: new Date(parsed.data.fechaFin),
    },
  });

  res.status(201).json(plan);
});

const estadoSchema = z.object({
  estado: z.enum(["ENVIADA", "EN_REVISION", "BUSCANDO", "PROPUESTA", "ACEPTADA", "CANCELADA", "CERRADA"]),
  motivo: z.string().optional(),
});

solicitudesRouter.post("/:id/estado", async (req, res) => {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const solicitud = await prisma.solicitud.findUnique({ where: { id: req.params.id } });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });

  const permitido = await puedeAccederPersona(req.usuario!, solicitud.personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  try {
    validaciones.solicitud(solicitud.estado, parsed.data.estado);
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizada = await prisma.solicitud.update({
    where: { id: solicitud.id },
    data: { estado: parsed.data.estado },
  });

  await registrarHistorial({
    entidadTipo: "Solicitud",
    estadoAnterior: solicitud.estado,
    estadoNuevo: parsed.data.estado,
    motivo: parsed.data.motivo,
    solicitudId: solicitud.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: solicitud.organizacionId,
    accion: "cambiar_estado_solicitud",
    entidadTipo: "Solicitud",
    entidadId: solicitud.id,
    detalle: `${solicitud.estado} → ${parsed.data.estado}`,
  });

  res.json(actualizada);
});

// "Solicitud → Servicio": operación (sección 3). Requiere plan definido y
// solicitud aceptada; crea el Servicio (unidad asignada) en estado PENDIENTE.
solicitudesRouter.post("/:id/servicio", async (req, res) => {
  if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });

  const solicitud = await prisma.solicitud.findUnique({
    where: { id: req.params.id },
    include: { plan: true, servicio: true },
  });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });
  if (solicitud.organizacionId !== req.usuario!.organizacionId && req.usuario!.rol !== "SUPERADMIN") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  if (!solicitud.plan) return res.status(409).json({ error: "La solicitud no tiene plan definido" });
  if (solicitud.servicio) return res.status(409).json({ error: "La solicitud ya tiene servicio" });
  if (solicitud.estado !== "ACEPTADA") {
    return res.status(409).json({ error: "La solicitud debe estar ACEPTADA para generar servicio" });
  }

  const codigo = await generarCodigo("servicio");
  const servicio = await prisma.servicio.create({
    data: {
      codigo,
      solicitudId: solicitud.id,
      organizacionId: solicitud.organizacionId,
      estado: "PENDIENTE",
    },
  });

  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: "PENDIENTE",
    estadoNuevo: "PENDIENTE",
    motivo: "Creación desde solicitud",
    servicioId: servicio.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: solicitud.organizacionId,
    accion: "crear_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
  });

  res.status(201).json(servicio);
});
