import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { generarPain008, ibanValido } from "../services/sepa.js";

// Todo lo que hace falta para cobrar: a quién se factura, con qué mandato se
// le gira el recibo y en qué remesa va. La facturación en sí vive en
// facturas.ts; esto es el lado del dinero que entra.
export const cobrosRouter = Router();
cobrosRouter.use(autenticar);

const soloGestion = requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN");

// ---------------------------------------------------------------- datos fiscales

const datosSchema = z.object({
  titular: z.string().min(1),
  nif: z.string().optional().nullable(),
  direccionFiscal: z.string().optional().nullable(),
  codigoPostal: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  formaPago: z.enum(["DOMICILIACION", "TRANSFERENCIA", "EFECTIVO", "TARJETA"]).optional(),
  diaCobro: z.number().int().min(1).max(28).optional(),
  diasVencimiento: z.number().int().min(0).max(180).optional(),
  notas: z.string().optional().nullable(),
});

async function personaDeLaOrganizacion(personaId: string, organizacionId: string | null | undefined) {
  const persona = await prisma.persona.findUnique({ where: { id: personaId } });
  if (!persona || persona.organizacionId !== organizacionId) return null;
  return persona;
}

cobrosRouter.get("/datos/:personaId", soloGestion, async (req, res) => {
  const persona = await personaDeLaOrganizacion(req.params.personaId, req.usuario!.organizacionId);
  if (!persona) return res.status(404).json({ error: "Persona no encontrada" });
  const datos = await prisma.datosFacturacion.findUnique({
    where: { personaId: persona.id },
    include: { mandatos: { orderBy: { createdAt: "desc" } } },
  });
  res.json(datos);
});

cobrosRouter.put("/datos/:personaId", soloGestion, async (req, res) => {
  const parsed = datosSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const persona = await personaDeLaOrganizacion(req.params.personaId, req.usuario!.organizacionId);
  if (!persona) return res.status(404).json({ error: "Persona no encontrada" });

  const datos = { ...parsed.data, email: parsed.data.email || null };
  const guardados = await prisma.datosFacturacion.upsert({
    where: { personaId: persona.id },
    update: datos,
    create: { personaId: persona.id, ...datos },
    include: { mandatos: { orderBy: { createdAt: "desc" } } },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "editar_datos_facturacion",
    entidadTipo: "Persona",
    entidadId: persona.id,
  });
  res.json(guardados);
});

// ---------------------------------------------------------------- mandatos SEPA

const mandatoSchema = z.object({
  titular: z.string().min(1),
  iban: z.string().min(15),
  bic: z.string().optional().nullable(),
  fechaFirma: z.string().min(4),
});

cobrosRouter.post("/datos/:personaId/mandatos", soloGestion, async (req, res) => {
  const parsed = mandatoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const persona = await personaDeLaOrganizacion(req.params.personaId, req.usuario!.organizacionId);
  if (!persona) return res.status(404).json({ error: "Persona no encontrada" });

  const iban = parsed.data.iban.replace(/\s+/g, "").toUpperCase();
  if (!ibanValido(iban)) {
    return res.status(400).json({ error: "El IBAN no es válido. Revísalo: un dígito mal tecleado tumba toda la remesa." });
  }

  const datos = await prisma.datosFacturacion.findUnique({ where: { personaId: persona.id } });
  if (!datos) return res.status(409).json({ error: "Rellena primero los datos de facturación de esta persona" });

  const fechaFirma = new Date(`${parsed.data.fechaFirma}T00:00:00`);
  if (Number.isNaN(fechaFirma.getTime())) return res.status(400).json({ error: "La fecha de firma no es válida" });

  // Un cliente tiene un mandato en vigor, no varios: firmar uno nuevo revoca
  // el anterior. Si no, no se sabría con cuál girar.
  await prisma.mandatoSepa.updateMany({
    where: { datosFacturacionId: datos.id, estado: "ACTIVO" },
    data: { estado: "REVOCADO", revocadoAt: new Date() },
  });

  const mandato = await prisma.mandatoSepa.create({
    data: {
      referencia: await generarCodigo("mandato"),
      datosFacturacionId: datos.id,
      titular: parsed.data.titular,
      iban,
      bic: parsed.data.bic || null,
      fechaFirma,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId,
    accion: "firmar_mandato_sepa",
    entidadTipo: "Persona",
    entidadId: persona.id,
    detalle: mandato.referencia,
  });
  res.status(201).json(mandato);
});

cobrosRouter.post("/mandatos/:id/revocar", soloGestion, async (req, res) => {
  const mandato = await prisma.mandatoSepa.findUnique({
    where: { id: req.params.id },
    include: { datosFacturacion: { include: { persona: true } } },
  });
  if (!mandato) return res.status(404).json({ error: "No encontrado" });
  if (mandato.datosFacturacion.persona.organizacionId !== req.usuario!.organizacionId) {
    return res.status(403).json({ error: "Sin permiso" });
  }
  const revocado = await prisma.mandatoSepa.update({
    where: { id: mandato.id },
    data: { estado: "REVOCADO", revocadoAt: new Date() },
  });
  res.json(revocado);
});

// ---------------------------------------------------------------- remesas

const remesaSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato esperado: AAAA-MM"),
  fechaCargo: z.string().optional(),
});

cobrosRouter.get("/remesas", soloGestion, async (req, res) => {
  const remesas = await prisma.remesa.findMany({
    where: { organizacionId: req.usuario!.organizacionId ?? "__none__" },
    include: { facturas: { include: { persona: true } } },
    orderBy: [{ mes: "desc" }, { createdAt: "desc" }],
  });
  res.json(remesas);
});

// Agrupa en un envío las facturas emitidas del mes que se cobran por
// domiciliación y todavía no van en ninguna remesa.
cobrosRouter.post("/remesas", soloGestion, async (req, res) => {
  const parsed = remesaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const organizacionId = req.usuario!.organizacionId!;

  const organizacion = await prisma.organizacion.findUnique({ where: { id: organizacionId } });
  if (!organizacion?.ibanCobro || !organizacion.identificadorAcreedor) {
    return res.status(409).json({
      error: "Antes de remesar hace falta el IBAN de cobro y el identificador de acreedor de la empresa",
    });
  }

  const facturas = await prisma.factura.findMany({
    where: {
      organizacionId,
      mes: parsed.data.mes,
      estado: "EMITIDA",
      formaPago: "DOMICILIACION",
      remesaId: null,
      mandatoSepaId: { not: null },
    },
    include: { mandatoSepa: true, persona: true },
  });
  if (facturas.length === 0) {
    return res.status(409).json({ error: "No hay facturas domiciliadas de ese mes pendientes de remesar" });
  }

  const fechaCargo = parsed.data.fechaCargo ? new Date(`${parsed.data.fechaCargo}T00:00:00`) : new Date();
  if (Number.isNaN(fechaCargo.getTime())) return res.status(400).json({ error: "La fecha de cargo no es válida" });

  const codigo = await generarCodigo("remesa");
  const xml = generarPain008({
    mensajeId: codigo,
    creado: new Date(),
    fechaCargo,
    acreedor: {
      nombre: organizacion.razonSocial ?? organizacion.nombre,
      identificador: organizacion.identificadorAcreedor,
      iban: organizacion.ibanCobro,
    },
    adeudos: facturas.map((f) => ({
      referencia: f.codigo,
      mandatoReferencia: f.mandatoSepa!.referencia,
      fechaFirmaMandato: f.mandatoSepa!.fechaFirma,
      primerCobro: !f.mandatoSepa!.primerCobroHecho,
      titular: f.mandatoSepa!.titular,
      iban: f.mandatoSepa!.iban,
      bic: f.mandatoSepa!.bic,
      importe: Number(f.totalConIva),
      concepto: `${f.codigo} servicios ${f.mes}`,
    })),
  });

  const remesa = await prisma.remesa.create({
    data: {
      codigo,
      mes: parsed.data.mes,
      fechaCargo,
      estado: "GENERADA",
      ficheroXml: xml,
      organizacionId,
      facturas: { connect: facturas.map((f) => ({ id: f.id })) },
    },
    include: { facturas: { include: { persona: true } } },
  });

  // A partir del primer giro el mandato deja de ser "primero": los
  // siguientes adeudos van como recurrentes.
  await prisma.mandatoSepa.updateMany({
    where: { id: { in: facturas.map((f) => f.mandatoSepaId!) } },
    data: { primerCobroHecho: true },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "generar_remesa",
    entidadTipo: "Remesa",
    entidadId: remesa.id,
    detalle: `${facturas.length} recibos · ${facturas.reduce((a, f) => a + Number(f.totalConIva), 0).toFixed(2)} €`,
  });

  res.status(201).json(remesa);
});

// El fichero para subir al banco, tal cual se generó.
cobrosRouter.get("/remesas/:id/fichero", soloGestion, async (req, res) => {
  const remesa = await prisma.remesa.findUnique({ where: { id: req.params.id } });
  if (!remesa) return res.status(404).json({ error: "No encontrada" });
  if (remesa.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${remesa.codigo}.xml"`);
  res.send(remesa.ficheroXml ?? "");
});

const estadoRemesaSchema = z.object({ estado: z.enum(["ENVIADA", "COBRADA"]) });

cobrosRouter.post("/remesas/:id/estado", soloGestion, async (req, res) => {
  const parsed = estadoRemesaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const remesa = await prisma.remesa.findUnique({ where: { id: req.params.id }, include: { facturas: true } });
  if (!remesa) return res.status(404).json({ error: "No encontrada" });
  if (remesa.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const actualizada = await prisma.remesa.update({ where: { id: remesa.id }, data: { estado: parsed.data.estado } });

  // Dar la remesa por cobrada cobra sus facturas: es una sola acción para
  // treinta recibos, que es justo lo que ahorra el trabajo administrativo.
  // Las devueltas se marcan una a una después.
  if (parsed.data.estado === "COBRADA") {
    await prisma.factura.updateMany({
      where: { remesaId: remesa.id, estado: "EMITIDA" },
      data: { estado: "PAGADA", fechaCobro: remesa.fechaCargo },
    });
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: remesa.organizacionId,
    accion: "cambiar_estado_remesa",
    entidadTipo: "Remesa",
    entidadId: remesa.id,
    detalle: `${remesa.estado} → ${parsed.data.estado}`,
  });
  res.json(actualizada);
});
