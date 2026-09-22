import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { validaciones, registrarHistorial, TransicionInvalidaError, TRANSICIONES_SERVICIO } from "../services/estados.js";
import { notificarGestores } from "../services/notificaciones.js";
import { esGestorOrganizacion, ocultarTarifaSiProcede } from "../services/permisos.js";
import { asegurarSesiones } from "../services/sesiones.js";
import { formatearDuracion, minutosFichados } from "../services/economia.js";

export const visitasRouter = Router();
visitasRouter.use(autenticar);

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Jornada máxima admisible. No es una regla laboral, es un cortafuegos: sin
// ella un dedazo ("09:00" en vez de "19:00" al cerrar) se convierte en horas
// facturadas que nadie revisa.
const MAX_HORAS_JORNADA = 16;

// El tiempo trabajado se guarda como dos marcas absolutas, pero se introduce
// como dos horas del día de la visita. Si la hora de fin es anterior a la de
// inicio es un turno de noche, así que cae al día siguiente.
function marcasDeTiempo(fecha: Date, horaInicio: string, horaFin: string) {
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);

  const inicio = new Date(fecha);
  inicio.setHours(hi, mi, 0, 0);
  const fin = new Date(fecha);
  fin.setHours(hf, mf, 0, 0);
  if (fin <= inicio) fin.setDate(fin.getDate() + 1);

  const horas = (fin.getTime() - inicio.getTime()) / 3600000;
  return { inicio, fin, horas };
}

// Devuelve el mensaje de error, o null si el tiempo es admisible.
function revisarTiempo(horaInicio: string, horaFin: string, horas: number): string | null {
  if (horaInicio === horaFin) return "La hora de inicio y la de fin no pueden ser la misma: el servicio tiene que haber durado algo";
  if (horas > MAX_HORAS_JORNADA) {
    return `El tiempo indicado son ${horas.toFixed(1)} h, más de ${MAX_HORAS_JORNADA} h seguidas. Revisa las horas: si de verdad fue así, pártelo en dos jornadas`;
  }
  return null;
}

async function cargarVisitaConPermiso(req: Request<{ id: string }>) {
  const visita = await prisma.visita.findUnique({
    where: { id: req.params.id },
    include: { servicio: true },
  });
  if (!visita) return { visita: null, permitido: false };

  const usuario = req.usuario!;
  const esProfesionalPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === visita.servicio.profesionalId;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"].includes(usuario.rol);
  return { visita, permitido: esProfesionalPropio || esGestor };
}

visitasRouter.get("/:id", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const completa = await prisma.visita.findUnique({
    where: { id: visita.id },
    include: { tareas: true, actuaciones: true, incidencias: true, servicio: { include: { solicitud: { include: { persona: true } } } } },
  });
  if (!completa) return res.status(404).json({ error: "No encontrada" });

  res.json({ ...completa, servicio: ocultarTarifaSiProcede(completa.servicio, esGestorOrganizacion(req.usuario!)) });
});

// "6. Ejecución": inicio + tareas + observaciones → Visita registrada
// (sección 3). Solo el profesional asignado inicia su propia visita.
visitasRouter.post("/:id/iniciar", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  try {
    validaciones.visita(visita.estado, "EN_CURSO");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const actualizada = await prisma.visita.update({
    where: { id: visita.id },
    data: { estado: "EN_CURSO", horaInicioReal: new Date() },
  });

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: "EN_CURSO",
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "iniciar_visita",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  res.json(actualizada);
});

// Cerrar una tarea obliga a decir cuánto ha durado. El cronómetro propone las
// horas, pero quien cierra las confirma: si nadie las confirmaba, una visita
// podía llegar a facturación con cero horas y nadie se enteraba hasta ver la
// factura.
const finalizarSchema = z.object({
  horaInicio: z.string().regex(HORA, "Indica la hora de inicio en formato HH:MM"),
  horaFin: z.string().regex(HORA, "Indica la hora de fin en formato HH:MM"),
  observacion: z.string().optional(),
});

visitasRouter.post("/:id/finalizar", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const parsed = finalizarSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    validaciones.visita(visita.estado, "FINALIZADA");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  const { inicio, fin, horas } = marcasDeTiempo(visita.fecha, parsed.data.horaInicio, parsed.data.horaFin);
  const problema = revisarTiempo(parsed.data.horaInicio, parsed.data.horaFin, horas);
  if (problema) return res.status(400).json({ error: problema });

  const actualizada = await prisma.visita.update({
    where: { id: visita.id },
    data: { estado: "FINALIZADA", horaInicioReal: inicio, horaFinReal: fin },
  });

  if (parsed.data.observacion) {
    await prisma.actuacion.create({
      data: { visitaId: visita.id, descripcion: parsed.data.observacion },
    });
  }

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: "FINALIZADA",
    motivo: `${parsed.data.horaInicio}-${parsed.data.horaFin} · ${horas.toFixed(2)} h trabajadas`,
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "finalizar_visita",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  // "Esa tarea llega a coordinación": la coordinadora debe verificarla con
  // la familia antes de archivarla (sección Profesional).
  await notificarGestores(
    visita.servicio.organizacionId,
    "visita_para_revisar",
    `La visita ${visita.codigo} ha finalizado. Verifícala con la persona o su familia antes de archivarla.`,
    visita.servicio.solicitudId,
  );

  res.json(actualizada);
});

const tareaSchema = z.object({ tareaId: z.string().min(1), completada: z.boolean() });

visitasRouter.patch("/:id/tareas", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });
  // Bug conocido: una vez finalizada la visita se podían seguir marcando
  // tareas, como si siguiera en curso. Una vez FINALIZADA o REVISADA queda
  // cerrada: ya no se modifica.
  if (["FINALIZADA", "REVISADA"].includes(visita.estado)) {
    return res.status(409).json({ error: "La visita ya está finalizada; no se puede modificar" });
  }

  const parsed = tareaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const tarea = await prisma.tarea.update({
    where: { id: parsed.data.tareaId },
    data: { completada: parsed.data.completada },
  });
  res.json(tarea);
});

const actuacionSchema = z.object({ descripcion: z.string().min(1) });

// "Lo ocurrido" (sección 5): observación libre, nunca diagnóstico clínico.
visitasRouter.post("/:id/actuaciones", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });
  if (["FINALIZADA", "REVISADA"].includes(visita.estado)) {
    return res.status(409).json({ error: "La visita ya está finalizada; no se puede añadir más notas" });
  }

  const parsed = actuacionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const actuacion = await prisma.actuacion.create({
    data: { visitaId: visita.id, descripcion: parsed.data.descripcion },
  });
  res.status(201).json(actuacion);
});

// Coordinación verifica con la familia que todo fue bien y archiva la
// visita (sección Profesional: "lo verifican... y ya se verifica y
// archiva"). Solo gestores; el profesional no se autoverifica.
visitasRouter.post("/:id/revisar", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id }, include: { servicio: true } });
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (visita.servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  try {
    validaciones.visita(visita.estado, "REVISADA");
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  // Verificar es comprobar el fichaje, no rellenarlo: las horas las pone
  // quien trabaja, al empezar y al cerrar, y coordinación no las toca. Si no
  // cuadran, el camino es abrir una incidencia de verificación y hablarlo,
  // no reescribir el registro.
  if (!visita.horaInicioReal || !visita.horaFinReal) {
    return res.status(409).json({
      error: "Esta jornada no tiene fichaje. Solo puede registrarlo quien la hizo: pídeselo o abre una incidencia de verificación",
    });
  }

  const trabajados = minutosFichados(visita.horaInicioReal, visita.horaFinReal) ?? 0;
  const actualizada = await prisma.visita.update({ where: { id: visita.id }, data: { estado: "REVISADA" } });

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: "REVISADA",
    motivo: `Verificada con la persona/familia · ${formatearDuracion(trabajados)} fichados`,
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "revisar_visita",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  // Bug conocido: verificar la visita dejaba el servicio parado para
  // siempre en EN_CURSO — nunca llegaba a FINALIZADO/VALIDADO, así que
  // "Finalizadas" siempre aparecía vacío. Para un servicio PUNTUAL, una vez
  // todas sus visitas están verificadas (y no hay incidencia general
  // abierta), avanzamos el servicio automáticamente: la propia verificación
  // ya es la confirmación con la familia que exige el paso a VALIDADO. Un
  // servicio RECURRENTE nunca se cierra así: sigue esperando más visitas.
  const servicioActualizado = await prisma.servicio.findUnique({
    where: { id: visita.servicioId },
    include: { visitas: true, incidencias: true },
  });
  if (servicioActualizado && servicioActualizado.tipoServicio !== "RECURRENTE") {
    const todasRevisadas = servicioActualizado.visitas.every((v) => v.estado === "REVISADA");
    const incidenciaAbierta = servicioActualizado.incidencias.some(
      (i) => i.tipo === "GENERAL" && !["RESUELTA", "CERRADA"].includes(i.estado),
    );
    if (todasRevisadas && !incidenciaAbierta) {
      let estadoActual = servicioActualizado.estado;
      for (const siguiente of ["FINALIZADO", "VALIDADO"] as const) {
        if (!(TRANSICIONES_SERVICIO[estadoActual] ?? []).includes(siguiente)) break;
        await prisma.servicio.update({ where: { id: servicioActualizado.id }, data: { estado: siguiente } });
        await registrarHistorial({
          entidadTipo: "Servicio",
          estadoAnterior: estadoActual,
          estadoNuevo: siguiente,
          motivo: "Todas las visitas verificadas con la familia",
          servicioId: servicioActualizado.id,
        });
        estadoActual = siguiente;
      }
    }
  }

  // Un servicio recurrente no se cierra al verificar una jornada: genera la
  // siguiente. Así el contrato queda siempre con un día por delante en la
  // agenda sin que nadie tenga que ir pidiéndolos uno a uno, que era lo que
  // convertía "servicio" y "visita" en dos cosas distintas de gestionar.
  if (servicioActualizado?.tipoServicio === "RECURRENTE") {
    const sesiones = await asegurarSesiones(servicioActualizado.id);
    if (sesiones.creadas.length > 0) {
      await registrarHistorial({
        entidadTipo: "Servicio",
        estadoAnterior: servicioActualizado.estado,
        estadoNuevo: servicioActualizado.estado,
        motivo: `Siguiente jornada ${sesiones.creadas.join(", ")} creada automáticamente`,
        servicioId: servicioActualizado.id,
      });
    }
  }

  res.json(actualizada);
});
