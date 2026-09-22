import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion, puedeVerImportes, ocultarTarifaSiProcede, soloLoQueCobraElProfesional } from "../services/permisos.js";
import { ausenteEse, carenciasDe } from "../services/rrhh.js";
import { validaciones, registrarHistorial, TransicionInvalidaError } from "../services/estados.js";
import { notificarGestores, notificarUsuario } from "../services/notificaciones.js";
import { asegurarSesiones } from "../services/sesiones.js";
import { calcularReparto, minutosEntre } from "../services/economia.js";

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
    // La agenda del escritorio necesita saber quién va a cada visita, y esa
    // atribución es la del snapshot (no la del servicio, que puede haberse
    // reasignado después). Solo los campos de identificación: los datos
    // bancarios del profesional no tienen por qué viajar en este listado.
    include: {
      ...INCLUDE_SERVICIO,
      // La verificación necesita, por jornada, quién la hizo, qué tareas
      // quedaron marcadas y qué anotó: es lo que se compara con el fichaje.
      visitas: {
        include: {
          profesional: { select: { id: true, codigo: true, nombre: true, apellidos: true, foto: true } },
          tareas: true,
          actuaciones: true,
        },
      },
    },
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
    // Al profesional se le aplicaba el mismo filtro que a la familia sin
    // permiso, y ese borra también lo que él cobra: por eso una propuesta le
    // llegaba sin importe y no podía saber qué le ofrecían.
    if (usuario.rol === "PROFESIONAL") return soloLoQueCobraElProfesional(s);
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
  // El profesional necesita ver todo lo relevante para decidir si le
  // interesa y le encaja con su perfil (sección "debe ver lugar del
  // servicio, salario, días, tipo de trabajo, horas... súper completo"):
  // sí ve lo que cobraría él (importeProfesional), pero nunca la tarifa que
  // se le cobra a la familia, la comisión de CUIDA ni con qué empresa
  // colaboradora se factura eso.
  // Se usa el mismo filtro que en el resto de sus vistas: la lista escrita a
  // mano que había aquí se había quedado sin precioHora ni comisionPorcentaje,
  // y con esos dos se reconstruye lo que paga la familia y el margen.
  const resultado = servicios.map(soloLoQueCobraElProfesional);
  res.json(resultado);
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
  if (usuario.rol === "PROFESIONAL") {
    const suyo = usuario.profesionalId != null && usuario.profesionalId === servicio.profesionalId;
    return res.json(suyo ? soloLoQueCobraElProfesional(servicio) : ocultarTarifaSiProcede(servicio, false));
  }
  const visible = await puedeVerImportes(usuario, servicio.solicitud.personaId);
  res.json(ocultarTarifaSiProcede(servicio, visible));
});

const tarifaSchema = z.object({
  empresaColaboradoraId: z.string().nullable().optional(),
  // CUIDA cobra por tiempo: lo que se fija es el precio de la hora, no un
  // total a ojo. El importe sale de multiplicarlo por los minutos acordados.
  precioHora: z.number().nonnegative().nullable().optional(),
  // Duración acordada de una jornada. Si no se manda, se deduce del plan.
  minutosPrevistos: z.number().int().positive().max(24 * 60).nullable().optional(),
  // % de CUIDA para este servicio. Si no se manda, el de la organización.
  comisionPorcentaje: z.number().min(0).max(100).nullable().optional(),
  tarifaTipo: z.enum(["PAGADO", "VOLUNTARIO"]).nullable().optional(),
  tarifaNotas: z.string().optional(),
  tipoServicio: z.enum(["PUNTUAL", "RECURRENTE"]).optional(),
  // El % de IVA se hereda del servicio del catálogo elegido en la solicitud
  // (sección "aplicar el 4% o el 10% de IVA"); esto permite forzarlo a mano
  // si el caso concreto no coincide con el catálogo (ej. deja de estar
  // concertado a mitad de contrato).
  ivaPorcentaje: z.number().min(0).max(21).nullable().optional(),
});

// Asignar empresa colaboradora y/o fijar el precio. Solo gestores; nunca
// visible para la persona atendida (sección 4/14).
serviciosRouter.post("/:id/tarifa", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = tarifaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({
    where: { id: req.params.id },
    include: { solicitud: { include: { necesidad: true, plan: true } } },
  });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  if (parsed.data.empresaColaboradoraId) {
    const empresa = await prisma.empresaColaboradora.findUnique({ where: { id: parsed.data.empresaColaboradoraId } });
    if (!empresa || empresa.organizacionId !== servicio.organizacionId) {
      return res.status(400).json({ error: "Empresa colaboradora no válida para esta organización" });
    }
  }

  const organizacion = await prisma.organizacion.findUnique({ where: { id: servicio.organizacionId } });

  // Precio por hora, duración y % de comisión: lo que se manda ahora, o lo
  // que ya tenía el servicio, o lo que se deduce del plan.
  const precioHora = parsed.data.precioHora ?? (servicio.precioHora != null ? Number(servicio.precioHora) : null);
  const minutosPlan = minutosEntre(servicio.solicitud.plan?.horaInicio, servicio.solicitud.plan?.horaFin);
  const minutosPrevistos = parsed.data.minutosPrevistos ?? servicio.minutosPrevistos ?? minutosPlan;
  const comisionPorcentaje =
    parsed.data.comisionPorcentaje ??
    (servicio.comisionPorcentaje != null ? Number(servicio.comisionPorcentaje) : null) ??
    Number(organizacion?.comisionPorcentaje ?? 15);

  const ivaPorcentaje = parsed.data.ivaPorcentaje ?? Number(servicio.solicitud.necesidad.ivaPorcentaje);

  // Un servicio voluntario no genera ni cobro ni comisión: las cifras se
  // dejan a cero en vez de quedarse con las del último precio fijado.
  const voluntario = parsed.data.tarifaTipo === "VOLUNTARIO";
  const reparto =
    !voluntario && precioHora != null && minutosPrevistos != null
      ? calcularReparto({ minutos: minutosPrevistos, precioHora, comisionPorcentaje, ivaPorcentaje })
      : null;

  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    data: {
      empresaColaboradoraId: parsed.data.empresaColaboradoraId,
      precioHora: voluntario ? null : precioHora,
      minutosPrevistos: minutosPrevistos ?? undefined,
      comisionPorcentaje: voluntario ? null : comisionPorcentaje,
      tarifaTipo: parsed.data.tarifaTipo,
      tarifaNotas: parsed.data.tarifaNotas,
      tipoServicio: parsed.data.tipoServicio,
      tarifaImporte: reparto ? reparto.base : voluntario ? null : undefined,
      comisionImporte: reparto ? reparto.comision : voluntario ? null : undefined,
      importeProfesional: reparto ? reparto.importeProfesional : voluntario ? null : undefined,
      ivaPorcentaje: reparto ? reparto.ivaPorcentaje : voluntario ? null : undefined,
      ivaImporte: reparto ? reparto.ivaImporte : voluntario ? null : undefined,
      totalConIva: reparto ? reparto.totalConIva : voluntario ? null : undefined,
    },
    include: INCLUDE_SERVICIO,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "actualizar_tarifa_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
    detalle: reparto ? `${reparto.precioHora} €/h × ${reparto.minutos} min = ${reparto.base} €` : "voluntario",
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

  // Nadie entra en casa de una persona mayor sin los papeles en regla. El
  // certificado de delitos sexuales es obligatorio por ley para trabajar con
  // personas vulnerables, así que esto no es una política interna que se
  // pueda saltar: se bloquea la asignación y se dice qué falta.
  const documentos = await prisma.documento.findMany({
    where: { profesionalId: profesional.id },
    select: { tipo: true, fechaCaducidad: true },
  });
  const impedimentos = carenciasDe(documentos).filter((c) => c.motivo !== "por_caducar");
  if (impedimentos.length > 0) {
    return res.status(409).json({
      error: `No se puede asignar a ${profesional.nombre}: ${impedimentos
        .map((c) => (c.motivo === "falta" ? `falta ${c.etiqueta.toLowerCase()}` : `${c.etiqueta.toLowerCase()} caducado`))
        .join("; ")}.`,
    });
  }

  // Y tampoco se asigna a quien está de baja o de vacaciones el día en que
  // toca el servicio: descubrirlo cuando nadie aparece es lo que hay que
  // evitar.
  const plan = await prisma.plan.findUnique({ where: { solicitudId: servicio.solicitudId } });
  if (plan) {
    const ausencias = await prisma.ausencia.findMany({
      where: { profesionalId: profesional.id, estado: "APROBADA" },
      select: { desde: true, hasta: true, estado: true },
    });
    if (ausenteEse(plan.fechaInicio, ausencias)) {
      return res.status(409).json({
        error: `${profesional.nombre} está de ausencia el ${plan.fechaInicio.toLocaleDateString("es-ES")}. Elige a otra persona o cambia la fecha.`,
      });
    }
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

const rechazarSchema = z.object({ motivo: z.string().max(500).optional() });

// El profesional dice que no. Antes solo podía aceptar: si no le encajaba —
// le pilla lejos, no trabaja ese día, no puede con ese tipo de servicio— la
// propuesta se quedaba ahí colgada y coordinación no se enteraba. El
// servicio vuelve al mercado y se avisa con el motivo.
serviciosRouter.post("/:id/rechazar", requiereRol("PROFESIONAL"), async (req, res) => {
  const parsed = rechazarSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id }, include: { profesional: true } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.profesionalId !== req.usuario!.profesionalId) {
    return res.status(403).json({ error: "Este servicio no te ha sido propuesto a ti" });
  }
  if (servicio.estado !== "ASIGNADO") {
    return res.status(409).json({ error: "Solo se puede rechazar una propuesta que todavía no has aceptado" });
  }

  const quien = servicio.profesional ? `${servicio.profesional.nombre} ${servicio.profesional.apellidos}` : "El profesional";

  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    // Vuelve a PENDIENTE y se suelta el profesional: el servicio queda otra
    // vez disponible para proponérselo a otra persona.
    data: { estado: "PENDIENTE", profesionalId: null },
  });

  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: servicio.estado,
    estadoNuevo: "PENDIENTE",
    motivo: `Rechazado por ${quien}${parsed.data.motivo ? `: ${parsed.data.motivo}` : ""}`,
    servicioId: servicio.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "rechazar_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
    detalle: parsed.data.motivo,
  });

  await notificarGestores(
    servicio.organizacionId,
    "servicio_rechazado",
    // El motivo lo escribe una persona y suele acabar en punto: pegarle
    // otra frase detrás dejaba "…ocupados.. Vuelve a estar sin cubrir".
    `${quien} ha rechazado el servicio ${servicio.codigo}${parsed.data.motivo ? `: ${parsed.data.motivo.trim().replace(/[.\s]+$/, "")}` : ""}. Vuelve a estar sin cubrir.`,
    servicio.solicitudId,
  ).catch(() => undefined);

  res.json(actualizado);
});

// Reemplazo de profesional en marcha (sección "debo poder cambiar de
// profesional si este se enferma o deja el trabajo y que pueda tener un
// reemplazo"): a diferencia de /asignar (que es la propuesta inicial y pasa
// por ASIGNADO en espera de aceptación), esto sustituye al profesional de un
// servicio ya CONFIRMADO o EN_CURSO sin reiniciar ese progreso. Las visitas
// ya creadas conservan su profesionalId original (snapshot), así que la
// facturación por horas no se ve afectada retroactivamente.
serviciosRouter.post("/:id/reemplazar-profesional", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = asignarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (!["CONFIRMADO", "EN_CURSO"].includes(servicio.estado)) {
    return res.status(409).json({ error: "Solo se puede reemplazar el profesional de un servicio confirmado o en curso" });
  }

  const profesional = await prisma.profesional.findUnique({ where: { id: parsed.data.profesionalId }, include: { usuario: true } });
  if (!profesional || profesional.organizacionId !== servicio.organizacionId) {
    return res.status(400).json({ error: "Profesional no válido para esta organización" });
  }
  if (profesional.id === servicio.profesionalId) {
    return res.status(400).json({ error: "Ese profesional ya está asignado a este servicio" });
  }

  const anterior = servicio.profesionalId ? await prisma.profesional.findUnique({ where: { id: servicio.profesionalId } }) : null;

  const actualizado = await prisma.servicio.update({
    where: { id: servicio.id },
    data: { profesionalId: profesional.id },
    include: INCLUDE_SERVICIO,
  });

  // El snapshot congela quién hizo el trabajo, no quién lo va a hacer: las
  // jornadas ya empezadas o cerradas siguen contando para el profesional
  // anterior (su facturación no se toca), pero las que aún no han empezado
  // pasan al sustituto. Si no, el nuevo profesional no veía en su agenda los
  // días que le tocaban y el escritorio seguía anunciando al que se fue.
  const traspasadas = await prisma.visita.updateMany({
    where: {
      servicioId: servicio.id,
      estado: { in: ["PROGRAMADA", "CONFIRMADA"] },
      horaInicioReal: null,
    },
    data: { profesionalId: profesional.id },
  });

  await registrarHistorial({
    entidadTipo: "Servicio",
    estadoAnterior: servicio.estado,
    estadoNuevo: servicio.estado,
    motivo:
      `Reemplazo de profesional: ${anterior?.codigo ?? "sin asignar"} → ${profesional.codigo}` +
      (traspasadas.count > 0
        ? `. ${traspasadas.count} jornada(s) sin empezar pasan al nuevo profesional; las ya trabajadas siguen contando para ${anterior?.codigo ?? "el anterior"}`
        : ""),
    servicioId: servicio.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: servicio.organizacionId,
    accion: "reemplazar_profesional_servicio",
    entidadTipo: "Servicio",
    entidadId: servicio.id,
    detalle: `${anterior?.codigo ?? "sin asignar"} → ${profesional.codigo}`,
  });

  if (profesional.usuario) {
    await notificarUsuario(
      profesional.usuario.id,
      "propuesta_servicio",
      `Te han asignado el servicio ${servicio.codigo} como reemplazo. Revísalo.`,
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

  // El servicio ya trae sus días y sus horas en el plan: la jornada sale de
  // ahí sola. Antes había que ir a la ficha a "programar una visita" para un
  // servicio que ya decía cuándo era, y si nadie lo hacía el servicio se
  // quedaba confirmado pero sin nada en la agenda.
  const sesiones = await asegurarSesiones(servicio.id);
  if (sesiones.creadas.length > 0) {
    await registrarHistorial({
      entidadTipo: "Servicio",
      estadoAnterior: "CONFIRMADO",
      estadoNuevo: "CONFIRMADO",
      motivo: `Jornada ${sesiones.creadas.join(", ")} creada automáticamente desde el plan`,
      servicioId: servicio.id,
    });
  }

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

  // "Se notifica al usuario la confirmación de su servicio": la persona
  // atendida y sus familiares deben enterarse de que ya hay alguien
  // confirmado, no solo coordinación.
  const solicitudConPersona = await prisma.solicitud.findUnique({
    where: { id: servicio.solicitudId },
    include: { persona: { include: { usuario: true } } },
  });
  if (solicitudConPersona?.persona.usuario) {
    await notificarUsuario(
      solicitudConPersona.persona.usuario.id,
      "servicio_confirmado",
      `Tu servicio ${servicio.codigo} ya está confirmado. Vendrá el profesional asignado.`,
      servicio.solicitudId,
    );
  }
  const familiaresDePersona = await prisma.familiarRelacion.findMany({
    where: { personaId: solicitudConPersona?.personaId ?? "__none__", revocadoAt: null },
    select: { usuarioId: true },
  });
  for (const f of familiaresDePersona) {
    await notificarUsuario(f.usuarioId, "servicio_confirmado", `El servicio ${servicio.codigo} ya está confirmado con un profesional.`, servicio.solicitudId);
  }

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

  // Si coordinación mueve el servicio a mano hasta confirmado o en curso, la
  // jornada también sale sola: el camino largo y el atajo dejan el servicio
  // en el mismo sitio.
  if (["CONFIRMADO", "EN_CURSO"].includes(parsed.data.estado)) {
    const sesiones = await asegurarSesiones(servicio.id);
    if (sesiones.creadas.length > 0) {
      await registrarHistorial({
        entidadTipo: "Servicio",
        estadoAnterior: parsed.data.estado,
        estadoNuevo: parsed.data.estado,
        motivo: `Jornada ${sesiones.creadas.join(", ")} creada automáticamente desde el plan`,
        servicioId: servicio.id,
      });
    }
  }

  res.json(actualizado);
});

const crearVisitaSchema = z.object({
  fecha: z.string().datetime(),
  horaInicioProg: z.string().optional(),
  horaFinProg: z.string().optional(),
  tareas: z.array(z.string()).default([]),
});

function seSolapan(aInicio: string | null, aFin: string | null, bInicio: string | null, bFin: string | null): boolean {
  // Si a cualquiera de las dos visitas le falta horario, no se puede
  // garantizar que no choquen: se trata como el día entero ocupado.
  if (!aInicio || !aFin || !bInicio || !bFin) return true;
  return aInicio < bFin && bInicio < aFin;
}

// Agenda: crear visitas programadas para un servicio confirmado (sección 6/9).
serviciosRouter.post("/:id/visitas", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = crearVisitaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const servicio = await prisma.servicio.findUnique({ where: { id: req.params.id } });
  if (!servicio) return res.status(404).json({ error: "No encontrado" });
  if (servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  // "Veo que Carmen tiene dos tareas el mismo día a la misma hora, eso no
  // se debe poder": si el servicio ya tiene profesional, comprobamos su
  // agenda completa (todos sus servicios, no solo este) para ese día antes
  // de programar la visita.
  if (servicio.profesionalId) {
    const fechaNueva = new Date(parsed.data.fecha);
    const inicioDia = new Date(Date.UTC(fechaNueva.getUTCFullYear(), fechaNueva.getUTCMonth(), fechaNueva.getUTCDate()));
    const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
    const visitasDelDia = await prisma.visita.findMany({
      where: {
        servicio: { profesionalId: servicio.profesionalId },
        fecha: { gte: inicioDia, lt: finDia },
      },
    });
    const conflicto = visitasDelDia.find((v) => seSolapan(v.horaInicioProg, v.horaFinProg, parsed.data.horaInicioProg ?? null, parsed.data.horaFinProg ?? null));
    if (conflicto) {
      return res.status(409).json({ error: `El profesional ya tiene la visita ${conflicto.codigo} ese día a esa hora` });
    }
  }

  const codigo = await generarCodigo("visita");
  const visita = await prisma.visita.create({
    data: {
      codigo,
      fecha: new Date(parsed.data.fecha),
      horaInicioProg: parsed.data.horaInicioProg,
      horaFinProg: parsed.data.horaFinProg,
      servicioId: servicio.id,
      // Snapshot de quién la hace en este momento (sección "cambiar de
      // profesional... que esto se tenga en cuenta en su facturación"): si
      // el servicio se reasigna después, esta visita ya creada conserva el
      // profesional que de verdad la va a hacer.
      profesionalId: servicio.profesionalId,
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
