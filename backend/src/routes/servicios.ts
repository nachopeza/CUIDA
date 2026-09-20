import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion, puedeVerImportes, ocultarTarifaSiProcede } from "../services/permisos.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";
import { notificarGestores, notificarUsuario } from "../services/notificaciones.js";

export const serviciosRouter = Router();
serviciosRouter.use(autenticar);

const INCLUDE_SERVICIO = {
  solicitud: { include: { persona: true, necesidad: true, plan: true } },
  profesional: true,
  empresaColaboradora: true,
} as const;

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
    include: { ...INCLUDE_SERVICIO, visitas: true },
    orderBy: { createdAt: "desc" },
  });

  // Los importes se ocultan por fila según a quién pertenezca cada servicio
  // (un familiar puede tener el permiso concedido para una persona y no
  // para otra).
  let relacionesVisibles: Set<string> | null = null;
  if (usuario.rol === "FAMILIAR") {
    const relaciones = await prisma.familiarRelacion.findMany({
      where: { usuarioId: usuario.sub, revocadoAt: null, puedeVerImportes: true },
      select: { personaId: true },
    });
    relacionesVisibles = new Set(relaciones.map((r) => r.personaId));
  }

  const resultado = servicios.map((s) => {
    const visible = esGestorOrganizacion(usuario)
      ? true
      : usuario.rol === "FAMILIAR"
        ? (relacionesVisibles?.has(s.solicitud.personaId) ?? false)
        : false;
    return ocultarTarifaSiProcede(s, visible);
  });

  res.json(resultado);
});

// "Debe tener un apartado donde pueda buscar solicitudes de su estilo o
// propuestas" (sección Profesional): servicios sin profesional asignado
// todavía, de la misma organización, para que el profesional se proponga
// en vez de esperar pasivamente a que coordinación le asigne uno.
serviciosRouter.get("/disponibles", requiereRol("PROFESIONAL"), async (req, res) => {
  const usuario = req.usuario!;
  const servicios = await prisma.servicio.findMany({
    where: {
      organizacionId: usuario.organizacionId ?? "__none__",
      estado: "PENDIENTE",
      profesionalId: null,
    },
    include: INCLUDE_SERVICIO,
    orderBy: { createdAt: "desc" },
  });
  // Nunca ve tarifa ni empresa: solo necesita saber qué se pide y cuándo
  // para decidir si le interesa.
  res.json(servicios.map((s) => ocultarTarifaSiProcede(s, false)));
});

const interesSchema = z.object({ mensaje: z.string().optional() });

// Candidatura del profesional a un servicio publicado (sección "sale en la
// búsqueda para ser aceptado... a Carmen le sale una nueva publicación...
// ella acepta"): queda registrada y consultable por coordinación, no es
// solo una notificación que se pierde en la bandeja.
serviciosRouter.post("/:id/interes", requiereRol("PROFESIONAL"), async (req, res) => {
  const parsed = interesSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const usuario = req.usuario!;
  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== usuario.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (servicio.estado !== "PENDIENTE" || servicio.profesionalId) {
    return res.status(409).json({ error: "Este servicio ya no está disponible" });
  }

  const profesional = await prisma.profesional.findUnique({ where: { id: usuario.profesionalId ?? "__none__" } });
  if (!profesional) return res.status(400).json({ error: "Perfil de profesional no encontrado" });

  await prisma.servicioInteres.upsert({
    where: { servicioId_profesionalId: { servicioId: servicio.id, profesionalId: profesional.id } },
    update: { mensaje: parsed.data.mensaje },
    create: { servicioId: servicio.id, profesionalId: profesional.id, mensaje: parsed.data.mensaje },
  });

  await notificarGestores(
    servicio.organizacionId,
    "profesional_interesado",
    `${profesional.nombre} ${profesional.apellidos} está interesada/o en el servicio ${servicio.codigo}.${parsed.data.mensaje ? ` "${parsed.data.mensaje}"` : ""}`,
    servicio.solicitudId,
  );

  res.status(201).json({ ok: true });
});

serviciosRouter.get("/:id", async (req, res) => {
  const servicio = await prisma.servicio.findUnique({
    where: { id: req.params.id },
    include: {
      ...INCLUDE_SERVICIO,
      visitas: { include: { tareas: true, actuaciones: true, incidencias: true } },
      incidencias: true,
      interesados: { include: { profesional: true }, orderBy: { createdAt: "asc" } },
      estadoHistorial: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });

  const usuario = req.usuario!;
  const visible = usuario.rol === "PROFESIONAL" ? false : await puedeVerImportes(usuario, servicio.solicitud.personaId);
  res.json(ocultarTarifaSiProcede(servicio, visible));
});

const tarifaSchema = z.object({
  empresaColaboradoraId: z.string().nullable().optional(),
  tarifaImporte: z.number().nonnegative().nullable().optional(),
  tarifaTipo: z.enum(["PAGADO", "VOLUNTARIO"]).nullable().optional(),
  tarifaNotas: z.string().optional(),
  tipoServicio: z.enum(["PUNTUAL", "RECURRENTE"]).optional(),
});

// Asignar empresa colaboradora y/o estimar tarifa. Solo gestores; nunca
// visible para la persona atendida (sección 4/14).
serviciosRouter.post("/:id/tarifa", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = tarifaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  if (parsed.data.empresaColaboradoraId) {
    const empresa = await prisma.empresaColaboradora.findUnique({ where: { id: parsed.data.empresaColaboradoraId } });
    if (!empresa || empresa.organizacionId !== servicio.organizacionId) {
      return res.status(400).json({ error: "Empresa colaboradora no válida para esta organización" });
    }
  }

  // Comisión de gestión (sección "cobrar por gestión un pequeño
  // porcentaje"): se calcula al fijar/actualizar la tarifa, con el % vigente
  // de la organización, y queda congelada en el servicio.
  let comisionImporte: number | null = null;
  let importeProfesional: number | null = null;
  if (parsed.data.tarifaTipo === "PAGADO" && parsed.data.tarifaImporte != null) {
    const organizacion = await prisma.organizacion.findUnique({ where: { id: servicio.organizacionId } });
    const porcentaje = Number(organizacion?.comisionPorcentaje ?? 15);
    comisionImporte = Math.round(parsed.data.tarifaImporte * (porcentaje / 100) * 100) / 100;
    importeProfesional = Math.round((parsed.data.tarifaImporte - comisionImporte) * 100) / 100;
  }

  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    data: {
      empresaColaboradoraId: parsed.data.empresaColaboradoraId,
      tarifaImporte: parsed.data.tarifaImporte,
      tarifaTipo: parsed.data.tarifaTipo,
      tarifaNotas: parsed.data.tarifaNotas,
      tipoServicio: parsed.data.tipoServicio,
      comisionImporte,
      importeProfesional,
    },
    include: INCLUDE_SERVICIO,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "actualizar_tarifa_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
  });

  res.json(actualizado);
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

  const profesional = await prisma.profesional.findUnique({ where: { id: parsed.data.profesionalId }, include: { usuario: true } });
  if (!profesional || profesional.organizacionId !== servicio.organizacionId) {
    return res.status(400).json({ error: "Profesional no válido para esta organización" });
  }

  try {
    validaciones.servicio(servicio.estado, "ASIGNADO");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  // Autorrelleno: si la profesional trabaja para una empresa colaboradora
  // (no es independiente) y el servicio no tenía ya una empresa asignada,
  // se copia — la coordinadora puede cambiarla luego a mano si hace falta.
  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    data: {
      estado: "ASIGNADO",
      profesionalId: profesional.id,
      empresaColaboradoraId: servicio.empresaColaboradoraId ?? profesional.empresaColaboradoraId ?? undefined,
    },
    include: INCLUDE_SERVICIO,
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

  if (profesional.usuario) {
    await notificarUsuario(
      profesional.usuario.id,
      "propuesta_servicio",
      `Te han propuesto el servicio ${servicio.codigo}. Revísalo y acéptalo si puedes cubrirlo.`,
      servicio.solicitudId,
    );
  }

  res.json(actualizado);
});

// Aceptación explícita (sección: "espera que la cuidadora o empresa la
// acepte"). Solo el propio profesional asignado puede confirmar — la
// coordinación propone, pero no puede aceptar en su nombre.
serviciosRouter.post("/:id/aceptar", requiereRol("PROFESIONAL"), async (req, res) => {
  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.profesionalId !== req.usuario!.profesionalId) {
    return res.status(403).json({ error: "Este servicio no te ha sido propuesto a ti" });
  }

  try {
    validaciones.servicio(servicio.estado, "CONFIRMADO");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizado = await prisma.servicio.update({ where: { id: servicio.id }, data: { estado: "CONFIRMADO" } });

  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: servicio.estado,
    estadoNuevo: "CONFIRMADO",
    motivo: "Aceptado por el profesional",
    servicioId: servicio.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "aceptar_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
  });

  await notificarGestores(
    servicio.organizacionId,
    "servicio_aceptado",
    `El profesional ha aceptado el servicio ${servicio.codigo}.`,
    servicio.solicitudId,
  ).catch(
    () => undefined,
  );

  res.json(actualizado);
});

const estadoSchema = z.object({
  estado: z.enum(["EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO", "CANCELADO"]),
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

  // Bug conocido (sección "veo un bug... puede estar aceptada, en curso e
  // incidencia a la vez"): un servicio no puede darse por FINALIZADO,
  // VALIDADO ni CERRADO mientras tenga una incidencia general abierta — debe
  // resolverse (o clasificarse como no bloqueante) antes de seguir avanzando,
  // para que el estado del servicio sea siempre una fuente única de verdad.
  if (["FINALIZADO", "VALIDADO", "CERRADO"].includes(parsed.data.estado)) {
    const incidenciaAbierta = await prisma.incidencia.findFirst({
      where: {
        servicioId: servicio.id,
        tipo: "GENERAL",
        estado: { notIn: ["RESUELTA", "CERRADA"] },
      },
    });
    if (incidenciaAbierta) {
      return res.status(409).json({
        error: `No se puede pasar a ${parsed.data.estado} con la incidencia ${incidenciaAbierta.codigo} todavía abierta. Resuélvela primero.`,
      });
    }
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

// ---------------------------------------------------------------------------
// Cancelación: la persona/familiar pide cancelar, coordinación corrobora y
// decide (no es un botón directo — "manda una alerta a coordinación y lo
// corrobora con Herminia o con familiar").
// ---------------------------------------------------------------------------

const solicitarCancelacionSchema = z.object({ motivo: z.string().optional() });

serviciosRouter.post("/:id/solicitar-cancelacion", async (req, res) => {
  const parsed = solicitarCancelacionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id }, include: { solicitud: true } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });

  const usuario = req.usuario!;
  const esPersonaPropia = usuario.rol === "PERSONA" && usuario.personaId === servicio.solicitud.personaId;
  let esFamiliarAutorizado = false;
  if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { personaId: servicio.solicitud.personaId, usuarioId: usuario.sub, revocadoAt: null, puedeSolicitar: true },
    });
    esFamiliarAutorizado = relacion !== null;
  }
  if (!esPersonaPropia && !esFamiliarAutorizado && !esGestorOrganizacion(usuario)) {
    return res.status(403).json({ error: "Sin permiso" });
  }

  const yaPendiente = await prisma.incidencia.findFirst({
    where: { servicioId: servicio.id, tipo: "SOLICITUD_CANCELACION", estado: { notIn: ["RESUELTA", "CERRADA"] } },
  });
  if (yaPendiente) return res.status(409).json({ error: "Ya hay una solicitud de cancelación pendiente para este servicio" });

  const codigo = await generarCodigo("incidencia");
  const incidencia = await prisma.incidencia.create({
    data: {
      codigo,
      tipo: "SOLICITUD_CANCELACION",
      servicioId: servicio.id,
      descripcion: parsed.data.motivo ? `Solicitud de cancelación: ${parsed.data.motivo}` : "Solicitud de cancelación del servicio",
      prioridad: "ALTA",
      estado: "NUEVA",
    },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: servicio.organizacionId,
    accion: "solicitar_cancelacion_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
  });

  await notificarGestores(
    servicio.organizacionId,
    "solicitud_cancelacion",
    `Piden cancelar el servicio ${servicio.codigo}. Confírmalo con la persona o su familia antes de cancelar.`,
    servicio.solicitudId,
  );

  res.status(201).json(incidencia);
});

const resolverCancelacionSchema = z.object({ motivo: z.string().optional() });

async function encontrarCancelacionPendiente(servicioId: string) {
  return prisma.incidencia.findFirst({
    where: { servicioId, tipo: "SOLICITUD_CANCELACION", estado: { notIn: ["RESUELTA", "CERRADA"] } },
  });
}

// Coordinación corrobora con la persona/familia y confirma: el servicio (y
// su solicitud) pasan a CANCELADO/CANCELADA.
serviciosRouter.post("/:id/confirmar-cancelacion", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = resolverCancelacionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id }, include: { solicitud: true } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const incidencia = await encontrarCancelacionPendiente(servicio.id);
  if (!incidencia) return res.status(409).json({ error: "No hay ninguna solicitud de cancelación pendiente" });

  try {
    validaciones.servicio(servicio.estado, "CANCELADO");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  await prisma.servicio.update({ where: { id: servicio.id }, data: { estado: "CANCELADO" } });
  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: servicio.estado,
    estadoNuevo: "CANCELADO",
    motivo: parsed.data.motivo ?? "Cancelación confirmada por coordinación",
    servicioId: servicio.id,
  });

  await prisma.solicitud.update({ where: { id: servicio.solicitudId }, data: { estado: "CANCELADA" } }).catch(() => undefined);

  await prisma.incidencia.update({ where: { id: incidencia.id }, data: { estado: "RESUELTA" } });
  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: incidencia.estado,
    estadoNuevo: "RESUELTA",
    motivo: "Cancelación confirmada",
    incidenciaId: incidencia.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "confirmar_cancelacion_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
  });

  const personaConUsuario = await prisma.persona.findUnique({ where: { id: servicio.solicitud.personaId }, include: { usuario: true } });
  if (personaConUsuario?.usuario) {
    await notificarUsuario(personaConUsuario.usuario.id, "cancelacion_confirmada", `Tu servicio ${servicio.codigo} ha sido cancelado.`, servicio.solicitudId);
  }
  const familiares = await prisma.familiarRelacion.findMany({
    where: { personaId: servicio.solicitud.personaId, revocadoAt: null },
    select: { usuarioId: true },
  });
  for (const f of familiares) {
    await notificarUsuario(f.usuarioId, "cancelacion_confirmada", `El servicio ${servicio.codigo} ha sido cancelado.`, servicio.solicitudId);
  }

  res.json({ ok: true });
});

// Coordinación habla con la persona/familia y decide NO cancelar.
serviciosRouter.post("/:id/rechazar-cancelacion", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const incidencia = await encontrarCancelacionPendiente(servicio.id);
  if (!incidencia) return res.status(409).json({ error: "No hay ninguna solicitud de cancelación pendiente" });

  await prisma.incidencia.update({ where: { id: incidencia.id }, data: { estado: "RESUELTA" } });
  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: incidencia.estado,
    estadoNuevo: "RESUELTA",
    motivo: "Cancelación rechazada: el servicio continúa",
    incidenciaId: incidencia.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "rechazar_cancelacion_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Pago al profesional/empresa: "pasados los días la profesional recibe su
// salario si es que recibía una compensación por ello" — distinto de la
// tarifa cobrada a la familia, solo tiene sentido si tarifaTipo = PAGADO.
// ---------------------------------------------------------------------------

serviciosRouter.post("/:id/pago", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (servicio.tarifaTipo !== "PAGADO") {
    return res.status(409).json({ error: "Este servicio no tiene una compensación pagada asociada" });
  }
  if (servicio.pagoProfesionalEstado === "PAGADO") {
    return res.status(409).json({ error: "Ya está marcado como pagado" });
  }

  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    data: { pagoProfesionalEstado: "PAGADO" },
    include: INCLUDE_SERVICIO,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "marcar_pago_profesional",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
  });

  res.json(actualizado);
});
