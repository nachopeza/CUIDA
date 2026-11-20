import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { registrarHistorial } from "../services/estados.js";
import { esGestorOrganizacion, puedeAccederPersona } from "../services/permisos.js";
import { TRAMITES_ALTA, TRAMITES_BAJA, avisarNomina, brutoDelMes, crearTramites, recalcularEstado } from "../services/hogar.js";

// Empleo de hogar gestionado: la familia contrata, CUIDA lo tramita todo.
export const hogarRouter = Router();
hogarRouter.use(autenticar);

const INCLUDE = {
  persona: { select: { id: true, codigo: true, nombre: true, apellidos: true, telefono: true, direccion: true, municipio: true } },
  profesional: { select: { id: true, codigo: true, nombre: true, apellidos: true, foto: true } },
  tramites: { orderBy: { orden: "asc" as const } },
  nominas: { orderBy: { mes: "desc" as const } },
};

async function cargarPermitido(id: string, req: import("express").Request, res: import("express").Response, soloGestion = false) {
  const c = await prisma.contratoHogar.findUnique({ where: { id }, include: INCLUDE });
  if (!c) {
    res.status(404).json({ error: "No encontrado" });
    return null;
  }
  const u = req.usuario!;
  const gestor = esGestorOrganizacion(u) && c.organizacionId === u.organizacionId;
  if (soloGestion ? !gestor : !gestor && !(await puedeAccederPersona(u, c.personaId))) {
    res.status(403).json({ error: "Sin permiso" });
    return null;
  }
  return c;
}

hogarRouter.get("/", async (req, res) => {
  const u = req.usuario!;
  let where: Record<string, unknown>;
  if (esGestorOrganizacion(u)) where = { organizacionId: u.organizacionId };
  else if (u.rol === "PERSONA") where = { personaId: u.personaId ?? "__none__" };
  else if (u.rol === "FAMILIAR") {
    const rel = await prisma.familiarRelacion.findMany({ where: { usuarioId: u.sub, revocadoAt: null }, select: { personaId: true } });
    where = { personaId: { in: rel.map((r) => r.personaId) } };
  } else return res.json([]);
  if (typeof req.query.personaId === "string") where = { ...where, personaId: req.query.personaId };
  res.json(await prisma.contratoHogar.findMany({ where, include: INCLUDE, orderBy: { createdAt: "desc" } }));
});

hogarRouter.get("/:id", async (req, res) => {
  const c = await cargarPermitido(req.params.id, req, res);
  if (c) res.json(c);
});

const datosSchema = z.object({
  personaId: z.string(),
  titularNombre: z.string().trim().min(1, "Quién firma como empleador"),
  titularNif: z.string().trim().optional().nullable(),
  solicitudId: z.string().optional().nullable(),
  trabajadoraNombre: z.string().trim().min(1, "Nombre de la trabajadora"),
  trabajadoraApellidos: z.string().trim().min(1, "Apellidos de la trabajadora"),
  trabajadoraDni: z.string().trim().optional().nullable(),
  trabajadoraNaf: z.string().trim().optional().nullable(),
  trabajadoraTelefono: z.string().trim().optional().nullable(),
  trabajadoraIban: z.string().trim().optional().nullable(),
  profesionalId: z.string().optional().nullable(),
  jornada: z.enum(["EXTERNA", "INTERNA"]).default("EXTERNA"),
  horasSemanales: z.number().int().min(1).max(60),
  horario: z.string().trim().optional().nullable(),
  salarioBrutoMensual: z.number().positive("El salario tiene que ser mayor que cero"),
  pagasExtra: z.number().int().min(0).max(2).default(2),
  prorrateaPagas: z.boolean().default(false),
  fechaInicio: z.string().min(10),
  cuotaGestionMensual: z.number().min(0),
  cuotaAlta: z.number().min(0).optional().nullable(),
  notas: z.string().optional().nullable(),
});

const fecha = (v: string) => new Date(v.length === 10 ? `${v}T00:00:00` : v);

hogarRouter.post("/", async (req, res) => {
  const u = req.usuario!;
  if (!esGestorOrganizacion(u)) return res.status(403).json({ error: "Sin permiso" });
  const parsed = datosSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos no válidos" });
  const d = parsed.data;
  const persona = await prisma.persona.findUnique({ where: { id: d.personaId } });
  if (!persona || persona.organizacionId !== u.organizacionId) return res.status(404).json({ error: "Persona no encontrada" });

  const codigo = await generarCodigo("hogar");
  const contrato = await prisma.contratoHogar.create({
    data: {
      ...d,
      codigo,
      organizacionId: u.organizacionId!,
      fechaInicio: fecha(d.fechaInicio),
      tramites: { create: crearTramites(TRAMITES_ALTA) },
    },
    include: INCLUDE,
  });

  // La solicitud que lo pidió queda atendida: lo que sigue es este contrato, no
  // un servicio con jornadas.
  if (d.solicitudId) {
    const sol = await prisma.solicitud.findUnique({ where: { id: d.solicitudId } });
    if (sol && !["CERRADA", "CANCELADA"].includes(sol.estado)) {
      await prisma.solicitud.update({ where: { id: sol.id }, data: { estado: "CERRADA" } });
      await registrarHistorial({ entidadTipo: "Solicitud", estadoAnterior: sol.estado, estadoNuevo: "CERRADA", motivo: `Gestionada como contrato de empleo de hogar ${codigo}`, solicitudId: sol.id });
    }
  }
  await registrarAuditoria({ usuarioId: u.sub, organizacionId: u.organizacionId, accion: "crear_contrato_hogar", entidadTipo: "ContratoHogar", entidadId: contrato.id, detalle: codigo });
  res.status(201).json(contrato);
});

hogarRouter.patch("/:id", async (req, res) => {
  const c = await cargarPermitido(req.params.id, req, res, true);
  if (!c) return;
  const parsed = datosSchema.partial().omit({ personaId: true, solicitudId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos no válidos" });
  const d = parsed.data;
  const actualizado = await prisma.contratoHogar.update({
    where: { id: c.id },
    data: { ...d, fechaInicio: d.fechaInicio ? fecha(d.fechaInicio) : undefined },
    include: INCLUDE,
  });
  res.json(actualizado);
});

const tramiteSchema = z.object({ estado: z.enum(["PENDIENTE", "EN_CURSO", "HECHO", "NO_APLICA"]), notas: z.string().optional().nullable() });

hogarRouter.post("/:id/tramites/:tramiteId", async (req, res) => {
  const c = await cargarPermitido(req.params.id, req, res, true);
  if (!c) return;
  const parsed = tramiteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Estado no válido" });
  const t = c.tramites.find((x) => x.id === req.params.tramiteId);
  if (!t) return res.status(404).json({ error: "Trámite no encontrado" });
  if (t.imprescindible && parsed.data.estado === "NO_APLICA") return res.status(409).json({ error: "Este trámite es obligatorio: no se puede marcar como «no aplica»." });
  await prisma.tramiteHogar.update({
    where: { id: t.id },
    data: { estado: parsed.data.estado, notas: parsed.data.notas ?? t.notas, fecha: parsed.data.estado === "HECHO" ? new Date() : null },
  });
  await recalcularEstado(c.id);
  await registrarAuditoria({ usuarioId: req.usuario!.sub, organizacionId: c.organizacionId, accion: "tramite_hogar", entidadTipo: "ContratoHogar", entidadId: c.id, detalle: `${t.titulo}: ${parsed.data.estado}` });
  res.json(await prisma.contratoHogar.findUnique({ where: { id: c.id }, include: INCLUDE }));
});

// La nómina del mes. Se prepara cuando el contrato ya está activo y el mes ha
// empezado: preparar la de un mes en el que todavía no se ha trabajado es
// inventarse la nómina.
hogarRouter.post("/:id/nominas", async (req, res) => {
  const c = await cargarPermitido(req.params.id, req, res, true);
  if (!c) return;
  const parsed = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Mes no válido (AAAA-MM)" });
  if (c.estado !== "ACTIVO") return res.status(409).json({ error: "Todavía no está dada de alta con contrato firmado: no hay nómina que preparar." });
  if (parsed.data.mes < c.fechaInicio.toISOString().slice(0, 7)) return res.status(409).json({ error: "Ese mes es anterior al inicio del contrato." });
  if (c.nominas.some((n) => n.mes === parsed.data.mes)) return res.status(409).json({ error: `La nómina de ${parsed.data.mes} ya está preparada.` });
  const nomina = await prisma.nominaHogar.create({ data: { contratoId: c.id, mes: parsed.data.mes, bruto: brutoDelMes(c, parsed.data.mes) } });
  res.status(201).json(nomina);
});

const nominaSchema = z.object({ estado: z.enum(["PREPARADA", "ENVIADA", "PAGADA"]).optional(), neto: z.number().min(0).nullable().optional(), notas: z.string().optional() });

hogarRouter.post("/:id/nominas/:nominaId", async (req, res) => {
  const c = await cargarPermitido(req.params.id, req, res, true);
  if (!c) return;
  const parsed = nominaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos no válidos" });
  const n = c.nominas.find((x) => x.id === req.params.nominaId);
  if (!n) return res.status(404).json({ error: "Nómina no encontrada" });
  const actualizada = await prisma.nominaHogar.update({ where: { id: n.id }, data: parsed.data });
  if (parsed.data.estado === "ENVIADA" && n.estado !== "ENVIADA") await avisarNomina(c.id, n.mes);
  res.json(actualizada);
});

// Terminar la relación laboral: la baja y el finiquito pasan a ser los trámites
// pendientes, y la cuota de gestión deja de girarse a partir del mes siguiente.
hogarRouter.post("/:id/finalizar", async (req, res) => {
  const c = await cargarPermitido(req.params.id, req, res, true);
  if (!c) return;
  const parsed = z.object({ fecha: z.string().min(10), motivo: z.string().trim().min(3, "Cuenta brevemente el motivo") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos no válidos" });
  if (c.estado === "FINALIZADO") return res.status(409).json({ error: "Ya está terminado." });
  const fin = fecha(parsed.data.fecha);
  if (fin < c.fechaInicio) return res.status(400).json({ error: "La fecha de fin es anterior al inicio." });
  await prisma.contratoHogar.update({
    where: { id: c.id },
    data: { estado: "FINALIZADO", fechaFin: fin, motivoFin: parsed.data.motivo, tramites: { create: crearTramites(TRAMITES_BAJA, 100) } },
  });
  await registrarAuditoria({ usuarioId: req.usuario!.sub, organizacionId: c.organizacionId, accion: "finalizar_contrato_hogar", entidadTipo: "ContratoHogar", entidadId: c.id, detalle: parsed.data.motivo });
  res.json(await prisma.contratoHogar.findUnique({ where: { id: c.id }, include: INCLUDE }));
});
