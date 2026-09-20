import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion } from "../services/permisos.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";

export const serviciosRouter = Router();
serviciosRouter.use(autenticar);

serviciosRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  let where: Record<string, unknown> = {};

  if (usuario.rol === "PROFESIONAL") {
    where = { profesionalId: usuario.profesionalId ?? "__none__" };
  } else if (usuario.rol === "PERSONA") {
    where = { solicitud: { personaId: usuario.personaId ?? "__none__" } };
  } else if (esGestorOrganizacion(usuario) && usuario.rol !== "SUPERADMIN") {
    where = { organizacionId: usuario.organizacionId ?? "__none__" };
  }

  const servicios = await prisma.servicio.findMany({
    where,
    include: { solicitud: { include: { persona: true, necesidad: true, plan: true } }, profesional: true, visitas: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(servicios);
});

serviciosRouter.get("/:id", async (req, res) => {
  const servicio = await prisma.servicio.findUnique({
    where: { id: req.params.id },
    include: {
      solicitud: { include: { persona: true, necesidad: true, plan: true } },
      profesional: true,
      visitas: { include: { tareas: true, actuaciones: true, incidencias: true } },
      incidencias: true,
    },
  });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  res.json(servicio);
});

const asignarSchema = z.object({ profesionalId: z.string().min(1) });

// Motor de asignación P0: manual (sección 10). El coordinador ve candidatos
// (vía GET /profesionales) y selecciona; el sistema registra el resultado.
serviciosRouter.post("/:id/asignar", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = asignarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const profesional = await prisma.profesional.findUnique({ where: { id: parsed.data.profesionalId } });
  if (!profesional || profesional.organizacionId !== servicio.organizacionId) {
    return res.status(400).json({ error: "Profesional no válido para esta organización" });
  }

  try {
    validaciones.servicio(servicio.estado, "ASIGNADO");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    data: { estado: "ASIGNADO", profesionalId: profesional.id },
  });

  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: servicio.estado,
    estadoNuevo: "ASIGNADO",
    motivo: `Asignado a ${profesional.codigo}`,
    servicioId: servicio.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "asignar_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
    detalle: profesional.codigo,
  });

  res.json(actualizado);
});

const estadoSchema = z.object({
  estado: z.enum(["CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO"]),
  motivo: z.string().optional(),
});

serviciosRouter.post("/:id/estado", async (req, res) => {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });

  const usuario = req.usuario!;
  const esProfesionalPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === servicio.profesionalId;
  if (!esProfesionalPropio && !esGestorOrganizacion(usuario)) {
    return res.status(403).json({ error: "Sin permiso" });
  }

  try {
    validaciones.servicio(servicio.estado, parsed.data.estado);
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    data: { estado: parsed.data.estado },
  });

  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: servicio.estado,
    estadoNuevo: parsed.data.estado,
    motivo: parsed.data.motivo,
    servicioId: servicio.id,
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: servicio.organizacionId,
    accion: "cambiar_estado_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
    detalle: `${servicio.estado} → ${parsed.data.estado}`,
  });

  res.json(actualizado);
});

const crearVisitaSchema = z.object({
  fecha: z.string().datetime(),
  horaInicioProg: z.string().optional(),
  horaFinProg: z.string().optional(),
  tareas: z.array(z.string()).default([]),
});

// Agenda: crear visitas programadas para un servicio confirmado (sección 6/9).
serviciosRouter.post("/:id/visitas", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = crearVisitaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const codigo = await generarCodigo("visita");
  const visita = await prisma.visita.create({
    data: {
      codigo,
      fecha: new Date(parsed.data.fecha),
      horaInicioProg: parsed.data.horaInicioProg,
      horaFinProg: parsed.data.horaFinProg,
      servicioId: servicio.id,
      estado: "PROGRAMADA",
      tareas: { create: parsed.data.tareas.map((descripcion) => ({ descripcion })) },
    },
    include: { tareas: true },
  });

  res.status(201).json(visita);
});
