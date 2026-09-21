import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { puedeAccederPersona } from "../services/permisos.js";

export const personasRouter = Router();
personasRouter.use(autenticar);

const perfilPersonaSchema = {
  nombre: z.string().min(1),
  apellidos: z.string().min(1),
  fechaNacimiento: z.string().datetime().optional(),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  preferencias: z.string().optional(),
  contactos: z.string().optional(),
  medicacion: z.string().optional(),
  medico: z.string().optional(),
  recomendaciones: z.string().optional(),
};

const crearPersonaSchema = z.object({
  ...perfilPersonaSchema,
  // Cuenta de acceso de la persona, creada en el mismo paso de alta (sección
  // "se debe generar automáticamente un usuario, que tenga plenas
  // funciones" — nunca debería quedar un perfil sin forma de entrar a la
  // app, salvo que coordinación decida no darle acceso todavía).
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});
const editarPersonaSchema = z.object(perfilPersonaSchema).partial();

function generarPassword(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Alta de persona (sección 6: alta, identificación permanente...). Si se da
// email, se crea también su cuenta de acceso (rol PERSONA) en el mismo paso;
// si no se da password, se genera una y se devuelve en la respuesta — es la
// única vez que se puede mostrar en claro.
personasRouter.post("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = crearPersonaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!req.usuario!.organizacionId) return res.status(400).json({ error: "Usuario sin organización" });

  const { email, password, ...datosPersona } = parsed.data;
  if (email) {
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese email" });
  }

  const codigo = await generarCodigo("persona");
  const persona = await prisma.persona.create({
    data: {
      codigo,
      estado: "ACTIVA",
      organizacionId: req.usuario!.organizacionId,
      ...datosPersona,
      fechaNacimiento: datosPersona.fechaNacimiento ? new Date(datosPersona.fechaNacimiento) : undefined,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "crear_persona",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });

  let passwordGenerada: string | undefined;
  if (email) {
    passwordGenerada = password ?? generarPassword();
    const passwordHash = await bcrypt.hash(passwordGenerada, 10);
    await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        rol: "PERSONA",
        nombre: `${datosPersona.nombre} ${datosPersona.apellidos}`,
        organizacionId: req.usuario!.organizacionId,
        personaId: persona.id,
      },
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      organizacionId: req.usuario!.organizacionId,
      accion: "crear_cuenta_persona",
      entidadTipo: "Persona",
      entidadId: persona.id,
    });
  }

  res.status(201).json({ ...persona, cuentaCreada: Boolean(email), email, passwordGenerada: password ? undefined : passwordGenerada });
});

const crearCuentaSchema = z.object({ email: z.string().email(), password: z.string().min(6).optional() });

// Crear la cuenta de acceso más adelante, si no se dio al dar de alta a la
// persona (sección "si sale, pero tiempo después" — cubre ese caso también).
personasRouter.post("/:id/cuenta", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = crearCuentaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const persona = await prisma.persona.findUnique({ where: { id: req.params.id }, include: { usuario: true } });
  if (!persona || persona.organizacionId !== req.usuario!.organizacionId) return res.status(404).json({ error: "No encontrada" });
  if (persona.usuario) return res.status(409).json({ error: "Esta persona ya tiene una cuenta de acceso" });

  const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
  if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese email" });

  const passwordGenerada = parsed.data.password ?? generarPassword();
  const passwordHash = await bcrypt.hash(passwordGenerada, 10);
  await prisma.usuario.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      rol: "PERSONA",
      nombre: `${persona.nombre} ${persona.apellidos}`,
      organizacionId: req.usuario!.organizacionId,
      personaId: persona.id,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "crear_cuenta_persona",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });

  res.status(201).json({ email: parsed.data.email, passwordGenerada: parsed.data.password ? undefined : passwordGenerada });
});

// Resetear la contraseña de la cuenta ya existente (sección "cambios de
// datos, contraseñas, usuarios"): coordinación puede generar una nueva sin
// tener que borrar y volver a crear la cuenta — se muestra una sola vez,
// igual que al crearla.
personasRouter.post("/:id/cuenta/password", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const persona = await prisma.persona.findUnique({ where: { id: req.params.id }, include: { usuario: true } });
  if (!persona || persona.organizacionId !== req.usuario!.organizacionId) return res.status(404).json({ error: "No encontrada" });
  if (!persona.usuario) return res.status(409).json({ error: "Esta persona todavía no tiene cuenta de acceso" });

  const passwordGenerada = generarPassword();
  const passwordHash = await bcrypt.hash(passwordGenerada, 10);
  await prisma.usuario.update({ where: { id: persona.usuario.id }, data: { passwordHash } });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "resetear_password_persona",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });

  res.json({ email: persona.usuario.email, passwordGenerada });
});

personasRouter.get("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const personas = await prisma.persona.findMany({
    where: { organizacionId: req.usuario!.organizacionId ?? undefined },
    include: { usuario: { select: { id: true, email: true, activo: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(personas);
});

personasRouter.get("/:id", async (req, res) => {
  const permitido = await puedeAccederPersona(req.usuario!, req.params.id);
  if (!permitido) return res.status(403).json({ error: "Sin permiso para ver esta persona" });

  const persona = await prisma.persona.findUnique({
    where: { id: req.params.id },
    include: {
      usuario: { select: { id: true, email: true, activo: true, nombre: true } },
      familiares: { include: { usuario: { select: { id: true, email: true, activo: true, nombre: true } } } },
    },
  });
  if (!persona) return res.status(404).json({ error: "No encontrada" });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "ver_persona",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });

  res.json(persona);
});

// Campos que un familiar autorizado puede tocar directamente (sección panel
// familiar: "menú con... editar familiar"): datos de contacto/logística que
// la propia familia conoce mejor y cambia con más frecuencia que
// coordinación. Identidad (nombre/apellidos/fecha) y datos con matiz
// asistencial (medicación, médico, recomendaciones) siguen siendo solo de
// coordinación, que es quien los registra con criterio (sección 6).
const CAMPOS_EDITABLES_FAMILIAR = ["telefono", "direccion", "contactos", "preferencias"] as const;

// Editar el perfil completo (sección 6: ubicación, contactos, medicación,
// médico, recomendaciones). Gestores editan cualquier campo; un familiar
// autorizado (puedeSolicitar) solo el subconjunto de contacto/logística de
// arriba.
personasRouter.patch("/:id", async (req, res) => {
  const usuario = req.usuario!;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario.rol);
  let esFamiliarAutorizado = false;
  if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { personaId: req.params.id, usuarioId: usuario.sub, revocadoAt: null, puedeSolicitar: true },
    });
    esFamiliarAutorizado = relacion !== null;
  }
  if (!esGestor && !esFamiliarAutorizado) return res.status(403).json({ error: "Sin permiso" });

  const parsed = editarPersonaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const permitido = await puedeAccederPersona(usuario, req.params.id);
  if (!permitido) return res.status(403).json({ error: "Sin permiso sobre esta persona" });

  const datos = esGestor
    ? parsed.data
    : Object.fromEntries(Object.entries(parsed.data).filter(([campo]) => (CAMPOS_EDITABLES_FAMILIAR as readonly string[]).includes(campo)));

  const persona = await prisma.persona.update({
    where: { id: req.params.id },
    data: {
      ...datos,
      fechaNacimiento: esGestor && parsed.data.fechaNacimiento ? new Date(parsed.data.fechaNacimiento) : undefined,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "editar_persona",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });

  res.json(persona);
});

const vincularFamiliarSchema = z
  .object({
    usuarioId: z.string().min(1).optional(),
    nombre: z.string().optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    parentesco: z.string().min(1),
    esRepresentante: z.boolean().default(false),
    puedeSolicitar: z.boolean().default(true),
    puedeVerHistorial: z.boolean().default(true),
    puedeVerImportes: z.boolean().default(true),
  })
  .refine((d) => d.usuarioId ?? (d.email && d.password), {
    message: "Indica usuarioId (familiar ya existente) o email+password (familiar nuevo)",
  });

// Vincular familiar/representante autorizado (sección 6: Familia -
// representantes, permisos). Si no existe usuario todavía, se crea aquí
// mismo con rol FAMILIAR — así el coordinador no necesita una pantalla
// aparte de gestión de usuarios para dar de alta a un familiar nuevo.
personasRouter.post("/:id/familiares", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = vincularFamiliarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const permitido = await puedeAccederPersona(req.usuario!, req.params.id);
  if (!permitido) return res.status(403).json({ error: "Sin permiso sobre esta persona" });

  let usuarioId = parsed.data.usuarioId;
  if (!usuarioId && parsed.data.email && parsed.data.password) {
    const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
    if (existente) return res.status(409).json({ error: "Ya existe un usuario con ese email" });
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const usuario = await prisma.usuario.create({
      data: { email: parsed.data.email, passwordHash, rol: "FAMILIAR", nombre: parsed.data.nombre, organizacionId: req.usuario!.organizacionId },
    });
    usuarioId = usuario.id;
  }

  const relacion = await prisma.familiarRelacion.create({
    data: {
      personaId: req.params.id,
      usuarioId: usuarioId!,
      parentesco: parsed.data.parentesco,
      esRepresentante: parsed.data.esRepresentante,
      puedeSolicitar: parsed.data.puedeSolicitar,
      puedeVerHistorial: parsed.data.puedeVerHistorial,
      puedeVerImportes: parsed.data.puedeVerImportes,
    },
    include: { usuario: { select: { id: true, email: true, nombre: true } } },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "vincular_familiar",
    entidadTipo: "Persona",
    entidadId: req.params.id,
  });

  res.status(201).json(relacion);
});
