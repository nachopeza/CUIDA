import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { validaciones, registrarHistorial, TransicionInvalidaError, TRANSICIONES_SERVICIO } from "../services/estados.js";
import { notificarGestores } from "../services/notificaciones.js";
import { esGestorOrganizacion, ocultarTarifaSiProcede, soloLoQueCobraElProfesional } from "../services/permisos.js";
import { asegurarSesiones } from "../services/sesiones.js";
import { formatearDuracion, minutosFichados } from "../services/economia.js";
import { generarCodigo } from "../lib/codes.js";
import { liquidarVisita, tarifaAplicable } from "../services/visitaEconomia.js";
import { yaDocumentada } from "../services/regularizaciones.js";
import { calcularEconomia, calcularTiempos, reglasDe } from "../services/motorTiempo.js";

export const visitasRouter = Router();
visitasRouter.use(autenticar);

visitasRouter.get("/abiertas", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const organizacionId = req.usuario!.organizacionId!;
  const reglas = await reglasDe(organizacionId);
  const limite = new Date(Date.now() - reglas.horasVisitaAbierta * 3600000);

  const abiertas = await prisma.visita.findMany({
    where: {
      estado: "EN_CURSO",
      horaInicioReal: { not: null, lte: limite },
      servicio: { organizacionId },
    },
    include: {
      profesional: { select: { id: true, nombre: true, apellidos: true, telefono: true } },
      servicio: { include: { solicitud: { include: { persona: { select: { nombre: true, apellidos: true } } } } } },
    },
    orderBy: { horaInicioReal: "asc" },
  });

  res.json(
    abiertas.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      fecha: v.fecha,
      horaInicioReal: v.horaInicioReal,
      minutosAbierta: v.horaInicioReal ? Math.round((Date.now() - v.horaInicioReal.getTime()) / 60000) : null,
      persona: v.servicio.solicitud.persona,
      profesional: v.profesional,
      solicitudId: v.servicio.solicitudId,
    })),
  );
});


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

  // El filtro entra por la jornada, no por su servicio: los importes del motor
  // de tiempo están en la propia visita. El profesional ve lo que cobra él; la
  // familia y la persona, nada de esto.
  const usuario = req.usuario!;
  if (esGestorOrganizacion(usuario)) return res.json(completa);
  const visible = completa as unknown as Record<string, unknown>;
  res.json(usuario.rol === "PROFESIONAL" ? soloLoQueCobraElProfesional(visible) : ocultarTarifaSiProcede(visible, false));
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

  await prisma.visita.update({
    where: { id: visita.id },
    data: { estado: "FINALIZADA", horaInicioReal: inicio, horaFinReal: fin },
  });

  // Cerrar la jornada es lo que la convierte en dinero: aquí se calculan los
  // cuatro tiempos, se congela la tarifa aplicada y quedan escritos los tres
  // importes. Antes cada pantalla rehacía la cuenta por su cuenta.
  const liquidada = await liquidarVisita(visita.id);
  const actualizada = liquidada?.visita ?? (await prisma.visita.findUnique({ where: { id: visita.id } }))!;

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

  // El tiempo de más no se cobra solo. Si la desviación pasa de la tolerancia
  // y las reglas exigen aprobación, coordinación se entera ahora y no al ver
  // la factura del mes.
  if (liquidada?.tiempos.requiereAprobacion) {
    await notificarGestores(
      visita.servicio.organizacionId,
      "tiempo_extra_por_aprobar",
      `La visita ${visita.codigo} tiene ${liquidada.tiempos.desviacionMinutos} min por encima de lo acordado. Aprueba o rechaza ese tiempo antes de facturarlo.`,
      visita.servicio.solicitudId,
    );
  }

  res.json({ ...actualizada, tiempos: liquidada?.tiempos ?? null });
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
  // Verificar es lo que da por bueno el tiempo, así que es el momento de
  // dejar la cuenta definitiva escrita: si entretanto se corrigió un fichaje
  // o se aprobó tiempo extra, se recoge aquí.
  await liquidarVisita(visita.id);
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

// ---------------------------------------------------------------------------
// Desglose: "¿por qué 51 €?"
//
// Un importe que nadie puede justificar no sirve para facturar. Este endpoint
// devuelve la cuenta entera —tiempos, regla aplicada, tarifa aplicada y los
// tres importes con su multiplicación a la vista— para que la coordinadora
// pueda responder a la familia sin abrir una hoja de cálculo.
// ---------------------------------------------------------------------------
visitasRouter.get("/:id/desglose", async (req, res) => {
  const { visita, permitido } = await cargarVisitaConPermiso(req);
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const reglas = await reglasDe(visita.servicio.organizacionId);
  const tiempos = calcularTiempos(
    {
      horaInicioProg: visita.horaInicioProg,
      horaFinProg: visita.horaFinProg,
      horaInicioReal: visita.horaInicioReal,
      horaFinReal: visita.horaFinReal,
      fecha: visita.fecha,
      estado: visita.estado,
      ajusteEstado: visita.ajusteEstado,
    },
    reglas,
  );
  const tarifa = await tarifaAplicable(visita.id);

  // Los importes guardados mandan sobre los recalculados: son los que se han
  // facturado. Si la visita todavía no se ha cerrado no hay ninguno, y
  // entonces sí se enseña la previsión.
  const guardado = visita.importeCliente != null;
  // Los importes guardados mandan sobre cualquier recálculo: son los que se
  // han facturado. Mientras la jornada no se cierra no hay ninguno, y entonces
  // sí se enseña la previsión, marcada como tal — saber cuánto va a costar
  // antes de que pase es media gestión.
  const economia = guardado
    ? calcularEconomia({
        minutosFacturables: visita.minutosFacturables ?? 0,
        minutosLiquidables: visita.minutosLiquidables ?? 0,
        precioHoraCliente: Number(visita.precioHoraCliente ?? 0),
        precioHoraProfesional: Number(visita.precioHoraProfesional ?? 0),
      })
    : tarifa
      ? calcularEconomia({
          minutosFacturables: tiempos.minutosFacturables,
          minutosLiquidables: tiempos.minutosLiquidables,
          precioHoraCliente: tarifa.precioHoraCliente,
          precioHoraProfesional: tarifa.precioHoraProfesional,
        })
      : null;

  const correcciones = await prisma.correccionFichaje.findMany({
    where: { visitaId: visita.id },
    orderBy: { createdAt: "asc" },
    include: { usuario: { select: { nombre: true, email: true } } },
  });

  const desglose = {
    visita: {
      id: visita.id,
      codigo: visita.codigo,
      fecha: visita.fecha,
      estado: visita.estado,
      horaInicioProg: visita.horaInicioProg,
      horaFinProg: visita.horaFinProg,
      horaInicioReal: visita.horaInicioReal,
      horaFinReal: visita.horaFinReal,
      cierreManual: visita.cierreManual,
    },
    tiempos: {
      programados: visita.minutosProgramados ?? tiempos.minutosProgramados,
      reales: visita.minutosReales ?? tiempos.minutosReales,
      facturables: visita.minutosFacturables ?? tiempos.minutosFacturables,
      liquidables: visita.minutosLiquidables ?? tiempos.minutosLiquidables,
      retrasoMinutos: visita.retrasoMinutos ?? tiempos.retrasoMinutos,
      desviacionMinutos: visita.desviacionMinutos ?? tiempos.desviacionMinutos,
      explicacion: visita.explicacionTiempo ?? tiempos.explicacion,
    },
    regla: {
      baseCobro: reglas.baseCobro,
      baseLiquidacion: reglas.baseLiquidacion,
      redondeoMinutos: reglas.redondeoMinutos,
      redondeoModo: reglas.redondeoModo,
      minimoMinutos: reglas.minimoMinutos,
    },
    tarifa: tarifa ? { origen: tarifa.origen, precioHoraCliente: tarifa.precioHoraCliente, precioHoraProfesional: tarifa.precioHoraProfesional } : null,
    economia,
    definitivo: guardado,
    ajuste: {
      estado: visita.ajusteEstado,
      motivo: visita.ajusteMotivo,
      nota: visita.ajusteNota,
      decididoAt: visita.ajusteDecididoAt,
    },
    // Si esta jornada ya está en una factura emitida o en una liquidación
    // aprobada, lo que se decida ahora no cambia esos documentos: entra como
    // regularización en los siguientes. Quien decide tiene que saberlo antes
    // de pulsar, no después.
    documentada: await yaDocumentada(visita.id),
    correcciones: correcciones.map((c) => ({
      campo: c.campo,
      valorAnterior: c.valorAnterior,
      valorNuevo: c.valorNuevo,
      motivo: c.motivo,
      quien: c.usuario.nombre ?? c.usuario.email,
      cuando: c.createdAt,
    })),
  };

  // El profesional ve su parte del desglose, nunca lo que paga la familia ni
  // el ingreso de CUIDA: es la misma regla que en el resto de la aplicación.
  if (req.usuario!.rol === "PROFESIONAL") {
    return res.json({
      ...desglose,
      tarifa: tarifa ? { origen: "Precio acordado para tu trabajo", precioHoraProfesional: tarifa.precioHoraProfesional } : null,
      economia: economia ? { profesional: economia.profesional } : null,
    });
  }

  res.json(desglose);
});

// ---------------------------------------------------------------------------
// Corregir un fichaje sin borrarlo
//
// Si la profesional fichó a las 09:04 y coordinación lo corrige a 09:00, el
// 09:04 no desaparece: queda el original, el nuevo valor, quién lo cambió y
// por qué. Sin esto, el registro de jornada no vale como prueba de nada.
// ---------------------------------------------------------------------------
const correccionSchema = z.object({
  horaInicio: z.string().regex(HORA).optional(),
  horaFin: z.string().regex(HORA).optional(),
  motivo: z.string().min(3, "Di por qué se corrige: queda registrado junto al fichaje original"),
});

visitasRouter.patch("/:id/fichaje", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id }, include: { servicio: true } });
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (visita.servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const parsed = correccionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!parsed.data.horaInicio && !parsed.data.horaFin) {
    return res.status(400).json({ error: "No hay nada que corregir: indica la hora de entrada, la de salida o las dos" });
  }

  const horaInicio = parsed.data.horaInicio ?? (visita.horaInicioReal ? horaDe(visita.horaInicioReal) : null);
  const horaFin = parsed.data.horaFin ?? (visita.horaFinReal ? horaDe(visita.horaFinReal) : null);
  if (!horaInicio || !horaFin) {
    return res.status(400).json({ error: "Para corregir hacen falta las dos horas: no se puede dejar media jornada sin fichar" });
  }

  const { inicio, fin, horas } = marcasDeTiempo(visita.fecha, horaInicio, horaFin);
  const problema = revisarTiempo(horaInicio, horaFin, horas);
  if (problema) return res.status(400).json({ error: problema });

  const cambios: { campo: string; anterior: Date | null; nuevo: Date }[] = [];
  if (visita.horaInicioReal?.getTime() !== inicio.getTime()) {
    cambios.push({ campo: "horaInicioReal", anterior: visita.horaInicioReal, nuevo: inicio });
  }
  if (visita.horaFinReal?.getTime() !== fin.getTime()) {
    cambios.push({ campo: "horaFinReal", anterior: visita.horaFinReal, nuevo: fin });
  }
  if (cambios.length === 0) return res.status(400).json({ error: "Las horas son las mismas que ya estaban" });

  await prisma.correccionFichaje.createMany({
    data: cambios.map((c) => ({
      visitaId: visita.id,
      campo: c.campo,
      valorAnterior: c.anterior,
      valorNuevo: c.nuevo,
      motivo: parsed.data.motivo,
      usuarioId: req.usuario!.sub,
    })),
  });

  await prisma.visita.update({ where: { id: visita.id }, data: { horaInicioReal: inicio, horaFinReal: fin } });
  const liquidada = await liquidarVisita(visita.id);

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "corregir_fichaje",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: visita.estado,
    motivo: `Fichaje corregido a ${horaInicio}-${horaFin} · ${parsed.data.motivo}`,
    visitaId: visita.id,
  });

  const documentada = await yaDocumentada(visita.id);
  res.json({ ...liquidada?.visita, tiempos: liquidada?.tiempos ?? null, documentada });
});

function horaDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Tiempo adicional: se propone, no se cobra solo
// ---------------------------------------------------------------------------
const ajusteSchema = z.object({
  decision: z.enum(["APROBADO", "RECHAZADO"]),
  motivo: z.enum(["PETICION_CLIENTE", "NECESIDAD_DEL_SERVICIO", "INCIDENCIA", "ERROR_DE_FICHAJE", "OTRO"]),
  nota: z.string().optional(),
});

visitasRouter.post("/:id/ajuste", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id }, include: { servicio: true } });
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (visita.servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  // Se puede volver a decidir. La familia llama una semana después —"ese
  // cuarto de hora se lo pedimos nosotros"— y la decisión tiene que poder
  // cambiar: la diferencia con lo ya facturado o ya pagado se arrastra sola a
  // los documentos siguientes, y el historial guarda las dos decisiones con
  // su motivo. Lo único que no se puede decidir es una jornada que nunca tuvo
  // tiempo de más.
  if (visita.ajusteEstado === "SIN_AJUSTE") {
    return res.status(409).json({ error: "Esta jornada no tiene tiempo por encima de lo acordado que decidir" });
  }
  const cambioDeDecision = visita.ajusteEstado !== "PENDIENTE";

  const parsed = ajusteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.visita.update({
    where: { id: visita.id },
    data: {
      ajusteEstado: parsed.data.decision,
      ajusteMotivo: parsed.data.motivo,
      ajusteNota: parsed.data.nota ?? null,
      ajusteDecididoAt: new Date(),
      ajusteDecididoPorId: req.usuario!.sub,
    },
  });

  // Aprobar el tiempo extra es cobrarlo y pagarlo; rechazarlo es quedarse en
  // lo acordado. La decisión ya está guardada en la jornada, y el motor la
  // respeta cada vez que vuelve a hacer la cuenta, así que aquí basta con
  // pedirle que la rehaga.
  const liquidada = await liquidarVisita(visita.id);

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: visita.estado,
    motivo: `${cambioDeDecision ? `Tiempo adicional: se cambia de ${visita.ajusteEstado.toLowerCase()} a ${parsed.data.decision.toLowerCase()}` : `Tiempo adicional ${parsed.data.decision === "APROBADO" ? "aprobado" : "rechazado"}`} · ${parsed.data.motivo.replace(/_/g, " ").toLowerCase()}${parsed.data.nota ? ` · ${parsed.data.nota}` : ""}`,
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "decidir_tiempo_adicional",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  // Si la jornada ya estaba facturada o liquidada, la diferencia no se pierde
  // ni se mete a mano: entra sola como regularización en la siguiente factura
  // y en la siguiente liquidación. Se dice aquí para poder contárselo a quien
  // acaba de decidir.
  res.json({ ...liquidada?.visita, tiempos: liquidada?.tiempos ?? null, documentada: await yaDocumentada(visita.id) });
});

// ---------------------------------------------------------------------------
// Jornadas abiertas: el olvido de fichar la salida
//
// Nadie trabaja nueve horas seguidas sin avisar: una visita iniciada hace
// mucho y todavía abierta casi siempre es un botón sin pulsar. El escritorio
// la señala para que alguien llame, en vez de descubrirlo al facturar.
// ---------------------------------------------------------------------------
// Cerrar a mano lo que el profesional no cerró. Queda marcado como cierre
// manual: no es un fichaje y no debe leerse como tal.
const cierreManualSchema = z.object({
  horaFin: z.string().regex(HORA, "Indica a qué hora terminó realmente"),
  motivo: z.string().min(3, "Di por qué se cierra a mano"),
});

visitasRouter.post("/:id/cerrar-manual", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id }, include: { servicio: true } });
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (visita.servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });
  if (visita.estado !== "EN_CURSO" || !visita.horaInicioReal) {
    return res.status(409).json({ error: "Esta jornada no está abierta" });
  }

  const parsed = cierreManualSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fin, horas } = marcasDeTiempo(visita.fecha, horaDe(visita.horaInicioReal), parsed.data.horaFin);
  const problema = revisarTiempo(horaDe(visita.horaInicioReal), parsed.data.horaFin, horas);
  if (problema) return res.status(400).json({ error: problema });

  await prisma.correccionFichaje.create({
    data: {
      visitaId: visita.id,
      campo: "horaFinReal",
      valorAnterior: null,
      valorNuevo: fin,
      motivo: `Cierre manual por coordinación · ${parsed.data.motivo}`,
      usuarioId: req.usuario!.sub,
    },
  });

  await prisma.visita.update({
    where: { id: visita.id },
    data: { estado: "FINALIZADA", horaFinReal: fin, cierreManual: true, cerradoPorUsuarioId: req.usuario!.sub },
  });
  const liquidada = await liquidarVisita(visita.id);

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: "FINALIZADA",
    motivo: `Cerrada manualmente a las ${parsed.data.horaFin} · ${parsed.data.motivo}`,
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion: "cerrar_visita_manual",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  res.json({ ...liquidada?.visita, tiempos: liquidada?.tiempos ?? null });
});

// ---------------------------------------------------------------------------
// La jornada que no se prestó
//
// Cancelada y no presentado no son lo mismo, ni para la persona ni para el
// profesional ni para la factura: en una nadie se desplazó, en la otra sí.
// ---------------------------------------------------------------------------
const noPrestadaSchema = z.object({
  tipo: z.enum(["CANCELADA", "NO_PRESENTADO", "FALTA_PROFESIONAL"]),
  motivo: z.string().min(3, "Di qué ha pasado"),
});

visitasRouter.post("/:id/no-prestada", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id }, include: { servicio: true } });
  if (!visita) return res.status(404).json({ error: "No encontrada" });
  if (visita.servicio.organizacionId !== req.usuario!.organizacionId) return res.status(403).json({ error: "Sin permiso" });

  const parsed = noPrestadaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    validaciones.visita(visita.estado, parsed.data.tipo);
  } catch (err) {
    if (err instanceof TransicionInvalidaError) return res.status(409).json({ error: err.message });
    throw err;
  }

  await prisma.visita.update({ where: { id: visita.id }, data: { estado: parsed.data.tipo } });
  const liquidada = await liquidarVisita(visita.id);

  // Una jornada que no se presta nunca es sólo un apunte contable: alguien
  // tiene que hablar con la familia, y si no fue nadie hay que buscar quien
  // vaya. Las dos abren incidencia solas, colgando del servicio y de la
  // jornada, para que se puedan tramitar como cualquier otra.
  if (parsed.data.tipo === "NO_PRESENTADO" || parsed.data.tipo === "FALTA_PROFESIONAL") {
    const faltaProfesional = parsed.data.tipo === "FALTA_PROFESIONAL";
    await prisma.incidencia.create({
      data: {
        codigo: await generarCodigo("incidencia"),
        tipo: "GENERAL",
        estado: "NUEVA",
        motivo: "AUSENCIA",
        // Que no vaya nadie a casa de una persona mayor que espera es lo más
        // grave que puede pasar aquí: entra como alta, no como una más.
        prioridad: faltaProfesional ? "ALTA" : "MEDIA",
        descripcion: faltaProfesional
          ? `No fue nadie a la jornada ${visita.codigo}: ${parsed.data.motivo}. Hay que avisar a la familia y buscar reemplazo.`
          : `No presentado en ${visita.codigo}: ${parsed.data.motivo}`,
        servicioId: visita.servicioId,
        visitaId: visita.id,
        creadoPorUsuarioId: req.usuario!.sub,
      },
    });
  }

  await registrarHistorial({
    entidadTipo: "Visita",
    estadoAnterior: visita.estado,
    estadoNuevo: parsed.data.tipo,
    motivo: `${parsed.data.motivo} · ${liquidada?.tiempos.explicacion ?? ""}`.trim(),
    visitaId: visita.id,
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId: visita.servicio.organizacionId,
    accion:
      parsed.data.tipo === "CANCELADA"
        ? "cancelar_visita"
        : parsed.data.tipo === "FALTA_PROFESIONAL"
          ? "marcar_falta_profesional"
          : "marcar_no_presentado",
    entidadTipo: "Visita",
    entidadId: visita.id,
  });

  res.json({ ...liquidada?.visita, tiempos: liquidada?.tiempos ?? null });
});
