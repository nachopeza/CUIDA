import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";

export const necesidadesRouter = Router();
necesidadesRouter.use(autenticar);

// Catálogo de servicios (sección "Servicios son lo que ofrecemos:
// acompañamiento, comidas, limpieza etc."): un único catálogo, cada uno con
// su % de IVA — lo que antes eran dos catálogos parecidos (necesidades +
// un catálogo aparte solo para facturación) ahora es uno solo.
necesidadesRouter.get("/", async (_req, res) => {
  const necesidades = await prisma.necesidadCatalogo.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });
  res.json(necesidades);
});

// Ver también los inactivos, para gestión desde coordinación (sección
// "creas servicios, filtrarlos, contabilizarlos").
necesidadesRouter.get("/todas", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (_req, res) => {
  const necesidades = await prisma.necesidadCatalogo.findMany({ orderBy: { nombre: "asc" } });
  res.json(necesidades);
});

function slugificar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const crearSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  // 4 = superreducido (plazas concertadas, precio público, o prestación
  // vinculada a dependencia que cubre >10% del precio); 10 = reducido
  // (contratado de forma particular, sin ayuda pública ni plaza concertada).
  ivaPorcentaje: z.number().min(0).max(21).default(4),
  precioBase: z.number().nonnegative().optional(),
});

necesidadesRouter.post("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let codigo = slugificar(parsed.data.nombre) || "servicio";
  if (await prisma.necesidadCatalogo.findUnique({ where: { codigo } })) {
    codigo = `${codigo}_${Date.now().toString(36)}`;
  }

  const necesidad = await prisma.necesidadCatalogo.create({
    data: { codigo, ...parsed.data },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "crear_servicio_catalogo",
    entidadTipo: "NecesidadCatalogo",
    entidadId: necesidad.id,
  });

  res.status(201).json(necesidad);
});

const editarSchema = crearSchema.partial().extend({ activo: z.boolean().optional() });

necesidadesRouter.patch("/:id", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const necesidad = await prisma.necesidadCatalogo.findUnique({ where: { id: req.params.id } });
  if (!necesidad) return res.status(404).json({ error: "No encontrado" });

  const actualizado = await prisma.necesidadCatalogo.update({ where: { id: necesidad.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "editar_servicio_catalogo",
    entidadTipo: "NecesidadCatalogo",
    entidadId: necesidad.id,
  });

  res.json(actualizado);
});

// Eliminar del catálogo: solo si ninguna solicitud lo ha usado nunca; si ya
// se ha pedido alguna vez se desactiva (PATCH activo:false) para no romper
// el histórico de esas solicitudes.
necesidadesRouter.delete("/:id", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const necesidad = await prisma.necesidadCatalogo.findUnique({
    where: { id: req.params.id },
    include: { solicitudes: { take: 1 } },
  });
  if (!necesidad) return res.status(404).json({ error: "No encontrado" });
  if (necesidad.solicitudes.length > 0) {
    return res.status(409).json({ error: "Ya se ha usado en alguna solicitud; desactívalo en vez de eliminarlo" });
  }

  await prisma.necesidadCatalogo.delete({ where: { id: necesidad.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "eliminar_servicio_catalogo",
    entidadTipo: "NecesidadCatalogo",
    entidadId: necesidad.id,
    detalle: necesidad.nombre,
  });

  res.status(204).send();
});
