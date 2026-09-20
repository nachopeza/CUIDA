import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";

export const empresasColaboradorasRouter = Router();
empresasColaboradorasRouter.use(autenticar);
empresasColaboradorasRouter.use(requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"));

const crearSchema = z.object({
  nombre: z.string().min(1),
  contacto: z.string().optional(),
  cif: z.string().optional(),
  direccion: z.string().optional(),
  numeroCuenta: z.string().optional(),
});

const editarSchema = crearSchema.partial();

// Empresa externa a la que subcontratar un servicio (sección 11: modelo
// híbrido — "empresas pagan software y CUIDA puede gestionar servicios
// externos").
empresasColaboradorasRouter.post("/", async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!req.usuario!.organizacionId) return res.status(400).json({ error: "Usuario sin organización" });

  const codigo = await generarCodigo("empresaColaboradora");
  const empresa = await prisma.empresaColaboradora.create({
    data: { codigo, ...parsed.data, organizacionId: req.usuario!.organizacionId },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "crear_empresa_colaboradora",
    entidadTipo: "EmpresaColaboradora",
    entidadId: empresa.id,
  });

  res.status(201).json(empresa);
});

empresasColaboradorasRouter.get("/", async (req, res) => {
  const empresas = await prisma.empresaColaboradora.findMany({
    where: { organizacionId: req.usuario!.organizacionId ?? undefined, estado: "ACTIVA" },
    orderBy: { nombre: "asc" },
  });
  res.json(empresas);
});

// Editar perfil de la empresa colaboradora (datos administrativos/de cobro),
// igual que con el perfil de un profesional independiente.
empresasColaboradorasRouter.patch("/:id", async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const empresa = await prisma.empresaColaboradora.findUnique({ where: { id: req.params.id } });
  if (!empresa) return res.status(404).json({ error: "No encontrada" });
  if (empresa.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const actualizada = await prisma.empresaColaboradora.update({ where: { id: empresa.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: empresa.organizacionId,
    accion: "editar_empresa_colaboradora",
    entidadTipo: "EmpresaColaboradora",
    entidadId: empresa.id,
  });

  res.json(actualizada);
});
