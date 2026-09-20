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
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
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
    orderBy: { nombre: "asc" },
  });
  res.json(profesionales);
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
    },
    orderBy: { fecha: "asc" },
  });

  // El profesional nunca ve la tarifa del servicio (sección 4/14), aunque
  // Prisma la incluya por defecto al traer la relación; un gestor sí la ve.
  const resultado = visitas.map((v) => ({ ...v, servicio: ocultarTarifaSiProcede(v.servicio, esGestor) }));
  res.json(resultado);
});
