import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion, ocultarTarifaSiProcede } from "../services/permisos.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";
import { notificarGestores, notificarUsuario } from "../services/notificaciones.js";
import { motivoParaNoAsignar } from "../services/asignacion.js";

export const incidenciasRouter = Router();
incidenciasRouter.use(autenticar);

const MOTIVOS = ["SALUD", "ACCESO", "AUSENCIA", "RETRASO", "TRATO", "MATERIAL", "HORARIO", "HORAS", "OTRO"] as const;

const crearSchema = z.object({
  visitaId: z.string().optional(),
  servicioId: z.string().optional(),
  motivo: z.enum(MOTIVOS).default("OTRO"),
  descripcion: z.string().min(1),
  prioridad: z.enum(["BAJA", "MEDIA", "ALTA"]).default("MEDIA"),
});

// "Incidencia: Crear → clasificar → responsable → notificar → resolver/escalar
// → cerrar" (sección 7). Solo coordinación o el profesional dueño de la
// visita/servicio puede abrir una — evita incidencias sueltas de terceros
// sin relación con el caso.
incidenciasRouter.post("/", async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!parsed.data.visitaId && !parsed.data.servicioId) {
    return res.status(400).json({ error: "Debe indicar visitaId o servicioId" });
  }

  const usuario = req.usuario!;
  let organizacionId: string | undefined;
  let profesionalIdDueño: string | null | undefined;
  if (parsed.data.visitaId) {
    const visita = await prisma.visita.findUnique({ where: { id: parsed.data.visitaId }, include: { servicio: true } });
    if (!visita) return res.status(404).json({ error: "Visita no encontrada" });
    organizacionId = visita.servicio.organizacionId;
    profesionalIdDueño = visita.servicio.profesionalId;
  } else if (parsed.data.servicioId) {
    const servicio = await prisma.servicio.findUnique({ where: { id: parsed.data.servicioId } });
    if (!servicio) return res.status(404).json({ error: "Servicio no encontrado" });
    organizacionId = servicio.organizacionId;
    profesionalIdDueño = servicio.profesionalId;
  }

  const esProfesionalDueño = usuario.rol === "PROFESIONAL" && usuario.profesionalId != null && usuario.profesionalId === profesionalIdDueño;
  if (!esProfesionalDueño && !esGestorOrganizacion(usuario)) {
    return res.status(403).json({ error: "Sin permiso" });
  }

  const codigo = await generarCodigo("incidencia");
  const incidencia = await prisma.incidencia.create({
    data: {
      codigo,
      visitaId: parsed.data.visitaId,
      servicioId: parsed.data.servicioId,
      motivo: parsed.data.motivo,
      descripcion: parsed.data.descripcion,
      prioridad: parsed.data.prioridad,
      estado: "NUEVA",
      creadoPorUsuarioId: usuario.sub,
    },
  });

  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: "NUEVA",
    estadoNuevo: "NUEVA",
    motivo: `Creación · ${parsed.data.motivo}`,
    incidenciaId: incidencia.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "crear_incidencia",
    entidadTipo: "Incidencia",
    entidadId: incidencia.id,
  });

  // Que coordinación se entere sin tener que mirar la pestaña, y que el aviso
  // abra la ficha de la incidencia al pincharlo. Si la abre la propia
  // coordinación no tiene sentido avisarse a sí misma.
  if (organizacionId && esProfesionalDueño) {
    const cuenta = await prisma.usuario.findUnique({ where: { id: usuario.sub }, select: { nombre: true, email: true } });
    const quien = cuenta?.nombre ?? cuenta?.email ?? "Un profesional";
    await notificarGestores(
      organizacionId,
      "incidencia_abierta",
      `${quien} ha abierto la incidencia ${incidencia.codigo}: ${parsed.data.descripcion}`,
      { tipo: "Incidencia", id: incidencia.id },
    );
  }

  res.status(201).json(incidencia);
});

// El caso de una incidencia puede colgar del servicio o de la jornada. El
// listado tiene que resolver la persona por los dos caminos: si no, una
// incidencia abierta por un profesional desde su jornada salía sin nombre.
const CASO_EN_LISTADO = {
  servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } },
  visita: { include: { servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } } } },
} as const;

// Tapar la tarifa venga por donde venga el servicio.
function sinTarifa<T extends { servicio?: unknown; visita?: { servicio?: unknown } | null }>(incidencia: T) {
  return {
    ...incidencia,
    servicio: ocultarTarifaSiProcede(incidencia.servicio as Record<string, unknown> | null, false),
    visita: incidencia.visita
      ? { ...incidencia.visita, servicio: ocultarTarifaSiProcede(incidencia.visita.servicio as Record<string, unknown> | null, false) }
      : incidencia.visita,
  };
}

incidenciasRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  if (esGestorOrganizacion(usuario)) {
    const incidencias = await prisma.incidencia.findMany({
      where:
        usuario.rol === "SUPERADMIN"
          ? {}
          : { OR: [{ servicio: { organizacionId: usuario.organizacionId ?? "__none__" } }, { visita: { servicio: { organizacionId: usuario.organizacionId ?? "__none__" } } }] },
      include: { ...CASO_EN_LISTADO, responsable: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json(incidencias);
  }
  if (usuario.rol === "PROFESIONAL") {
    const incidencias = await prisma.incidencia.findMany({
      where: { visita: { servicio: { profesionalId: usuario.profesionalId ?? "__none__" } } },
      include: CASO_EN_LISTADO,
      orderBy: { createdAt: "desc" },
    });
    return res.json(incidencias.map(sinTarifa));
  }
  // Familiar/persona (sección panel familiar: "menú con... incidencias"):
  // solo las de las personas a las que tiene acceso, nunca la tarifa.
  if (usuario.rol === "FAMILIAR" || usuario.rol === "PERSONA") {
    const personaIds =
      usuario.rol === "PERSONA"
        ? [usuario.personaId ?? "__none__"]
        : (
            await prisma.familiarRelacion.findMany({
              where: { usuarioId: usuario.sub, revocadoAt: null },
              select: { personaId: true },
            })
          ).map((r) => r.personaId);

    const incidencias = await prisma.incidencia.findMany({
      where: {
        OR: [{ servicio: { solicitud: { personaId: { in: personaIds } } } }, { visita: { servicio: { solicitud: { personaId: { in: personaIds } } } } }],
      },
      include: CASO_EN_LISTADO,
      orderBy: { createdAt: "desc" },
    });
    return res.json(incidencias.map(sinTarifa));
  }
  res.json([]);
});

async function cargarIncidenciaConPermiso(id: string, usuario: NonNullable<Express.Request["usuario"]>) {
  // La ficha trae todo el contexto del caso, no solo la descripción: de qué
  // servicio y solicitud viene, quién es la persona atendida, qué profesional
  // la tiene asignada, qué jornada se vio afectada y quién abrió el aviso.
  // Antes había que salir a buscar cada dato en otra pestaña.
  // Del profesional solo lo que sirve para localizarle: el DNI y la cuenta
  // bancaria no pintan nada en una incidencia.
  const profesionalIdentificativo = {
    select: { id: true, codigo: true, nombre: true, apellidos: true, telefono: true, foto: true, usuario: { select: { email: true } } },
  } as const;
  const contextoServicio = {
    profesional: profesionalIdentificativo,
    solicitud: { include: { persona: true, necesidad: true, plan: true, creadaPor: { select: { id: true, nombre: true, email: true, rol: true } } } },
  } as const;
  const incidencia = await prisma.incidencia.findUnique({
    where: { id },
    include: {
      visita: { include: { profesional: profesionalIdentificativo, servicio: { include: contextoServicio } } },
      servicio: { include: contextoServicio },
      responsable: true,
      creadoPor: { select: { id: true, nombre: true, email: true, rol: true } },
      estadoHistorial: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!incidencia) return { incidencia: null, permitido: false };

  const profesionalIdDueño = incidencia.visita?.servicio.profesionalId ?? incidencia.servicio?.profesionalId;
  const esProfesionalDueño = usuario.rol === "PROFESIONAL" && usuario.profesionalId != null && usuario.profesionalId === profesionalIdDueño;
  return { incidencia, permitido: esProfesionalDueño || esGestorOrganizacion(usuario) };
}

// Ficha completa de la incidencia (sección "se debe poder abrir el panel,
// escribir anotaciones o cambiar el estado más dinámicamente"): historial
// incluido, para verlo todo en un único sitio en vez de una card plana.
incidenciasRouter.get("/:id", async (req, res) => {
  const { incidencia, permitido } = await cargarIncidenciaConPermiso(req.params.id, req.usuario!);
  if (!incidencia) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });
  // El servicio puede venir directo o colgando de la jornada: hay que tapar
  // la tarifa en los dos sitios, no solo en el primero.
  const veTarifa = esGestorOrganizacion(req.usuario!);
  res.json({
    ...incidencia,
    servicio: ocultarTarifaSiProcede(incidencia.servicio, veTarifa),
    visita: incidencia.visita ? { ...incidencia.visita, servicio: ocultarTarifaSiProcede(incidencia.visita.servicio, veTarifa) } : incidencia.visita,
  });
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

const cerrarSchema = z.object({ motivo: z.string().optional() });

// Cerrar de un tirón. El pipeline obliga a pasar por revisión, asignación,
// resolución y cierre, y eso está bien cuando la incidencia se trabaja; pero
// muchas se resuelven de una llamada y obligar a dar cinco pasos para
// archivarlas hacía que nadie las cerrara y la bandeja no bajara nunca.
// El salto queda escrito en el historial, así que no se pierde de dónde venía.
incidenciasRouter.post("/:id/cerrar", async (req, res) => {
  if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });
  const parsed = cerrarSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const incidencia = await prisma.incidencia.findUnique({ where: { id: req.params.id } });
  if (!incidencia) return res.status(404).json({ error: "No encontrada" });
  if (incidencia.estado === "CERRADA") return res.status(409).json({ error: "Esta incidencia ya está cerrada" });

  // Una petición de cancelación no se cierra a mano: se confirma o se
  // rechaza, y eso lo hace el servicio.
  if (incidencia.tipo === "SOLICITUD_CANCELACION") {
    return res.status(409).json({
      error: `${incidencia.codigo} es una petición de cancelación de la familia: confírmala o recházala desde el servicio`,
    });
  }

  const actualizada = await prisma.incidencia.update({ where: { id: incidencia.id }, data: { estado: "CERRADA" } });

  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: incidencia.estado,
    estadoNuevo: "CERRADA",
    motivo: parsed.data.motivo ?? "Cerrada directamente por coordinación",
    incidenciaId: incidencia.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "cambiar_estado_incidencia",
    entidadTipo: "Incidencia",
    entidadId: incidencia.id,
    detalle: `${incidencia.estado} → CERRADA`,
  });

  res.json(actualizada);
});

const asignarSchema = z.object({ responsableUsuarioId: z.string().nullable() });

// A quién le toca. Se podía mandar junto al cambio de estado pero no había
// forma de hacerlo solo, así que en el listado nunca ponía de quién era.
incidenciasRouter.post("/:id/asignar", async (req, res) => {
  if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });
  const parsed = asignarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const incidencia = await prisma.incidencia.findUnique({ where: { id: req.params.id } });
  if (!incidencia) return res.status(404).json({ error: "No encontrada" });

  let nombre = "nadie";
  if (parsed.data.responsableUsuarioId) {
    const usuario = await prisma.usuario.findUnique({ where: { id: parsed.data.responsableUsuarioId } });
    if (!usuario || usuario.organizacionId !== req.usuario!.organizacionId) {
      return res.status(400).json({ error: "Esa persona no es de esta organización" });
    }
    nombre = usuario.nombre ?? usuario.email;
  }

  const actualizada = await prisma.incidencia.update({
    where: { id: incidencia.id },
    data: { responsableUsuarioId: parsed.data.responsableUsuarioId },
    include: { responsable: true },
  });

  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: incidencia.estado,
    estadoNuevo: incidencia.estado,
    motivo: `Asignada a ${nombre}`,
    incidenciaId: incidencia.id,
  });

  res.json(actualizada);
});

const notaSchema = z.object({ nota: z.string().min(1) });

// Anotación sin cambiar de estado (sección "se debe poder... escribir
// anotaciones"): reutiliza el propio EstadoHistorial como bitácora — misma
// entrada estadoAnterior/estadoNuevo, para que quede en el mismo hilo
// cronológico que los cambios de estado sin forzar una transición.
incidenciasRouter.post("/:id/nota", async (req, res) => {
  const { incidencia, permitido } = await cargarIncidenciaConPermiso(req.params.id, req.usuario!);
  if (!incidencia) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const parsed = notaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: incidencia.estado,
    estadoNuevo: incidencia.estado,
    motivo: parsed.data.nota,
    incidenciaId: incidencia.id,
  });

  res.status(201).json({ ok: true });
});

// Borrado en bloque desde el listado, como en el resto de ventanas. Una
// incidencia de cancelación no se borra: es la petición de la familia y su
// rastro, y borrarla dejaría el servicio esperando una respuesta que ya nadie
// va a dar. Para esas, el camino es resolverla o rechazarla.
incidenciasRouter.delete("/:id", async (req, res) => {
  const { incidencia, permitido } = await cargarIncidenciaConPermiso(req.params.id, req.usuario!);
  if (!incidencia) return res.status(404).json({ error: "No encontrada" });
  if (!permitido || !esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });

  if (incidencia.tipo === "SOLICITUD_CANCELACION") {
    return res.status(409).json({
      error: `${incidencia.codigo} es una petición de cancelación de la familia: confírmala o recházala, no se borra`,
    });
  }

  await prisma.$transaction([
    prisma.estadoHistorial.deleteMany({ where: { incidenciaId: incidencia.id } }),
    prisma.incidencia.delete({ where: { id: incidencia.id } }),
  ]);

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "eliminar_incidencia",
    entidadTipo: "Incidencia",
    entidadId: incidencia.id,
    detalle: incidencia.codigo,
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Tramitar la incidencia: buscar quien vaya
//
// Una incidencia de "no fue nadie" o de "está de baja" no se resuelve
// escribiendo una nota: se resuelve mandando a otra persona. Aquí es donde eso
// pasa, en la misma pantalla en la que se está mirando el problema, con las
// mismas comprobaciones que en cualquier asignación —papeles, encargo de
// tratamiento, ausencias—, porque un reemplazo de urgencia es justo cuando más
// fácil es saltárselas.
// ---------------------------------------------------------------------------

const reemplazoSchema = z.object({
  profesionalId: z.string(),
  // Reprogramar la jornada perdida: a veces se puede ir esa misma tarde.
  recuperarJornada: z.boolean().optional(),
  fechaRecuperacion: z.string().optional(),
  nota: z.string().max(500).optional(),
});

incidenciasRouter.post("/:id/reemplazo", async (req, res) => {
  if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });
  const parsed = reemplazoSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const incidencia = await prisma.incidencia.findUnique({
    where: { id: req.params.id },
    include: { servicio: { include: { solicitud: { include: { persona: true, plan: true } } } }, visita: true },
  });
  if (!incidencia) return res.status(404).json({ error: "No encontrada" });
  const servicio = incidencia.servicio;
  if (!servicio) return res.status(409).json({ error: "Esta incidencia no cuelga de ningún servicio, así que no hay a quién reemplazar" });
  const organizacionId = req.usuario!.organizacionId!;
  if (servicio.organizacionId !== organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const anterior = servicio.profesionalId ? await prisma.profesional.findUnique({ where: { id: servicio.profesionalId } }) : null;
  if (anterior?.id === parsed.data.profesionalId) {
    return res.status(400).json({ error: "Ese profesional es el que ya estaba: elige a otra persona" });
  }

  const fechaRecuperacion = parsed.data.fechaRecuperacion ? new Date(parsed.data.fechaRecuperacion) : incidencia.visita?.fecha ?? null;
  const impedimento = await motivoParaNoAsignar(parsed.data.profesionalId, organizacionId, fechaRecuperacion);
  if (impedimento) return res.status(409).json({ error: impedimento });

  const nuevo = await prisma.profesional.findUnique({ where: { id: parsed.data.profesionalId }, include: { usuario: true } });
  if (!nuevo) return res.status(400).json({ error: "Profesional no válido" });

  // El servicio pasa al sustituto, y con él las jornadas que todavía no han
  // empezado. Las ya trabajadas siguen contando para quien las hizo: su
  // liquidación no se toca.
  await prisma.servicio.update({
    where: { id: servicio.id },
    data: { profesionalId: nuevo.id, empresaColaboradoraId: nuevo.empresaColaboradoraId ?? servicio.empresaColaboradoraId ?? undefined },
  });
  const traspasadas = await prisma.visita.updateMany({
    where: { servicioId: servicio.id, estado: { in: ["PROGRAMADA", "CONFIRMADA"] }, horaInicioReal: null },
    data: { profesionalId: nuevo.id },
  });

  // Recuperar la jornada perdida es crear una nueva, no reescribir la que no
  // se hizo: aquel día no fue nadie y eso queda como pasó.
  let recuperada: { codigo: string; fecha: Date } | null = null;
  if (parsed.data.recuperarJornada && incidencia.visita) {
    const fecha = fechaRecuperacion ?? incidencia.visita.fecha;
    const creada = await prisma.visita.create({
      data: {
        codigo: await generarCodigo("visita"),
        fecha,
        horaInicioProg: incidencia.visita.horaInicioProg,
        horaFinProg: incidencia.visita.horaFinProg,
        estado: "PROGRAMADA",
        servicioId: servicio.id,
        profesionalId: nuevo.id,
      },
    });
    recuperada = { codigo: creada.codigo, fecha: creada.fecha };
  }

  const resumen =
    `Reemplazo: ${anterior ? `${anterior.nombre} ${anterior.apellidos}` : "sin asignar"} → ${nuevo.nombre} ${nuevo.apellidos}` +
    (traspasadas.count > 0 ? ` · ${traspasadas.count} jornada(s) sin empezar pasan al sustituto` : "") +
    (recuperada ? ` · jornada recuperada ${recuperada.codigo} el ${recuperada.fecha.toLocaleDateString("es-ES")}` : "") +
    (parsed.data.nota ? ` · ${parsed.data.nota}` : "");

  // La incidencia pasa a "en resolución", no a cerrada: queda avisar a la
  // familia, y eso lo dice una persona cuando lo ha hecho.
  const siguiente = incidencia.estado === "CERRADA" ? incidencia.estado : "EN_RESOLUCION";
  const actualizada = await prisma.incidencia.update({
    where: { id: incidencia.id },
    data: { estado: siguiente as never },
    include: { servicio: { include: { profesional: true } }, visita: true },
  });

  await registrarHistorial({
    entidadTipo: "Incidencia",
    estadoAnterior: incidencia.estado,
    estadoNuevo: siguiente,
    motivo: resumen,
    incidenciaId: incidencia.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "reemplazo_por_incidencia",
    entidadTipo: "Incidencia",
    entidadId: incidencia.id,
    detalle: resumen,
  });

  if (nuevo.usuario) {
    await notificarUsuario(
      nuevo.usuario.id,
      "propuesta_servicio",
      `Te han asignado el servicio de ${servicio.solicitud.persona.nombre} como reemplazo${recuperada ? ` y una jornada el ${recuperada.fecha.toLocaleDateString("es-ES")}` : ""}. Revísalo.`,
      servicio.solicitudId,
    );
  }

  res.json({ incidencia: actualizada, resumen, traspasadas: traspasadas.count, recuperada });
});
