import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion } from "../services/permisos.js";
import { notificarGestores, notificarUsuario } from "../services/notificaciones.js";
import { minutosFichados } from "../services/economia.js";
import { carenciasDe, diasEntre, minutosDeContratoDelMes } from "../services/rrhh.js";
import { diasPrevistosEntre } from "../services/sesiones.js";
import { candidatosParaServicio } from "../services/candidatos.js";

// La parte laboral de los PROFESIONALES: quienes hacen los servicios en casa
// de las personas, sean trabajadores de la empresa o independientes. Su
// expediente, sus ausencias y el registro de jornada que la ley obliga a
// llevar.
//
// No confundir con /equipo, que es el personal interno de la empresa
// —coordinación, administración y demás— y no presta servicios.
export const personalRouter = Router();
personalRouter.use(autenticar);

const soloGestion = requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN");

async function profesionalPropio(id: string, organizacionId: string | null | undefined) {
  const profesional = await prisma.profesional.findUnique({ where: { id } });
  if (!profesional || profesional.organizacionId !== organizacionId) return null;
  return profesional;
}

// Quien mira: coordinación puede ver a cualquiera de su organización; un
// profesional, sólo su propio expediente.
function puedeVer(usuario: NonNullable<Express.Request["usuario"]>, profesionalId: string): boolean {
  if (esGestorOrganizacion(usuario)) return true;
  return usuario.rol === "PROFESIONAL" && usuario.profesionalId === profesionalId;
}

// ------------------------------------------------------------ el equipo entero

// La foto de la plantilla: quién está en regla, a quién le falta algo y quién
// está ausente hoy. Es la pantalla con la que se empieza el día.
personalRouter.get("/", soloGestion, async (req, res) => {
  const organizacionId = req.usuario!.organizacionId ?? "__none__";
  const profesionales = await prisma.profesional.findMany({
    where: { organizacionId },
    include: {
      documentos: { orderBy: { createdAt: "desc" } },
      ausencias: { where: { estado: { in: ["SOLICITADA", "APROBADA"] } }, orderBy: { desde: "asc" } },
      usuario: { select: { email: true, activo: true } },
    },
    orderBy: { nombre: "asc" },
  });

  const hoy = new Date();
  const equipo = profesionales.map((p) => {
    const carencias = carenciasDe(
      p.documentos.map((d) => ({ tipo: d.tipo, fechaCaducidad: d.fechaCaducidad, archivoId: d.archivoId, url: d.url })),
      hoy,
    );
    const ausenciaHoy = p.ausencias.find((a) => {
      if (a.estado !== "APROBADA") return false;
      return hoy >= new Date(a.desde) && hoy <= new Date(new Date(a.hasta).setHours(23, 59, 59, 999));
    });
    return {
      ...p,
      carencias,
      // Impedimento real para trabajar, distinto de un aviso de renovación.
      bloqueado: carencias.some((c) => c.motivo !== "por_caducar"),
      ausenciaHoy: ausenciaHoy ?? null,
    };
  });

  res.json(equipo);
});

// ------------------------------------------------------------------ documentos

const documentoSchema = z.object({
  tipo: z.enum([
    "DNI",
    "DELITOS_SEXUALES",
    "TITULACION",
    "CONTRATO",
    "ALTA_SEGURIDAD_SOCIAL",
    "CARNE_CONDUCIR",
    "SEGURO",
    "FORMACION",
    "OTRO",
  ]),
  nombre: z.string().min(1),
  // El fichero subido al almacén. Un documento obligatorio sin esto —o al
  // menos sin un enlace— cuenta como que falta.
  archivoId: z.string().optional().nullable(),
  url: z.string().optional(),
  fechaEmision: z.string().optional().nullable(),
  fechaCaducidad: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

function aFecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

personalRouter.get("/:profesionalId/documentos", async (req, res) => {
  if (!puedeVer(req.usuario!, req.params.profesionalId)) return res.status(403).json({ error: "Sin permiso" });
  const documentos = await prisma.documento.findMany({
    where: { profesionalId: req.params.profesionalId },
    orderBy: [{ tipo: "asc" }, { createdAt: "desc" }],
  });
  res.json(documentos);
});

personalRouter.post("/:profesionalId/documentos", soloGestion, async (req, res) => {
  const parsed = documentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const profesional = await profesionalPropio(req.params.profesionalId, req.usuario!.organizacionId);
  if (!profesional) return res.status(404).json({ error: "Profesional no encontrado" });

  const documento = await prisma.documento.create({
    data: {
      profesionalId: profesional.id,
      tipo: parsed.data.tipo,
      nombre: parsed.data.nombre,
      archivoId: parsed.data.archivoId || null,
      // Un enlace externo sigue valiendo cuando el papel vive en otro sitio.
      url: parsed.data.url || "",
      fechaEmision: aFecha(parsed.data.fechaEmision),
      fechaCaducidad: aFecha(parsed.data.fechaCaducidad),
      notas: parsed.data.notas || null,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "añadir_documento_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
    detalle: `${parsed.data.tipo} · ${parsed.data.nombre}`,
  });
  res.status(201).json(documento);
});

personalRouter.delete("/documentos/:id", soloGestion, async (req, res) => {
  const documento = await prisma.documento.findUnique({ where: { id: req.params.id }, include: { profesional: true } });
  if (!documento?.profesional) return res.status(404).json({ error: "No encontrado" });
  if (documento.profesional.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  await prisma.documento.delete({ where: { id: documento.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "eliminar_documento_profesional",
    entidadTipo: "Profesional",
    entidadId: documento.profesional.id,
    detalle: `${documento.tipo} · ${documento.nombre}`,
  });
  res.status(204).end();
});

// ------------------------------------------------------------------- ausencias

const ausenciaSchema = z.object({
  tipo: z.enum(["VACACIONES", "BAJA_MEDICA", "PERMISO_RETRIBUIDO", "ASUNTOS_PROPIOS", "EXCEDENCIA", "OTRO"]),
  desde: z.string().min(4),
  hasta: z.string().min(4),
  motivo: z.string().optional().nullable(),
});

personalRouter.get("/ausencias", async (req, res) => {
  const usuario = req.usuario!;
  if (esGestorOrganizacion(usuario)) {
    const ausencias = await prisma.ausencia.findMany({
      where: { profesional: { organizacionId: usuario.organizacionId ?? "__none__" } },
      include: { profesional: { select: { id: true, nombre: true, apellidos: true, codigo: true } } },
      orderBy: [{ estado: "asc" }, { desde: "asc" }],
    });
    return res.json(ausencias);
  }
  if (usuario.rol === "PROFESIONAL") {
    const ausencias = await prisma.ausencia.findMany({
      where: { profesionalId: usuario.profesionalId ?? "__none__" },
      include: { profesional: { select: { id: true, nombre: true, apellidos: true, codigo: true } } },
      orderBy: { desde: "desc" },
    });
    return res.json(ausencias);
  }
  res.json([]);
});

// La pide el propio profesional o la anota coordinación (una baja médica
// llega por teléfono, no la solicita nadie desde la aplicación).
personalRouter.post("/:profesionalId/ausencias", async (req, res) => {
  const parsed = ausenciaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const usuario = req.usuario!;
  const esGestor = esGestorOrganizacion(usuario);
  const esSuya = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.profesionalId;
  if (!esGestor && !esSuya) return res.status(403).json({ error: "Sin permiso" });

  const profesional = await prisma.profesional.findUnique({ where: { id: req.params.profesionalId } });
  if (!profesional) return res.status(404).json({ error: "Profesional no encontrado" });
  if (esGestor && profesional.organizacionId !== usuario.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const desde = aFecha(parsed.data.desde);
  const hasta = aFecha(parsed.data.hasta);
  if (!desde || !hasta) return res.status(400).json({ error: "Las fechas no son válidas" });
  if (hasta < desde) return res.status(400).json({ error: "La fecha de fin es anterior a la de inicio" });

  // Lo que anota coordinación ya está decidido; lo que pide el profesional,
  // no.
  const estado = esGestor ? "APROBADA" : "SOLICITADA";
  const ausencia = await prisma.ausencia.create({
    data: {
      profesionalId: profesional.id,
      tipo: parsed.data.tipo,
      estado,
      desde,
      hasta,
      motivo: parsed.data.motivo || null,
      ...(esGestor ? { resueltaPorUsuarioId: usuario.sub, resueltaAt: new Date() } : {}),
    },
  });

  // Jornadas ya programadas que caen dentro: no se tocan solas —quitarlas
  // dejaría a una persona mayor sin servicio y sin que nadie se entere— pero
  // hay que avisar de que alguien tiene que recolocarlas.
  const choques = await prisma.visita.count({
    where: {
      estado: { in: ["PROGRAMADA", "CONFIRMADA"] },
      fecha: { gte: desde, lte: new Date(new Date(hasta).setHours(23, 59, 59, 999)) },
      OR: [{ profesionalId: profesional.id }, { profesionalId: null, servicio: { profesionalId: profesional.id } }],
    },
  });

  if (profesional.organizacionId) {
    const quien = `${profesional.nombre} ${profesional.apellidos}`;
    const texto =
      estado === "SOLICITADA"
        ? `${quien} pide ${diasEntre(desde, hasta)} día(s) de ausencia del ${desde.toLocaleDateString("es-ES")} al ${hasta.toLocaleDateString("es-ES")}.`
        : `${quien} estará ausente del ${desde.toLocaleDateString("es-ES")} al ${hasta.toLocaleDateString("es-ES")}.`;
    await notificarGestores(
      profesional.organizacionId,
      "ausencia",
      choques > 0 ? `${texto} Tiene ${choques} jornada(s) programadas en esos días que hay que recolocar.` : texto,
    );
  }

  res.status(201).json({ ...ausencia, jornadasEnConflicto: choques });
});

// Lo que va a costar decir sí, antes de decirlo.
//
// Hasta ahora se aprobaba a ciegas: se pulsaba Aprobar y sólo entonces salían
// las incidencias diciendo que tres servicios se habían quedado descubiertos y
// que no había nadie con el perfil para cubrirlos. Con diez días de vacaciones
// eso es justo lo que hay que saber ANTES de contestar, porque a lo mejor la
// respuesta es "sí, pero moviendo dos días" o "no, esa semana no puede ser".
//
// Es la misma maquinaria que se usa al aprobar y al buscar reemplazo, sólo
// consultada antes: los días que el plan señala dentro de la ausencia, y quién
// podría cubrirlos. Nada se crea ni se cambia; sólo se cuenta.
personalRouter.get("/ausencias/:id/impacto", soloGestion, async (req, res) => {
  const ausencia = await prisma.ausencia.findUnique({
    where: { id: req.params.id },
    include: { profesional: true },
  });
  if (!ausencia) return res.status(404).json({ error: "No encontrada" });
  if (ausencia.profesional.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const desde = new Date(ausencia.desde);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(ausencia.hasta);
  hasta.setHours(23, 59, 59, 999);

  const suyos = await prisma.servicio.findMany({
    where: {
      organizacionId: ausencia.profesional.organizacionId,
      profesionalId: ausencia.profesionalId,
      estado: { in: ["CONFIRMADO", "EN_CURSO"] },
    },
    include: { solicitud: { include: { persona: true, necesidad: true } } },
  });

  const comoDia = (f: Date) => f.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const servicios = [];
  let jornadas = 0;

  for (const servicio of suyos) {
    // Los días que tocan según el plan, más los que ya están en la agenda: un
    // servicio recurrente sólo lleva una jornada por delante, así que mirar
    // sólo la agenda diría que no hay nada que cubrir.
    const dias = new Map<string, Date>();
    for (const f of await diasPrevistosEntre(servicio.id, desde, hasta)) dias.set(comoDia(f), f);
    const yaEnAgenda = await prisma.visita.findMany({
      where: {
        servicioId: servicio.id,
        fecha: { gte: desde, lte: hasta },
        estado: { in: ["PROGRAMADA", "CONFIRMADA"] },
      },
      select: { fecha: true },
    });
    for (const v of yaEnAgenda) dias.set(comoDia(v.fecha), v.fecha);
    if (dias.size === 0) continue;

    // Y quién podría ir esos días. Se pregunta por la ventana de la ausencia,
    // no por los próximos días: quien está libre esta semana puede no estarlo
    // el mes que viene.
    const candidatos = (await candidatosParaServicio(servicio.id, { desde, hasta })).filter(
      (c) => c.id !== ausencia.profesionalId,
    );

    jornadas += dias.size;
    servicios.push({
      id: servicio.id,
      codigo: servicio.codigo,
      persona: `${servicio.solicitud.persona.nombre} ${servicio.solicitud.persona.apellidos}`,
      necesidad: servicio.solicitud.necesidad.nombre,
      dias: Array.from(dias.values())
        .sort((a, b) => a.getTime() - b.getTime())
        .map(comoDia),
      // Quien puede ir, y quien no con su motivo: si nadie puede, hay que
      // poder leer por qué sin salir de aquí.
      puedenCubrirlo: candidatos.filter((c) => c.encaja).map((c) => `${c.nombre} ${c.apellidos}`),
      noPueden: candidatos.filter((c) => !c.encaja).map((c) => ({ quien: `${c.nombre} ${c.apellidos}`, motivo: c.motivo })),
    });
  }

  res.json({
    jornadas,
    servicios,
    // El resumen de una línea: lo que decide si se aprueba tal cual o hay que
    // hablar antes con alguien.
    sinCubrir: servicios.filter((s) => s.puedenCubrirlo.length === 0).map((s) => s.persona),
  });
});

const resolverSchema = z.object({ estado: z.enum(["APROBADA", "RECHAZADA", "CANCELADA"]), respuesta: z.string().optional() });

personalRouter.post("/ausencias/:id/estado", soloGestion, async (req, res) => {
  const parsed = resolverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ausencia = await prisma.ausencia.findUnique({ where: { id: req.params.id }, include: { profesional: true } });
  if (!ausencia) return res.status(404).json({ error: "No encontrada" });
  if (ausencia.profesional.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const actualizada = await prisma.ausencia.update({
    where: { id: ausencia.id },
    data: {
      estado: parsed.data.estado,
      respuesta: parsed.data.respuesta ?? null,
      resueltaPorUsuarioId: req.usuario!.sub,
      resueltaAt: new Date(),
    },
  });

  // Aprobar una baja no es papeleo: son jornadas que se quedan sin nadie. Se
  // abre una incidencia por cada servicio afectado —con las jornadas que
  // quedan descubiertas— para poder tramitar el reemplazo desde ahí, en vez de
  // descubrirlo el día que la persona espera en su casa.
  // "baja_medica" no es castellano. Lo que se lee en la incidencia tiene que
  // poder decirse en voz alta por teléfono.
  const COMO_SE_DICE: Record<string, string> = {
    VACACIONES: "vacaciones",
    BAJA_MEDICA: "baja médica",
    PERMISO_RETRIBUIDO: "permiso retribuido",
    ASUNTOS_PROPIOS: "asuntos propios",
  };
  const incidenciasAbiertas: string[] = [];
  if (parsed.data.estado === "APROBADA") {
    const desde = new Date(ausencia.desde);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ausencia.hasta);
    hasta.setHours(23, 59, 59, 999);

    const descubiertas = await prisma.visita.findMany({
      where: {
        fecha: { gte: desde, lte: hasta },
        estado: { in: ["PROGRAMADA", "CONFIRMADA"] },
        OR: [{ profesionalId: ausencia.profesionalId }, { profesionalId: null, servicio: { profesionalId: ausencia.profesionalId } }],
        servicio: { organizacionId: ausencia.profesional.organizacionId },
      },
      include: { servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } } },
      orderBy: { fecha: "asc" },
    });

    const porServicio = new Map<string, typeof descubiertas>();
    for (const v of descubiertas) {
      porServicio.set(v.servicioId, [...(porServicio.get(v.servicioId) ?? []), v]);
    }

    // Un servicio recurrente sólo lleva una jornada por delante en la agenda,
    // así que una baja del mes que viene no solapaba ninguna y se aprobaba en
    // silencio, como si no dejara a nadie sin cubrir. Los días que toca ir son
    // un hecho del plan, no de la agenda: se cuentan igual.
    const susServicios = await prisma.servicio.findMany({
      where: {
        organizacionId: ausencia.profesional.organizacionId,
        profesionalId: ausencia.profesionalId,
        estado: { in: ["CONFIRMADO", "EN_CURSO"] },
      },
      include: { solicitud: { include: { persona: true, necesidad: true } } },
    });
    const previstosPorServicio = new Map<string, Date[]>();
    for (const s of susServicios) {
      const dias = await diasPrevistosEntre(s.id, desde, hasta);
      if (dias.length > 0) previstosPorServicio.set(s.id, dias);
    }

    const afectados = new Set([...porServicio.keys(), ...previstosPorServicio.keys()]);
    const comoDia = (f: Date) => f.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

    for (const servicioId of afectados) {
      const visitas = porServicio.get(servicioId) ?? [];
      const cabecera = visitas[0]?.servicio ?? susServicios.find((s) => s.id === servicioId);
      if (!cabecera) continue;

      // Los días a cubrir: los de las jornadas ya creadas más los que el plan
      // señala y todavía no están en la agenda, sin repetir ninguno.
      const dias = new Map<string, Date>();
      for (const v of visitas) dias.set(comoDia(v.fecha), v.fecha);
      for (const f of previstosPorServicio.get(servicioId) ?? []) dias.set(comoDia(f), f);
      const ordenados = Array.from(dias.values()).sort((a, b) => a.getTime() - b.getTime());
      const cuantos = ordenados.length;

      const incidencia = await prisma.incidencia.create({
        data: {
          codigo: await generarCodigo("incidencia"),
          tipo: "GENERAL",
          estado: "NUEVA",
          motivo: "AUSENCIA",
          prioridad: "ALTA",
          descripcion:
            `${ausencia.profesional.nombre} ${ausencia.profesional.apellidos} está de ${COMO_SE_DICE[ausencia.tipo] ?? ausencia.tipo.toLowerCase().replace(/_/g, " ")} ` +
            `del ${ausencia.desde.toLocaleDateString("es-ES")} al ${ausencia.hasta.toLocaleDateString("es-ES")}. ` +
            `${cuantos === 1 ? "Queda sin cubrir 1 jornada" : `Quedan sin cubrir ${cuantos} jornadas`} de ` +
            `${cabecera.solicitud.necesidad.nombre} con ${cabecera.solicitud.persona.nombre} ` +
            `${cabecera.solicitud.persona.apellidos} (${ordenados.map(comoDia).join(", ")}). Busca reemplazo.`,
          servicioId,
          visitaId: visitas[0]?.id,
          creadoPorUsuarioId: req.usuario!.sub,
          // La ventana a cubrir es la de la ausencia: al buscar reemplazo se
          // cubren esos días y el servicio sigue siendo de quien lo lleva.
          cubrirDesde: desde,
          cubrirHasta: hasta,
        },
      });
      incidenciasAbiertas.push(incidencia.codigo);
    }
  }

  const cuenta = await prisma.usuario.findFirst({ where: { profesionalId: ausencia.profesionalId }, select: { id: true } });
  if (cuenta) {
    const verbo = parsed.data.estado === "APROBADA" ? "aprobada" : parsed.data.estado === "RECHAZADA" ? "rechazada" : "cancelada";
    await notificarUsuario(
      cuenta.id,
      "ausencia_resuelta",
      `Tu ausencia del ${ausencia.desde.toLocaleDateString("es-ES")} al ${ausencia.hasta.toLocaleDateString("es-ES")} ha sido ${verbo}${parsed.data.respuesta ? `: ${parsed.data.respuesta}` : "."}`,
    );
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "resolver_ausencia",
    entidadTipo: "Profesional",
    entidadId: ausencia.profesionalId,
    detalle:
      `${ausencia.tipo} → ${parsed.data.estado}` +
      (incidenciasAbiertas.length > 0 ? ` · ${incidenciasAbiertas.length} servicio(s) sin cubrir: ${incidenciasAbiertas.join(", ")}` : ""),
  });
  res.json({ ...actualizada, incidenciasAbiertas });
});

// ----------------------------------------------------- registro de jornada

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

interface DiaDeJornada {
  fecha: string;
  entrada: string | null;
  salida: string | null;
  minutos: number;
  servicio: string;
}

function horaLocal(f: Date | null): string | null {
  if (!f) return null;
  return `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
}

personalRouter.get("/registros", async (req, res) => {
  const usuario = req.usuario!;
  if (esGestorOrganizacion(usuario)) {
    const registros = await prisma.registroJornada.findMany({
      where: { organizacionId: usuario.organizacionId ?? "__none__" },
      include: { profesional: { select: { id: true, codigo: true, nombre: true, apellidos: true, dni: true, tipoRelacion: true } } },
      orderBy: [{ mes: "desc" }, { createdAt: "desc" }],
    });
    return res.json(registros);
  }
  if (usuario.rol === "PROFESIONAL") {
    const registros = await prisma.registroJornada.findMany({
      where: { profesionalId: usuario.profesionalId ?? "__none__" },
      include: { profesional: { select: { id: true, codigo: true, nombre: true, apellidos: true, dni: true, tipoRelacion: true } } },
      orderBy: { mes: "desc" },
    });
    return res.json(registros);
  }
  res.json([]);
});

const cerrarMesSchema = z.object({ mes: z.string().regex(mesRegex, "Formato esperado: AAAA-MM"), profesionalId: z.string().optional() });

// Cierra el mes: congela el detalle día a día de cada jornada fichada. El
// registro de jornada debe reflejar el horario concreto de entrada y salida,
// y conservarse cuatro años; si se recalculara cada vez que se abre, dejaría
// de ser un registro y pasaría a ser una consulta.
personalRouter.post("/registros/cerrar", soloGestion, async (req, res) => {
  const parsed = cerrarMesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const organizacionId = req.usuario!.organizacionId!;
  const [anio, mesNum] = parsed.data.mes.split("-").map(Number);
  const desde = new Date(anio, mesNum - 1, 1);
  const hasta = new Date(anio, mesNum, 1);

  const profesionales = await prisma.profesional.findMany({
    where: { organizacionId, ...(parsed.data.profesionalId ? { id: parsed.data.profesionalId } : {}) },
  });

  const cerrados: string[] = [];
  const saltados: string[] = [];

  for (const profesional of profesionales) {
    const visitas = await prisma.visita.findMany({
      where: {
        fecha: { gte: desde, lt: hasta },
        horaInicioReal: { not: null },
        OR: [{ profesionalId: profesional.id }, { profesionalId: null, servicio: { profesionalId: profesional.id } }],
      },
      include: { servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } } },
      orderBy: { fecha: "asc" },
    });

    if (visitas.length === 0) {
      saltados.push(`${profesional.nombre} ${profesional.apellidos}`);
      continue;
    }

    const existente = await prisma.registroJornada.findUnique({
      where: { profesionalId_mes: { profesionalId: profesional.id, mes: parsed.data.mes } },
    });
    // Un registro con la conformidad del trabajador ya no se reescribe: lo ha
    // firmado. Si hubiera que corregirlo, se retira la conformidad primero.
    if (existente?.conformeAt) {
      saltados.push(`${profesional.nombre} ${profesional.apellidos} (ya conforme)`);
      continue;
    }

    const detalle: DiaDeJornada[] = visitas.map((v) => ({
      fecha: v.fecha.toISOString().slice(0, 10),
      entrada: horaLocal(v.horaInicioReal),
      salida: horaLocal(v.horaFinReal),
      minutos: minutosFichados(v.horaInicioReal, v.horaFinReal) ?? 0,
      servicio: `${v.servicio.solicitud.necesidad.nombre} · ${v.servicio.solicitud.persona.nombre} ${v.servicio.solicitud.persona.apellidos}`,
    }));

    const minutosTrabajados = detalle.reduce((a, d) => a + d.minutos, 0);
    const datos = {
      mes: parsed.data.mes,
      profesionalId: profesional.id,
      organizacionId,
      minutosTrabajados,
      minutosContrato: profesional.tipoRelacion === "LABORAL" ? minutosDeContratoDelMes(parsed.data.mes, profesional.horasSemanales) : null,
      diasTrabajados: new Set(detalle.map((d) => d.fecha)).size,
      detalle: JSON.stringify(detalle),
      cerradoAt: new Date(),
    };

    if (existente) {
      await prisma.registroJornada.update({ where: { id: existente.id }, data: datos });
      cerrados.push(existente.codigo);
    } else {
      const creado = await prisma.registroJornada.create({ data: { codigo: await generarCodigo("registro"), ...datos } });
      cerrados.push(creado.codigo);
    }

    const cuenta = await prisma.usuario.findFirst({ where: { profesionalId: profesional.id }, select: { id: true } });
    if (cuenta) {
      await notificarUsuario(
        cuenta.id,
        "registro_jornada",
        `Tu registro de jornada de ${parsed.data.mes} está cerrado. Revísalo y da tu conformidad.`,
      );
    }
  }

  if (cerrados.length === 0) return res.status(409).json({ error: "No hay jornadas fichadas que registrar en ese mes" });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "cerrar_registro_jornada",
    entidadTipo: "RegistroJornada",
    entidadId: cerrados[0],
    detalle: `${parsed.data.mes} · ${cerrados.length} registros`,
  });

  const registros = await prisma.registroJornada.findMany({
    where: { organizacionId, mes: parsed.data.mes },
    include: { profesional: { select: { id: true, codigo: true, nombre: true, apellidos: true, dni: true, tipoRelacion: true } } },
  });
  res.status(201).json({ cerrados, saltados, registros });
});

const conformeSchema = z.object({ nota: z.string().optional() });

// La conformidad la da quien ha trabajado, no coordinación: es su jornada.
personalRouter.post("/registros/:id/conforme", async (req, res) => {
  const parsed = conformeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const registro = await prisma.registroJornada.findUnique({ where: { id: req.params.id } });
  if (!registro) return res.status(404).json({ error: "No encontrado" });
  const usuario = req.usuario!;
  if (usuario.rol !== "PROFESIONAL" || usuario.profesionalId !== registro.profesionalId) {
    return res.status(403).json({ error: "La conformidad sólo la puede dar quien hizo la jornada" });
  }
  if (registro.conformeAt) return res.status(409).json({ error: "Ya habías dado tu conformidad" });

  const actualizado = await prisma.registroJornada.update({
    where: { id: registro.id },
    data: { conformeAt: new Date(), conformeNota: parsed.data.nota ?? null },
  });
  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: registro.organizacionId,
    accion: "conformidad_registro_jornada",
    entidadTipo: "RegistroJornada",
    entidadId: registro.id,
    detalle: registro.mes,
  });
  res.json(actualizado);
});
