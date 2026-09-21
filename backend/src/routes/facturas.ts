import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { esGestorOrganizacion } from "../services/permisos.js";

// Facturación mensual a la familia (sección "la función es cobrar por
// gestión un pequeño porcentaje... se le hará una cuenta mensual con los
// servicios solicitados y al final de mes se le cobrará el importe. Ese
// importe se dividirá y se entregará a los profesionales"). Fase 1: cálculo
// y registro; el cobro/pago real (pasarela, transferencia...) queda fuera de
// alcance, pero el dato queda preparado para conectarlo después.
export const facturasRouter = Router();
facturasRouter.use(autenticar);

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

function rangoMes(mes: string): { desde: Date; hasta: Date } {
  const [anio, mesNum] = mes.split("-").map(Number);
  const desde = new Date(Date.UTC(anio, mesNum - 1, 1));
  const hasta = new Date(Date.UTC(anio, mesNum, 1));
  return { desde, hasta };
}

const generarSchema = z.object({
  personaId: z.string().min(1),
  mes: z.string().regex(mesRegex, "Formato esperado: AAAA-MM"),
});

// Agrupa los servicios PAGADO ya cerrados/validados de una persona en un mes
// natural que todavía no estén facturados, y calcula el total cobrado a la
// familia, la comisión de gestión retenida y el neto a repartir entre
// profesionales/empresas colaboradoras.
facturasRouter.post("/generar", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = generarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const usuario = req.usuario!;
  const persona = await prisma.persona.findUnique({ where: { id: parsed.data.personaId } });
  if (!persona || persona.organizacionId !== usuario.organizacionId) {
    return res.status(404).json({ error: "Persona no encontrada" });
  }

  const { desde, hasta } = rangoMes(parsed.data.mes);
  const servicios = await prisma.servicio.findMany({
    where: {
      organizacionId: usuario.organizacionId!,
      solicitud: { personaId: persona.id },
      tarifaTipo: "PAGADO",
      facturaId: null,
      estado: { in: ["VALIDADO", "CERRADO"] },
      createdAt: { gte: desde, lt: hasta },
    },
  });

  if (servicios.length === 0) {
    return res.status(409).json({ error: "No hay servicios pendientes de facturar para esa persona en ese mes" });
  }

  const importeTotal = servicios.reduce((acc, s) => acc + Number(s.tarifaImporte ?? 0), 0);
  const ivaTotal = servicios.reduce((acc, s) => acc + Number(s.ivaImporte ?? 0), 0);
  const totalConIva = servicios.reduce((acc, s) => acc + Number(s.totalConIva ?? s.tarifaImporte ?? 0), 0);
  const comisionTotal = servicios.reduce((acc, s) => acc + Number(s.comisionImporte ?? 0), 0);
  const importeProfesionales = servicios.reduce((acc, s) => acc + Number(s.importeProfesional ?? 0), 0);

  const codigo = await generarCodigo("factura");
  const factura = await prisma.factura.create({
    data: {
      codigo,
      mes: parsed.data.mes,
      importeTotal,
      ivaTotal,
      totalConIva,
      comisionTotal,
      importeProfesionales,
      organizacionId: usuario.organizacionId!,
      personaId: persona.id,
      servicios: { connect: servicios.map((s) => ({ id: s.id })) },
    },
    include: { servicios: true, persona: true },
  });

  await registrarAuditoria({
    usuarioId: usuario.sub,
    organizacionId: usuario.organizacionId,
    accion: "generar_factura",
    entidadTipo: "Factura",
    entidadId: factura.id,
    detalle: `${persona.codigo} · ${parsed.data.mes} · ${importeTotal.toFixed(2)} €`,
  });

  res.status(201).json(factura);
});

facturasRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  let where: Record<string, unknown> = {};

  if (esGestorOrganizacion(usuario)) {
    where = { organizacionId: usuario.organizacionId ?? "__none__" };
  } else if (usuario.rol === "FAMILIAR") {
    const relaciones = await prisma.familiarRelacion.findMany({
      where: { usuarioId: usuario.sub, revocadoAt: null, puedeVerImportes: true },
      select: { personaId: true },
    });
    where = { personaId: { in: relaciones.map((r) => r.personaId) } };
  } else {
    // La persona atendida nunca ve importes/facturas (sección 4/14).
    return res.json([]);
  }

  const facturas = await prisma.factura.findMany({
    where,
    include: { persona: true, servicios: { include: { solicitud: { include: { necesidad: true } }, profesional: true } } },
    orderBy: [{ mes: "desc" }, { createdAt: "desc" }],
  });
  res.json(facturas);
});

const estadoSchema = z.object({ estado: z.enum(["EMITIDA", "PAGADA"]) });

facturasRouter.post("/:id/estado", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = estadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const factura = await prisma.factura.findUnique({ where: { id: req.params.id } });
  if (!factura) return res.status(404).json({ error: "No encontrada" });
  if (factura.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const secuencia: Record<string, string> = { BORRADOR: "EMITIDA", EMITIDA: "PAGADA" };
  if (secuencia[factura.estado] !== parsed.data.estado) {
    return res.status(409).json({ error: `No se puede pasar de ${factura.estado} a ${parsed.data.estado} directamente` });
  }

  const actualizada = await prisma.factura.update({ where: { id: factura.id }, data: { estado: parsed.data.estado } });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: factura.organizacionId,
    accion: "cambiar_estado_factura",
    entidadTipo: "Factura",
    entidadId: factura.id,
    detalle: `${factura.estado} → ${parsed.data.estado}`,
  });

  res.json(actualizada);
});
