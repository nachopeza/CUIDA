import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { ocultarTarifaSiProcede } from "../services/permisos.js";

export const profesionalesRouter = Router();
profesionalesRouter.use(autenticar);

const crearProfesionalSchema = z.object({
  nombre: z.string().min(1),
  apellidos: z.string().min(1),
  telefono: z.string().optional(),
  zona: z.string().optional(),
  dni: z.string().optional(),
  numeroCuenta: z.string().optional(),
  bizum: z.string().optional(),
  foto: z.string().optional(),
  biografia: z.string().optional(),
  empresaColaboradoraId: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

const editarProfesionalSchema = z.object({
  nombre: z.string().min(1).optional(),
  apellidos: z.string().min(1).optional(),
  telefono: z.string().optional(),
  zona: z.string().optional(),
  dni: z.string().optional(),
  numeroCuenta: z.string().optional(),
  bizum: z.string().optional(),
  foto: z.string().optional(),
  biografia: z.string().optional(),
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
      zona: parsed.data.zona,
      dni: parsed.data.dni,
      numeroCuenta: parsed.data.numeroCuenta,
      bizum: parsed.data.bizum,
      foto: parsed.data.foto,
      biografia: parsed.data.biografia,
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
    include: { empresaColaboradora: true },
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
    include: { empresaColaboradora: true },
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

// Documentos del profesional (sección "ver toda su información...
// documentación. Un perfil completamente avanzado"): DNI, certificados,
// seguros, etc. — el propio profesional o un gestor de su organización.
profesionalesRouter.get("/:id/documentos", async (req, res) => {
  const usuario = req.usuario!;
  const esPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.id;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario.rol);
  if (!esPropio && !esGestor) return res.status(403).json({ error: "Sin permiso" });

  const documentos = await prisma.documento.findMany({
    where: { profesionalId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(documentos);
});

const crearDocumentoSchema = z.object({
  nombre: z.string().min(1),
  url: z.string().min(1),
});

profesionalesRouter.post("/:id/documentos", async (req, res) => {
  const usuario = req.usuario!;
  const esPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.id;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario.rol);
  if (!esPropio && !esGestor) return res.status(403).json({ error: "Sin permiso" });

  const parsed = crearDocumentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const profesional = await prisma.profesional.findUnique({ where: { id: req.params.id } });
  if (!profesional || profesional.organizacionId !== usuario.organizacionId) return res.status(404).json({ error: "No encontrado" });

  const documento = await prisma.documento.create({
    data: { nombre: parsed.data.nombre, url: parsed.data.url, profesionalId: profesional.id },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: profesional.organizacionId,
    accion: "añadir_documento_profesional",
    entidadTipo: "Profesional",
    entidadId: profesional.id,
  });

  res.status(201).json(documento);
});

profesionalesRouter.delete("/:id/documentos/:documentoId", async (req, res) => {
  const usuario = req.usuario!;
  const esPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.id;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario.rol);
  if (!esPropio && !esGestor) return res.status(403).json({ error: "Sin permiso" });

  const documento = await prisma.documento.findUnique({ where: { id: req.params.documentoId } });
  if (!documento || documento.profesionalId !== req.params.id) return res.status(404).json({ error: "No encontrado" });

  await prisma.documento.delete({ where: { id: documento.id } });
  res.status(204).send();
});

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

  // El profesional nunca ve la tarifa del servicio (sección 4/14), aunque
  // Prisma la incluya por defecto al traer la relación; un gestor sí la ve.
  const resultado = visitas.map((v) => ({ ...v, servicio: ocultarTarifaSiProcede(v.servicio, esGestor) }));
  res.json(resultado);
});
