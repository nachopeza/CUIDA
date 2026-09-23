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

const editarSchema = crearSchema.partial().extend({
  // Contrato de encargo del tratamiento (art. 28 RGPD). Se marca cuando está
  // firmado por las dos partes y, si se tiene, se adjunta el PDF.
  encargoFirmado: z.boolean().optional(),
  encargoFecha: z.string().optional().nullable(),
  encargoArchivoId: z.string().optional().nullable(),
});

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

  const { encargoFecha, ...resto } = parsed.data;
  const actualizada = await prisma.empresaColaboradora.update({
    where: { id: empresa.id },
    data: {
      ...resto,
      // Firmarlo sin poner fecha es lo normal cuando se marca el mismo día:
      // se pone la de hoy en vez de dejar el dato a medias.
      ...(encargoFecha !== undefined ? { encargoFecha: encargoFecha ? new Date(encargoFecha) : null } : {}),
      ...(resto.encargoFirmado === true && encargoFecha === undefined && !empresa.encargoFecha ? { encargoFecha: new Date() } : {}),
      ...(resto.encargoFirmado === false ? { encargoFecha: null } : {}),
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: empresa.organizacionId,
    accion: "editar_empresa_colaboradora",
    entidadTipo: "EmpresaColaboradora",
    entidadId: empresa.id,
  });

  res.json(actualizada);
});

// Eliminar: solo si nadie depende de ella todavía (sección "que me dé la
// opción de eliminar el conjunto seleccionado"); si ya tiene profesionales o
// servicios asociados, lo correcto es marcarla inactiva.
empresasColaboradorasRouter.delete("/:id", async (req, res) => {
  const empresa = await prisma.empresaColaboradora.findUnique({
    where: { id: req.params.id },
    include: { profesionales: { take: 1 }, servicios: { take: 1 } },
  });
  if (!empresa) return res.status(404).json({ error: "No encontrada" });
  if (empresa.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (empresa.profesionales.length > 0 || empresa.servicios.length > 0) {
    return res.status(409).json({ error: "Tiene profesionales o servicios asociados; márcala inactiva en vez de eliminarla" });
  }

  await prisma.empresaColaboradora.delete({ where: { id: empresa.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: empresa.organizacionId,
    accion: "eliminar_empresa_colaboradora",
    entidadTipo: "EmpresaColaboradora",
    entidadId: empresa.id,
    detalle: empresa.codigo,
  });

  res.status(204).send();
});
