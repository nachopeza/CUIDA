import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";

export const visitasRouter = Router();
visitasRouter.use(autenticar);

async function cargarVisitaConPermiso(req: Request<{ id: string }>) {
  const visita = await prisma.visita.findUnique({
    where: { id: req.params.id },
    include: { servicio: true },
  });
  if (!visita) return { visita: null, permitido: false };

  const usuario = req.usuario!;
  const esProfesionalPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === visita.servicio.profesionalId;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"].includes(usuario.rol);
  return { visita, permitido: esProfesionalPropio || esGestor };
}

visitasRouter.get("/:id", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const completa = await prisma.visita.findUnique({
    where: { id: visita.id },
    include: { tareas: true, actuaciones: true, incidencias: true, servicio: { include: { solicitud: { include: { persona: true } } } } },
  });
  res.json(completa);
});

// "6. Ejecución": inicio + tareas + observaciones → Visita registrada
// (sección 3). Solo el profesional asignado inicia su propia visita.
visitasRouter.post("/:id/iniciar", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  try {
    validaciones.visita(visita.estado, "EN_CURSO");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizada = await prisma.visita.update({
    where: { id: visita.id },
    data: { estado: "EN_CURSO", horaInicioReal: new Date() },
  });

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: "EN_CURSO",
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "iniciar_visita",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  res.json(actualizada);
});

const finalizarSchema = z.object({ observacion: z.string().optional() });

visitasRouter.post("/:id/finalizar", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const parsed = finalizarSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    validaciones.visita(visita.estado, "FINALIZADA");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizada = await prisma.visita.update({
    where: { id: visita.id },
    data: { estado: "FINALIZADA", horaFinReal: new Date() },
  });

  if (parsed.data.observacion) {
    await prisma.actuacion.create({
      data: { visitaId: visita.id, descripcion: parsed.data.observacion },
    });
  }

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: "FINALIZADA",
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "finalizar_visita",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  res.json(actualizada);
});

const tareaSchema = z.object({ tareaId: z.string().min(1), completada: z.boolean() });

visitasRouter.patch("/:id/tareas", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const parsed = tareaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const tarea = await prisma.tarea.update({
    where: { id: parsed.data.tareaId },
    data: { completada: parsed.data.completada },
  });
  res.json(tarea);
});

const actuacionSchema = z.object({ descripcion: z.string().min(1) });

// "Lo ocurrido" (sección 5): observación libre, nunca diagnóstico clínico.
visitasRouter.post("/:id/actuaciones", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const parsed = actuacionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const actuacion = await prisma.actuacion.create({
    data: { visitaId: visita.id, descripcion: parsed.data.descripcion },
  });
  res.status(201).json(actuacion);
});
