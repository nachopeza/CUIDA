import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion, ocultarTarifaSiProcede } from "../services/permisos.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";

export const incidenciasRouter = Router();
incidenciasRouter.use(autenticar);

const crearSchema = z.object({
  visitaId: z.string().optional(),
  servicioId: z.string().optional(),
  descripcion: z.string().min(1),
  prioridad: z.enum(["BAJA", "MEDIA", "ALTA"]).default("MEDIA"),
});

// "Incidencia: Crear → clasificar → responsable → notificar → resolver/escalar
// → cerrar" (sección 7).
incidenciasRouter.post("/", async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!parsed.data.visitaId && !parsed.data.servicioId) {
    return res.status(400).json({ error: "Debe indicar visitaId o servicioId" });
  }

  let organizacionId: string | undefined;
  if (parsed.data.visitaId) {
    const visita = await prisma.visita.findUnique({ where: { id: parsed.data.visitaId }, include: { servicio: true } });
    if (!visita) return res.status(404).json({ error: "Visita no encontrada" });
    organizacionId = visita.servicio.organizacionId;
  } else if (parsed.data.servicioId) {
    const servicio = await prisma.servicio.findUnique({ where: { id: parsed.data.servicioId } });
    if (!servicio) return res.status(404).json({ error: "Servicio no encontrado" });
    organizacionId = servicio.organizacionId;
  }

  const codigo = await generarCodigo("incidencia");
  const incidencia = await prisma.incidencia.create({
    data: {
      codigo,
      visitaId: parsed.data.visitaId,
      servicioId: parsed.data.servicioId,
      descripcion: parsed.data.descripcion,
      prioridad: parsed.data.prioridad,
      estado: "NUEVA",
    },
  });

  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: "NUEVA",
    estadoNuevo: "NUEVA",
    motivo: "Creación",
    incidenciaId: incidencia.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "crear_incidencia",
    entidadTipo: "Incidencia",
    entidadId: incidencia.id,
  });

  res.status(201).json(incidencia);
});

incidenciasRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  if (esGestorOrganizacion(usuario)) {
    const incidencias = await prisma.incidencia.findMany({
      where:
        usuario.rol === "SUPERADMIN"
          ? {}
          : { OR: [{ servicio: { organizacionId: usuario.organizacionId ?? "__none__" } }, { visita: { servicio: { organizacionId: usuario.organizacionId ?? "__none__" } } }] },
      include: {
        visita: true,
        servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } },
        responsable: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(incidencias);
  }
  if (usuario.rol === "PROFESIONAL") {
    const incidencias = await prisma.incidencia.findMany({
      where: { visita: { servicio: { profesionalId: usuario.profesionalId ?? "__none__" } } },
      include: { visita: true, servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const sinTarifa = incidencias.map((i) => ({ ...i, servicio: ocultarTarifaSiProcede(i.servicio, false) }));
    return res.json(sinTarifa);
  }
  res.json([]);
});

const estadoSchema = z.object({
  estado: z.enum(["EN_REVISION", "ASIGNADA", "EN_RESOLUCION", "RESUELTA", "CERRADA"]),
  responsableUsuarioId: z.string().optional(),
  motivo: z.string().optional(),
});

incidenciasRouter.post("/:id/estado", async (req, res) => {
  if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const incidencia = await prisma.incidencia.findUnique({ where: { id: req.params.id } });
  if (!incidencia) return res.status(404).json({ error: "No encontrada" });

  try {
    validaciones.incidencia(incidencia.estado, parsed.data.estado);
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizada = await prisma.incidencia.update({
    where: { id: incidencia.id },
    data: {
      estado: parsed.data.estado,
      responsableUsuarioId: parsed.data.responsableUsuarioId ?? incidencia.responsableUsuarioId,
    },
  });

  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: incidencia.estado,
    estadoNuevo: parsed.data.estado,
    motivo: parsed.data.motivo,
    incidenciaId: incidencia.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "cambiar_estado_incidencia",
    entidadTipo: "Incidencia",
    entidadId: incidencia.id,
    detalle: `${incidencia.estado} → ${parsed.data.estado}`,
  });

  res.json(actualizada);
});
