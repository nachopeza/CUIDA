import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { reglasDe } from "../services/motorTiempo.js";

// Las reglas que convierten tiempo en dinero y las tarifas con vigencia. Son
// decisiones comerciales de cada organización, así que se editan desde la
// aplicación y no se tocan en el código.
export const reglasRouter = Router();
reglasRouter.use(autenticar);

const soloGestion = requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN");

reglasRouter.get("/", soloGestion, async (req, res) => {
  res.json(await reglasDe(req.usuario!.organizacionId!));
});

const reglasSchema = z.object({
  baseCobro: z.enum(["PROGRAMADO", "REAL", "MENOR", "MAYOR"]),
  baseLiquidacion: z.enum(["PROGRAMADO", "REAL", "MENOR", "MAYOR"]),
  redondeoMinutos: z.number().int().min(0).max(120),
  redondeoModo: z.enum(["NINGUNO", "ARRIBA", "ABAJO", "CERCANO"]),
  minimoMinutos: z.number().int().min(0).max(1440),
  toleranciaRetrasoMinutos: z.number().int().min(0).max(240),
  toleranciaExcesoMinutos: z.number().int().min(0).max(240),
  aprobarTiempoExtra: z.boolean(),
  horasVisitaAbierta: z.number().int().min(1).max(24),
  cancelacionAvisoHoras: z.number().int().min(0).max(168),
  cancelacionTardiaCobro: z.number().min(0).max(100),
  cancelacionTardiaPago: z.number().min(0).max(100),
  noPresentadoCobro: z.number().min(0).max(100),
  noPresentadoPago: z.number().min(0).max(100),
});

reglasRouter.put("/", soloGestion, async (req, res) => {
  const parsed = reglasSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const organizacionId = req.usuario!.organizacionId!;
  // Una regla con redondeo pero sin intervalo (o al revés) no significa nada:
  // se normaliza aquí para que el motor no tenga que adivinarlo.
  const datos = {
    ...parsed.data,
    redondeoModo: parsed.data.redondeoMinutos === 0 ? ("NINGUNO" as const) : parsed.data.redondeoModo,
    redondeoMinutos: parsed.data.redondeoModo === "NINGUNO" ? 0 : parsed.data.redondeoMinutos,
  };

  const guardadas = await prisma.reglasNegocio.upsert({
    where: { organizacionId },
    update: datos,
    create: { organizacionId, ...datos },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "editar_reglas_negocio",
    entidadTipo: "ReglasNegocio",
    entidadId: guardadas.id,
  });

  res.json(await reglasDe(organizacionId));
});

// --- Tarifas ---------------------------------------------------------------

reglasRouter.get("/tarifas", soloGestion, async (req, res) => {
  const tarifas = await prisma.tarifa.findMany({
    where: { organizacionId: req.usuario!.organizacionId! },
    include: { necesidad: { select: { id: true, nombre: true } } },
    orderBy: [{ activa: "desc" }, { vigenteDesde: "desc" }],
  });
  res.json(
    tarifas.map((t) => ({
      ...t,
      precioHoraCliente: Number(t.precioHoraCliente),
      precioHoraProfesional: Number(t.precioHoraProfesional),
      // La parte de CUIDA es lo que queda entre las dos: ingreso de gestión,
      // no beneficio — de ahí salen impuestos, seguros y administración.
      comisionHora: Math.round((Number(t.precioHoraCliente) - Number(t.precioHoraProfesional)) * 100) / 100,
    })),
  );
});

const tarifaSchema = z.object({
  nombre: z.string().min(2),
  necesidadId: z.string().nullable().optional(),
  precioHoraCliente: z.number().positive(),
  precioHoraProfesional: z.number().positive(),
  vigenteDesde: z.string(),
  vigenteHasta: z.string().nullable().optional(),
});

reglasRouter.post("/tarifas", soloGestion, async (req, res) => {
  const parsed = tarifaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.precioHoraProfesional > parsed.data.precioHoraCliente) {
    return res.status(400).json({ error: "El profesional no puede cobrar más de lo que paga la familia: revisa los dos precios" });
  }

  const tarifa = await prisma.tarifa.create({
    data: {
      organizacionId: req.usuario!.organizacionId!,
      nombre: parsed.data.nombre,
      necesidadId: parsed.data.necesidadId || null,
      precioHoraCliente: parsed.data.precioHoraCliente,
      precioHoraProfesional: parsed.data.precioHoraProfesional,
      vigenteDesde: new Date(parsed.data.vigenteDesde),
      vigenteHasta: parsed.data.vigenteHasta ? new Date(parsed.data.vigenteHasta) : null,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: req.usuario!.organizacionId!,
    accion: "crear_tarifa",
    entidadTipo: "Tarifa",
    entidadId: tarifa.id,
  });

  res.status(201).json(tarifa);
});

// Una tarifa no se edita: se cierra y se crea la nueva. Editarla reescribiría
// el pasado, que es justo lo que la vigencia existe para evitar.
reglasRouter.post("/tarifas/:id/cerrar", soloGestion, async (req, res) => {
  const tarifa = await prisma.tarifa.findUnique({ where: { id: req.params.id } });
  if (!tarifa || tarifa.organizacionId !== req.usuario!.organizacionId) return res.status(404).json({ error: "No encontrada" });

  const hasta = req.body?.vigenteHasta ? new Date(req.body.vigenteHasta) : new Date();
  const actualizada = await prisma.tarifa.update({
    where: { id: tarifa.id },
    data: { vigenteHasta: hasta, activa: false },
  });
  res.json(actualizada);
});
