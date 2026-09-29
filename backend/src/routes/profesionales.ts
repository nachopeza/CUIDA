import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { ocultarTarifaSiProcede, soloLoQueCobraElProfesional } from "../services/permisos.js";
import { registrarHistorial } from "../services/estados.js";
import { notificarGestores } from "../services/notificaciones.js";

export const profesionalesRouter = Router();
profesionalesRouter.use(autenticar);

const crearProfesionalSchema = z.object({
  nombre: z.string().min(1),
  apellidos: z.string().min(1),
  telefono: z.string().optional(),
  // Zona de trabajo como lista cerrada, para poder filtrar por ella; `zona`
  // se queda para afinar a mano dentro del municipio.
  comunidad: z.string().max(4).optional(),
  municipio: z.string().max(120).optional(),
  zona: z.string().optional(),
  carneConducir: z.enum(["NO", "B", "A", "C", "D"]).optional(),
  vehiculoPropio: z.boolean().optional(),
  // Cómo trabaja: de esto depende su liquidación (retención de IRPF si es
  // autónoma) y, más adelante, su nómina y su cuadrante.
  tipoRelacion: z.enum(["LABORAL", "AUTONOMO"]).optional(),
  irpfPorcentaje: z.number().min(0).max(60).nullable().optional(),
  horasSemanales: z.number().int().min(0).max(60).nullable().optional(),
  titulacion: z
    .enum(["SIN_TITULACION", "ATENCION_SOCIOSANITARIA", "AUXILIAR_ENFERMERIA", "ENFERMERIA", "TRABAJO_SOCIAL", "FISIOTERAPIA", "TERAPIA_OCUPACIONAL", "PSICOLOGIA", "OTRA"])
    .nullable()
    .optional(),
  dni: z.string().optional(),
  numeroCuenta: z.string().optional(),
  bizum: z.string().optional(),
  foto: z.string().optional(),
  biografia: z.string().optional(),
  disponibilidad: z.string().optional(),
  empresaColaboradoraId: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

const editarProfesionalSchema = z.object({
  nombre: z.string().min(1).optional(),
  apellidos: z.string().min(1).optional(),
  telefono: z.string().optional(),
  // Zona de trabajo como lista cerrada, para poder filtrar por ella; `zona`
  // se queda para afinar a mano dentro del municipio.
  comunidad: z.string().max(4).optional(),
  municipio: z.string().max(120).optional(),
  zona: z.string().optional(),
  carneConducir: z.enum(["NO", "B", "A", "C", "D"]).optional(),
  vehiculoPropio: z.boolean().optional(),
  // Cómo trabaja: de esto depende su liquidación (retención de IRPF si es
  // autónoma) y, más adelante, su nómina y su cuadrante.
  tipoRelacion: z.enum(["LABORAL", "AUTONOMO"]).optional(),
  irpfPorcentaje: z.number().min(0).max(60).nullable().optional(),
  horasSemanales: z.number().int().min(0).max(60).nullable().optional(),
  titulacion: z
    .enum(["SIN_TITULACION", "ATENCION_SOCIOSANITARIA", "AUXILIAR_ENFERMERIA", "ENFERMERIA", "TRABAJO_SOCIAL", "FISIOTERAPIA", "TERAPIA_OCUPACIONAL", "PSICOLOGIA", "OTRA"])
    .nullable()
    .optional(),
  dni: z.string().optional(),
  numeroCuenta: z.string().optional(),
  bizum: z.string().optional(),
  foto: z.string().optional(),
  biografia: z.string().optional(),
  disponibilidad: z.string().optional(),
  empresaColaboradoraId: z.string().nullable().optional(),
});

// Alta de profesional (sección 6). Email+password son opcionales: si se dan,
// se crea también su acceso (rol PROFESIONAL) en el mismo paso.
profesionalesRouter.post("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = crearProfesionalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!req.usuario!.organizacionId) return res.status(400).json({ error: "Usuario sin organización" });
  if ((parsed.data.email && !parsed.data.password) || (!parsed.data.email && parsed.data.password)) {
    return res.status(400).json({ error: "Email y contraseña deben indicarse juntos" });
  }

  const codigo = await generarCodigo("profesional");
  const profesional = await prisma.profesional.create({
    data: {
      codigo,
      nombre: parsed.data.nombre,
      apellidos: parsed.data.apellidos,
      telefono: parsed.data.telefono,
      comunidad: parsed.data.comunidad,
      municipio: parsed.data.municipio,
      zona: parsed.data.zona,
      carneConducir: parsed.data.carneConducir,
      vehiculoPropio: parsed.data.vehiculoPropio,
      tipoRelacion: parsed.data.tipoRelacion,
      irpfPorcentaje: parsed.data.irpfPorcentaje,
      horasSemanales: parsed.data.horasSemanales,
      titulacion: parsed.data.titulacion,
      dni: parsed.data.dni,
      numeroCuenta: parsed.data.numeroCuenta,
      bizum: parsed.data.bizum,
      foto: parsed.data.foto,
      biografia: parsed.data.biografia,
      disponibilidad: parsed.data.disponibilidad,
      empresaColaboradoraId: parsed.data.empresaColaboradoraId,
      estado: "ACTIVO",
      organizacionId: req.usuario!.organizacionId,
    },
  });

  if (parsed.data.email && parsed.data.password) {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.usuario.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        rol: "PROFESIONAL",
        organizacionId: req.usuario!.organizacionId,
        profesionalId: profesional.id,
      },
    });
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "crear_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
  });

  res.status(201).json(profesional);
});

// Lista de candidatos para el coordinador (sección 10: "lista de candidatos
// explicable → coordinador selecciona").
profesionalesRouter.get("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const profesionales = await prisma.profesional.findMany({
    where: { organizacionId: req.usuario!.organizacionId ?? undefined, estado: "ACTIVO" },
    include: { empresaColaboradora: true, usuario: { select: { email: true, activo: true } } },
    orderBy: { nombre: "asc" },
  });
  res.json(profesionales);
});

// Ficha de un profesional (para que pueda ver/editar su propio perfil, o un
// gestor consulte el de cualquiera de su organización).
profesionalesRouter.get("/:id", async (req, res) => {
  const usuario = req.usuario!;
  const esPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.id;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario.rol);
  if (!esPropio && !esGestor) return res.status(403).json({ error: "Sin permiso" });

  const profesional = await prisma.profesional.findUnique({
    where: { id: req.params.id },
    include: { empresaColaboradora: true, usuario: { select: { email: true, activo: true } } },
  });
  if (!profesional || profesional.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });

  res.json(profesional);
});

// Editar perfil (sección coordinación: "los perfiles de profesionales se
// deben poder editar e incluir número de cuenta, Bizum, carné..."). El
// propio profesional puede editar sus datos de contacto/cobro; un gestor
// puede editar cualquier profesional de su organización, incluida la
// empresa colaboradora para la que trabaja.
profesionalesRouter.patch("/:id", async (req, res) => {
  const usuario = req.usuario!;
  const esPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.id;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario.rol);
  if (!esPropio && !esGestor) return res.status(403).json({ error: "Sin permiso" });

  const parsed = editarProfesionalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const profesional = await prisma.profesional.findUnique({ where: { id: req.params.id } });
  if (!profesional) return res.status(404).json({ error: "No encontrado" });
  if (profesional.organizacionId !== usuario.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const datos = { ...parsed.data };
  // El profesional no puede autoasignarse una empresa colaboradora distinta;
  // eso lo decide coordinación.
  if (!esGestor) delete datos.empresaColaboradoraId;

  const actualizado = await prisma.profesional.update({
    where: { id: profesional.id },
    data: datos,
    include: { empresaColaboradora: true },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: profesional.organizacionId,
    accion: "editar_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
  });

  res.json(actualizado);
});

// Eliminar (sección "si selecciono... pueda eliminarlo"): solo si no tiene
// historial operativo; en cuanto ha hecho servicios, la vía correcta es
// desactivarlo, no borrar el rastro de quién atendió a quién.
profesionalesRouter.delete("/:id", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const usuario = req.usuario!;
  const profesional = await prisma.profesional.findUnique({
    where: { id: req.params.id },
    include: { servicios: { take: 1 }, visitas: { take: 1 }, usuario: true },
  });
  if (!profesional || profesional.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });
  if (profesional.servicios.length > 0 || profesional.visitas.length > 0) {
    return res.status(409).json({ error: "Ya ha realizado servicios; desactívalo en vez de eliminarlo" });
  }

  await prisma.$transaction([
    prisma.documento.deleteMany({ where: { profesionalId: profesional.id } }),
    prisma.servicioInteres.deleteMany({ where: { profesionalId: profesional.id } }),
    ...(profesional.usuario ? [prisma.usuario.delete({ where: { id: profesional.usuario.id } })] : []),
    prisma.profesional.delete({ where: { id: profesional.id } }),
  ]);

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: profesional.organizacionId,
    accion: "eliminar_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
    detalle: profesional.codigo,
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Dar de baja a un profesional
//
// Borrar sólo se puede si nunca ha hecho nada; en cuanto ha atendido a alguien
// el rastro tiene que quedarse. Pero "no se puede eliminar" no es una respuesta
// para quien deja de trabajar con nosotros: hacía falta una salida de verdad. La
// baja lo deja fuera de circulación —no se le puede proponer nada ni puede
// entrar— y, sobre todo, recoge lo que dejaba a medias: los servicios que tenía
// y que ahora nadie va a hacer.
//
//   propuestas sin aceptar    vuelven a estar sin cubrir, a la vista de todos
//   servicios en marcha       abren una incidencia de reemplazo, con la persona
//                             atendida y las jornadas que se quedan sin ir
//   días pedidos sin contestar se cancelan: ya no hay a quién concedérselos
// ---------------------------------------------------------------------------
const ESTADOS_EN_MARCHA = ["ASIGNADO", "CONFIRMADO", "EN_CURSO"];

async function impactoDeLaBaja(profesionalId: string, organizacionId: string) {
  const servicios = await prisma.servicio.findMany({
    where: { organizacionId, profesionalId, estado: { in: ESTADOS_EN_MARCHA as never[] } },
    include: {
      solicitud: { include: { persona: true, necesidad: true } },
      visitas: { where: { estado: { in: ["PROGRAMADA", "CONFIRMADA"] }, fecha: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, orderBy: { fecha: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const ausencias = await prisma.ausencia.count({ where: { profesionalId, estado: "SOLICITADA" } });
  const intereses = await prisma.servicioInteres.count({ where: { profesionalId } });
  return {
    propuestas: servicios.filter((s) => s.estado === "ASIGNADO"),
    enMarcha: servicios.filter((s) => s.estado !== "ASIGNADO"),
    ausenciasPendientes: ausencias,
    interesesAbiertos: intereses,
  };
}

// Qué pasaría, antes de hacerlo: la baja no se puede deshacer del todo (las
// incidencias abiertas siguen abiertas), así que se enseña el alcance primero.
profesionalesRouter.get("/:id/baja-impacto", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const usuario = req.usuario!;
  const profesional = await prisma.profesional.findUnique({ where: { id: req.params.id } });
  if (!profesional || profesional.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });
  const { propuestas, enMarcha, ausenciasPendientes, interesesAbiertos } = await impactoDeLaBaja(profesional.id, profesional.organizacionId);
  const resumen = (s: (typeof enMarcha)[number]) => ({
    id: s.id,
    codigo: s.codigo,
    persona: `${s.solicitud.persona.nombre} ${s.solicitud.persona.apellidos}`,
    necesidad: s.solicitud.necesidad.nombre,
    jornadasPorHacer: s.visitas.length,
    proxima: s.visitas[0]?.fecha ?? null,
  });
  res.json({
    estado: profesional.estado,
    propuestas: propuestas.map(resumen),
    enMarcha: enMarcha.map(resumen),
    ausenciasPendientes,
    interesesAbiertos,
  });
});

const bajaSchema = z.object({ motivo: z.string().min(3, "Di por qué se da de baja") });

profesionalesRouter.post("/:id/baja", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = bajaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const usuario = req.usuario!;
  const profesional = await prisma.profesional.findUnique({ where: { id: req.params.id }, include: { usuario: true } });
  if (!profesional || profesional.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });
  if (profesional.estado === "INACTIVO") return res.status(409).json({ error: "Ya está de baja" });

  const nombre = `${profesional.nombre} ${profesional.apellidos}`;
  const { propuestas, enMarcha } = await impactoDeLaBaja(profesional.id, profesional.organizacionId);

  // Las propuestas vuelven al mercado como si las hubiera rechazado.
  for (const s of propuestas) {
    await prisma.servicio.update({ where: { id: s.id }, data: { estado: "PENDIENTE", profesionalId: null } });
    await registrarHistorial({
      entidadTipo: "Servicio",
      estadoAnterior: s.estado,
      estadoNuevo: "PENDIENTE",
      motivo: `${nombre} ha causado baja: la propuesta vuelve a estar sin cubrir`,
      servicioId: s.id,
    });
  }

  // Lo que estaba en marcha necesita a alguien: una incidencia por servicio.
  const incidencias: string[] = [];
  for (const s of enMarcha) {
    const dias = s.visitas.map((v) => v.fecha.toLocaleDateString("es-ES", { day: "numeric", month: "short" }));
    const incidencia = await prisma.incidencia.create({
      data: {
        codigo: await generarCodigo("incidencia"),
        tipo: "GENERAL",
        estado: "NUEVA",
        motivo: "AUSENCIA",
        prioridad: "ALTA",
        descripcion:
          `${nombre} ya no trabaja con nosotros (${parsed.data.motivo.trim()}). ` +
          `${s.visitas.length === 0 ? "No tiene jornadas creadas" : s.visitas.length === 1 ? "Queda sin cubrir 1 jornada" : `Quedan sin cubrir ${s.visitas.length} jornadas`} de ` +
          `${s.solicitud.necesidad.nombre} con ${s.solicitud.persona.nombre} ${s.solicitud.persona.apellidos}` +
          `${dias.length > 0 ? ` (${dias.slice(0, 6).join(", ")}${dias.length > 6 ? "…" : ""})` : ""}. El servicio necesita un relevo definitivo.`,
        servicioId: s.id,
        visitaId: s.visitas[0]?.id,
        creadoPorUsuarioId: usuario.sub,
      },
    });
    incidencias.push(incidencia.codigo);
  }

  // Ya no hay quien conceda lo que pidió, ni candidatura que valga.
  await prisma.ausencia.updateMany({ where: { profesionalId: profesional.id, estado: "SOLICITADA" }, data: { estado: "CANCELADA", respuesta: "Baja del profesional" } });
  await prisma.servicioInteres.deleteMany({ where: { profesionalId: profesional.id } });

  await prisma.profesional.update({ where: { id: profesional.id }, data: { estado: "INACTIVO" } });
  if (profesional.usuario) await prisma.usuario.update({ where: { id: profesional.usuario.id }, data: { activo: false } });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: profesional.organizacionId,
    accion: "baja_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
    detalle: `${profesional.codigo} · ${parsed.data.motivo.trim()} · ${propuestas.length} propuesta(s) devueltas, ${incidencias.length} servicio(s) sin cubrir`,
  });
  await notificarGestores(
    profesional.organizacionId,
    "profesional_baja",
    `${nombre} está de baja. ${incidencias.length > 0 ? `${incidencias.length} servicio(s) necesitan relevo (${incidencias.join(", ")}).` : "No dejaba servicios en marcha."}`,
  ).catch(() => undefined);

  res.json({ ok: true, propuestasDevueltas: propuestas.map((s) => s.codigo), incidencias });
});

// Volver a darlo de alta. No recupera lo que se reasignó: los servicios ya
// tienen a otra persona, y quitársela sería otra baja al revés.
profesionalesRouter.post("/:id/reactivar", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const usuario = req.usuario!;
  const profesional = await prisma.profesional.findUnique({ where: { id: req.params.id }, include: { usuario: true } });
  if (!profesional || profesional.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });
  if (profesional.estado !== "INACTIVO") return res.status(409).json({ error: "No está de baja" });

  await prisma.profesional.update({ where: { id: profesional.id }, data: { estado: "ACTIVO" } });
  if (profesional.usuario) await prisma.usuario.update({ where: { id: profesional.usuario.id }, data: { activo: true } });
  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: profesional.organizacionId,
    accion: "reactivar_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
    detalle: profesional.codigo,
  });
  res.json({ ok: true });
});

// Resetear la contraseña de la cuenta de acceso del profesional (sección
// "cambios de datos, contraseñas, usuarios"): mismo patrón que en personas,
// solo coordinación puede hacerlo, se muestra una sola vez.
profesionalesRouter.post("/:id/cuenta/password", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const usuario = req.usuario!;
  const profesional = await prisma.profesional.findUnique({ where: { id: req.params.id } });
  if (!profesional || profesional.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });

  const cuenta = await prisma.usuario.findUnique({ where: { profesionalId: profesional.id } });
  if (!cuenta) return res.status(409).json({ error: "Este profesional todavía no tiene cuenta de acceso" });

  const passwordGenerada = Math.random().toString(36).slice(2, 10);
  const passwordHash = await bcrypt.hash(passwordGenerada, 10);
  await prisma.usuario.update({ where: { id: cuenta.id }, data: { passwordHash } });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: profesional.organizacionId,
    accion: "resetear_password_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
  });

  res.json({ email: cuenta.email, passwordGenerada });
});

// Los documentos del profesional viven en su expediente (/personal/:id/documentos).

// Agenda del día/periodo del profesional (interfaz CUIDA PROFESIONAL, sección 9).
profesionalesRouter.get("/:id/agenda", async (req, res) => {
  const usuario = req.usuario!;
  const esPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.id;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"].includes(usuario.rol);
  if (!esPropio && !esGestor) return res.status(403).json({ error: "Sin permiso" });

  const visitas = await prisma.visita.findMany({
    where: { servicio: { profesionalId: req.params.id } },
    include: {
      servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } },
      tareas: true,
      actuaciones: true,
      incidencias: true,
    },
    orderBy: { fecha: "asc" },
  });

  // El profesional no ve lo que paga la familia ni el margen de CUIDA
  // (sección 4/14), pero sí lo que cobra él: es su nómina, y sin ella no
  // puede saber lo que va a ingresar este mes. Un gestor lo ve todo.
  // El filtro se aplica a la jornada entera, no solo a su servicio: desde que
  // el motor de tiempo escribe los importes en la propia visita, lo que paga la
  // familia y el margen de CUIDA también viajan ahí.
  const resultado = esGestor ? visitas : visitas.map((v) => soloLoQueCobraElProfesional(v as unknown as Record<string, unknown>));
  res.json(resultado);
});
