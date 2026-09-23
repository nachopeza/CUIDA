import { Router } from "express";
import { calcularReparto, minutosEntre } from "../services/economia.js";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { puedeAccederPersona, esGestorOrganizacion, filtrarEconomia, puedeVerImportes } from "../services/permisos.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";
import { notificarGestores, notificarUsuario } from "../services/notificaciones.js";
import { asegurarSesiones, sincronizarSesionesConPlan } from "../services/sesiones.js";

export const solicitudesRouter = Router();
solicitudesRouter.use(autenticar);

const crearSolicitudSchema = z.object({
  personaId: z.string().min(1),
  necesidadId: z.string().min(1),
  descripcionLibre: z.string().min(1),
  // Ventana "¿cuándo? ¿cuántos días?": si se indican, el plan se crea en el
  // mismo paso, sin que la persona tenga que pasar por una pantalla aparte.
  // `indefinido` cubre el caso "hasta nuevo aviso" (sin fecha de fin
  // conocida): en ese caso `dias` no hace falta.
  fechaInicio: z.string().datetime().optional(),
  dias: z.number().int().min(1).max(730).optional(),
  indefinido: z.boolean().optional(),
  franjaHoraria: z.string().optional(),
});

// "1. Necesidad" + "2. Solicitud" del caso Herminia: lenguaje humano → dato
// estructurado, trazable con SOL-xxxxxx (sección 3).
solicitudesRouter.post("/", async (req, res) => {
  const parsed = crearSolicitudSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { personaId, necesidadId, descripcionLibre, fechaInicio, dias, indefinido, franjaHoraria } = parsed.data;

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

  // La solicitud llega ya "enviada" (sección "llega la solicitud y queda
  // pendiente de revisión"): BORRADOR era un estado vestigial que nunca se
  // usaba de verdad — el formulario siempre envía todo de una vez, no hay
  // un "guardar borrador" real en ningún sitio de la interfaz.
  const codigo = await generarCodigo("solicitud");
  const solicitud = await prisma.solicitud.create({
    data: {
      codigo,
      descripcionLibre,
      necesidadId,
      personaId,
      organizacionId: persona.organizacionId,
      creadaPorUsuarioId: req.usuario!.sub,
      estado: "ENVIADA",
    },
  });

  await registrarHistorial({
    entidadTipo: "Solicitud",
    estadoAnterior: "ENVIADA",
    estadoNuevo: "ENVIADA",
    motivo: "Creación — pendiente de revisión",
    solicitudId: solicitud.id,
  });

  if (fechaInicio && (dias || indefinido)) {
    const inicio = new Date(fechaInicio);
    let fin: Date | null = null;
    if (dias) {
      fin = new Date(inicio);
      fin.setDate(fin.getDate() + dias);
    }
    await prisma.plan.create({
      data: { solicitudId: solicitud.id, fechaInicio: inicio, fechaFin: fin, franjaHoraria },
    });
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: persona.organizacionId,
    accion: "crear_solicitud",
    entidadTipo: "Solicitud",
    entidadId: solicitud.id,
  });

  if (req.usuario!.rol === "PERSONA" || req.usuario!.rol === "FAMILIAR") {
    await notificarGestores(
      persona.organizacionId,
      "nueva_solicitud",
      `Nueva solicitud de ${persona.nombre} ${persona.apellidos}: ${descripcionLibre}`,
      solicitud.id,
    );
  }

  const solicitudCompleta = await prisma.solicitud.findUnique({
    where: { id: solicitud.id },
    include: { persona: true, necesidad: true, plan: true },
  });

  res.status(201).json(solicitudCompleta);
});

// Eliminar (sección "si selecciono todas las solicitudes pueda
// eliminarlo"): solo mientras todavía no exista un Servicio — en cuanto se
// acepta y se lanza la búsqueda de profesional, ya hay historial operativo
// (y potencialmente facturación) que no debe poder desaparecer; a partir de
// ahí la vía correcta es cancelarla, no borrarla.
solicitudesRouter.delete("/:id", async (req, res) => {
  const usuario = req.usuario!;
  if (!esGestorOrganizacion(usuario)) return res.status(403).json({ error: "Sin permiso" });

  const solicitud = await prisma.solicitud.findUnique({ where: { id: req.params.id }, include: { servicio: true } });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });
  if (solicitud.organizacionId !== usuario.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (solicitud.servicio) {
    return res.status(409).json({ error: "Ya tiene un servicio en marcha; cancélala en vez de eliminarla" });
  }

  await prisma.$transaction([
    prisma.estadoHistorial.deleteMany({ where: { solicitudId: solicitud.id } }),
    prisma.plan.deleteMany({ where: { solicitudId: solicitud.id } }),
    prisma.solicitud.delete({ where: { id: solicitud.id } }),
  ]);

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "eliminar_solicitud",
    entidadTipo: "Solicitud",
    entidadId: solicitud.id,
    detalle: solicitud.codigo,
  });

  res.status(204).send();
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
  } else if (usuario.rol === "PROFESIONAL") {
    where = { servicio: { profesionalId: usuario.profesionalId ?? "__none__" } };
  } else if (esGestorOrganizacion(usuario) && usuario.rol !== "SUPERADMIN") {
    where = { organizacionId: usuario.organizacionId ?? "__none__" };
  } else if (usuario.rol !== "SUPERADMIN") {
    // Rol sin ramas anteriores (no debería ocurrir, pero por defecto no ve nada).
    where = { id: "__none__" };
  }

  const solicitudes = await prisma.solicitud.findMany({
    where,
    include: {
      persona: true,
      necesidad: true,
      plan: true,
      servicio: { include: { empresaColaboradora: true, profesional: true, incidencias: true, visitas: { orderBy: { fecha: "asc" } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  let relacionesVisibles: Set<string> | null = null;
  if (usuario.rol === "FAMILIAR") {
    const relaciones = await prisma.familiarRelacion.findMany({
      where: { usuarioId: usuario.sub, revocadoAt: null, puedeVerImportes: true },
      select: { personaId: true },
    });
    relacionesVisibles = new Set(relaciones.map((r) => r.personaId));
  }

  const resultado = solicitudes.map((s) => {
    const visible = esGestorOrganizacion(usuario) ? true : usuario.rol === "FAMILIAR" ? (relacionesVisibles?.has(s.personaId) ?? false) : false;
    return { ...s, servicio: filtrarEconomia(s.servicio, usuario, visible) };
  });

  res.json(resultado);
});

const clasificarSchema = z.object({
  necesidadId: z.string().min(1).optional(),
  descripcionLibre: z.string().min(1).optional(),
});

// Clasificar el tipo de servicio desde la ficha (coordinación): reasignar
// a qué necesidad del catálogo corresponde la petición, o afinar el texto.
solicitudesRouter.patch("/:id", async (req, res) => {
  if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });
  const parsed = clasificarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const solicitud = await prisma.solicitud.findUnique({ where: { id: req.params.id } });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });
  if (solicitud.organizacionId !== req.usuario!.organizacionId && req.usuario!.rol !== "SUPERADMIN") {
    return res.status(403).json({ error: "Sin permiso" });
  }
  if (["CERRADA", "CANCELADA"].includes(solicitud.estado)) {
    return res.status(409).json({ error: "No se puede reclasificar una solicitud cerrada o cancelada" });
  }

  const actualizada = await prisma.solicitud.update({
    where: { id: solicitud.id },
    data: parsed.data,
    include: { persona: true, necesidad: true, plan: true },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: solicitud.organizacionId,
    accion: "clasificar_solicitud",
    entidadTipo: "Solicitud",
    entidadId: solicitud.id,
  });

  res.json(actualizada);
});

solicitudesRouter.get("/:id", async (req, res) => {
  const solicitud = await prisma.solicitud.findUnique({
    where: { id: req.params.id },
    include: {
      persona: true,
      necesidad: true,
      plan: true,
      servicio: {
        include: {
          empresaColaboradora: true,
          profesional: true,
          visitas: { orderBy: { fecha: "asc" } },
          // Con el responsable: desde la ficha se ve a quién se le asignó
          // cada incidencia, que antes no aparecía en ninguna parte.
          incidencias: { include: { responsable: true }, orderBy: { createdAt: "desc" } },
          interesados: { include: { profesional: true }, orderBy: { createdAt: "asc" } },
        },
      },
      estadoHistorial: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });

  const permitido = await puedeAccederPersona(req.usuario!, solicitud.personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  // El profesional pasa por su propio filtro dentro de filtrarEconomia, así que
  // aquí basta con saber si la familia está autorizada a ver importes.
  const visible = await puedeVerImportes(req.usuario!, solicitud.personaId);
  res.json({ ...solicitud, servicio: filtrarEconomia(solicitud.servicio, req.usuario!, visible) });
});

const planSchema = z.object({
  fechaInicio: z.string().datetime(),
  // Ausente/null = indefinido, hasta nuevo aviso.
  fechaFin: z.string().datetime().nullable().optional(),
  recurrencia: z.string().optional(),
  franjaHoraria: z.string().optional(),
  horaInicio: z.string().optional(),
  horaFin: z.string().optional(),
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

  const fechaFin = parsed.data.fechaFin ? new Date(parsed.data.fechaFin) : null;
  const plan = await prisma.plan.upsert({
    where: { solicitudId: solicitud.id },
    update: {
      ...parsed.data,
      fechaInicio: new Date(parsed.data.fechaInicio),
      fechaFin,
    },
    create: {
      solicitudId: solicitud.id,
      ...parsed.data,
      fechaInicio: new Date(parsed.data.fechaInicio),
      fechaFin,
    },
  });

  // Qué clase de servicio es lo dice el plan, no un desplegable aparte. Si
  // alguien pasa una solicitud de un día suelto a "los lunes, indefinido",
  // el servicio tiene que dejar de ser puntual solo: si no, el generador de
  // jornadas sigue creyendo que es de una sola vez y no programa nada más.
  function tipoSegunPlan(p: { recurrencia: string | null; fechaInicio: Date; fechaFin: Date | null }) {
    if (p.recurrencia && p.recurrencia.trim()) return "RECURRENTE" as const;
    // Sin fecha de fin es indefinido; con una posterior al inicio, dura
    // varios días. En los dos casos hay más de una jornada.
    if (!p.fechaFin) return "RECURRENTE" as const;
    return p.fechaFin.getTime() > p.fechaInicio.getTime() ? ("RECURRENTE" as const) : ("PUNTUAL" as const);
  }

  // El precio se fija por hora, así que cambiar el horario cambia el importe:
  // pasar de 2 h a 3 h con el mismo precio/hora son 13 € más. Se recalcula
  // aquí para que no haya que volver a entrar en la tarifa a mano.
  const servicio = await prisma.servicio.findUnique({
    where: { solicitudId: solicitud.id },
    include: { solicitud: { include: { necesidad: true, persona: true } } },
  });
  if (servicio && servicio.precioHora != null && servicio.tarifaTipo !== "VOLUNTARIO") {
    const minutos = minutosEntre(plan.horaInicio, plan.horaFin);
    if (minutos != null) {
      const organizacion = await prisma.organizacion.findUnique({ where: { id: servicio.organizacionId } });
      const reparto = calcularReparto({
        minutos,
        precioHora: Number(servicio.precioHora),
        comisionPorcentaje: Number(servicio.comisionPorcentaje ?? organizacion?.comisionPorcentaje ?? 15),
        ivaPorcentaje: Number(servicio.ivaPorcentaje ?? servicio.solicitud.necesidad.ivaPorcentaje),
      });
      await prisma.servicio.update({
        where: { id: servicio.id },
        data: {
          minutosPrevistos: reparto.minutos,
          tarifaImporte: reparto.base,
          comisionImporte: reparto.comision,
          importeProfesional: reparto.importeProfesional,
          ivaImporte: reparto.ivaImporte,
          totalConIva: reparto.totalConIva,
        },
      });
    }
  }

  // Guardar el plan no bastaba: las jornadas ya creadas se quedaban en el día
  // y la hora viejos, así que coordinación veía el cambio en su ficha y el
  // profesional seguía con lo de antes en su panel. Se mueve lo que aún no ha
  // empezado y se le avisa de lo que le ha cambiado.
  //
  // Lo que ha pasado con la agenda se devuelve para poder decirlo en
  // pantalla: "se han programado dos jornadas" o "falta asignar profesional
  // para poder programarlas". Hacerlo en silencio dejaba a coordinación sin
  // saber si el cambio había servido de algo.
  let resultadoJornadas: { creadas: string[]; movidas: string[]; retiradas: string[]; motivo?: string } = {
    creadas: [],
    movidas: [],
    retiradas: [],
  };
  if (servicio) {
    const tipo = tipoSegunPlan(plan);
    if (servicio.tipoServicio !== tipo) {
      await prisma.servicio.update({ where: { id: servicio.id }, data: { tipoServicio: tipo } });
      await registrarHistorial({
        entidadTipo: "Servicio",
        estadoAnterior: servicio.estado,
        estadoNuevo: servicio.estado,
        motivo: `El plan pasa a ${tipo === "RECURRENTE" ? "recurrente" : "puntual"}`,
        servicioId: servicio.id,
      });
    }

    const sincronizado = await sincronizarSesionesConPlan(servicio.id);
    // Y se generan las que falten. Hasta ahora había que esperar a la
    // siguiente transición de estado para que apareciera nada en la agenda.
    const generadas = await asegurarSesiones(servicio.id);
    resultadoJornadas = {
      creadas: generadas.creadas,
      movidas: sincronizado.movidas,
      retiradas: sincronizado.retiradas,
      // El motivo sólo interesa cuando no se ha creado nada: explica por qué.
      motivo: generadas.creadas.length === 0 ? generadas.motivo : undefined,
    };
    if (sincronizado.cambios.length > 0 && servicio.profesionalId) {
      const cuenta = await prisma.usuario.findFirst({ where: { profesionalId: servicio.profesionalId }, select: { id: true } });
      if (cuenta) {
        await notificarUsuario(
          cuenta.id,
          "plan_cambiado",
          `Cambia el servicio ${servicio.codigo} de ${servicio.solicitud.persona.nombre} ${servicio.solicitud.persona.apellidos}: ${[...new Set(sincronizado.cambios)].join("; ")}.`,
          solicitud.id,
        );
      }
    }
  }

  res.status(201).json({ ...plan, jornadas: resultadoJornadas });
});

const estadoSchema = z.object({
  estado: z.enum(["ENVIADA", "EN_REVISION", "BUSCANDO", "PROPUESTA", "ACEPTADA", "CANCELADA", "CERRADA"]),
  motivo: z.string().optional(),
});

solicitudesRouter.post("/:id/estado", async (req, res) => {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const solicitud = await prisma.solicitud.findUnique({ where: { id: req.params.id }, include: { plan: true, servicio: true } });
  if (!solicitud) return res.status(404).json({ error: "No encontrada" });

  const permitido = await puedeAccederPersona(req.usuario!, solicitud.personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  try {
    validaciones.solicitud(solicitud.estado, parsed.data.estado);
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  // "Se acepta y entra a buscar un profesional": aceptar ya no es un paso
  // suelto seguido de un botón aparte "crear servicio" — al aceptar, si hay
  // días/horas guardados, el servicio se publica en el mismo movimiento.
  if (parsed.data.estado === "ACEPTADA") {
    if (!esGestorOrganizacion(req.usuario!)) return res.status(403).json({ error: "Sin permiso" });
    if (!solicitud.plan) return res.status(409).json({ error: "Guarda los días/horas antes de aceptar la solicitud" });
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

  let servicioCreado = null;
  if (parsed.data.estado === "ACEPTADA" && !solicitud.servicio) {
    const codigoServicio = await generarCodigo("servicio");
    servicioCreado = await prisma.servicio.create({
      data: { codigo: codigoServicio, solicitudId: solicitud.id, organizacionId: solicitud.organizacionId, estado: "PENDIENTE" },
    });
    await registrarHistorial({
      entidadTipo: "Servicio",
      estadoAnterior: "PENDIENTE",
      estadoNuevo: "PENDIENTE",
      motivo: "Publicado al aceptar la solicitud",
      servicioId: servicioCreado.id,
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      organizacionId: solicitud.organizacionId,
      accion: "crear_servicio",
      entidadTipo: "Servicio",
      entidadId: servicioCreado.id,
    });
  }

  res.json({ ...actualizada, servicio: servicioCreado });
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
