import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";

// Catálogo de servicios ofrecidos (sección "se debe de tener una opción
// para registrar los servicios que ofrecemos, que se puedan tarificar y
// demás — como si fuera un ERP"). Es lo que la organización vende (con su
// tipo de IVA), distinto de NecesidadCatalogo (cómo lo pide la persona) y
// de Servicio (el encargo concreto ya asignado a alguien).
export const catalogoServiciosRouter = Router();
catalogoServiciosRouter.use(autenticar);
catalogoServiciosRouter.use(requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"));

const crearSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  // 4 = superreducido (plazas concertadas, precio público, o prestación
  // vinculada a dependencia que cubre >10% del precio); 10 = reducido
  // (contratado de forma particular, sin ayuda pública ni plaza concertada).
  ivaPorcentaje: z.number().min(0).max(21).default(4),
  precioBase: z.number().nonnegative().optional(),
});

const editarSchema = crearSchema.partial().extend({ activo: z.boolean().optional() });

catalogoServiciosRouter.post("/", async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!req.usuario!.organizacionId) return res.status(400).json({ error: "Usuario sin organización" });

  const codigo = await generarCodigo("tipoServicioOfrecido");
  const tipo = await prisma.tipoServicioOfrecido.create({
    data: { codigo, ...parsed.data, organizacionId: req.usuario!.organizacionId },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "crear_tipo_servicio_ofrecido",
    entidadTipo: "TipoServicioOfrecido",
    entidadId: tipo.id,
  });

  res.status(201).json(tipo);
});

catalogoServiciosRouter.get("/", async (req, res) => {
  const tipos = await prisma.tipoServicioOfrecido.findMany({
    where: { organizacionId: req.usuario!.organizacionId ?? undefined },
    orderBy: { nombre: "asc" },
  });
  res.json(tipos);
});

catalogoServiciosRouter.patch("/:id", async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const tipo = await prisma.tipoServicioOfrecido.findUnique({ where: { id: req.params.id } });
  if (!tipo) return res.status(404).json({ error: "No encontrado" });
  if (tipo.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const actualizado = await prisma.tipoServicioOfrecido.update({ where: { id: tipo.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: tipo.organizacionId,
    accion: "editar_tipo_servicio_ofrecido",
    entidadTipo: "TipoServicioOfrecido",
    entidadId: tipo.id,
  });

  res.json(actualizado);
});
