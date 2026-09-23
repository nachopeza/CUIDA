import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { revisorDeAsignacion } from "../services/asignacion.js";

// ---------------------------------------------------------------------------
// Jornadas en riesgo
//
// Hasta ahora una jornada sin cubrir se descubría el mismo día: nadie fichaba,
// alguien lo marcaba como falta del profesional y se abría la incidencia. Eso
// llega tarde: la persona ya se quedó esperando en su casa.
//
// Esto es el repaso de lo que viene. Recorre las jornadas de los próximos días
// y, para cada una, hace las mismas preguntas que se hacen al asignar —¿hay
// alguien?, ¿tiene los papeles?, ¿está su empresa en regla?, ¿ese día está de
// vacaciones?—, y dice cuáles no se van a poder prestar mientras todavía se
// puede hacer algo.
// ---------------------------------------------------------------------------
export const coberturaRouter = Router();
coberturaRouter.use(autenticar);

const consulta = z.object({ dias: z.coerce.number().int().min(1).max(60).optional() });

// Una jornada que no se va a poder prestar (BLOQUEA) no es lo mismo que una
// que quizá sí (AVISA): la primera es trabajo de hoy, la segunda es una
// llamada de recordatorio.
type Gravedad = "BLOQUEA" | "AVISA";

function aISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

coberturaRouter.get("/riesgos", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const parsed = consulta.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const dias = parsed.data.dias ?? 14;

  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + dias);

  const organizacionId = req.usuario!.organizacionId!;
  const jornadas = await prisma.visita.findMany({
    where: {
      fecha: { gte: desde, lt: hasta },
      estado: { in: ["PROGRAMADA", "CONFIRMADA"] },
      servicio: { organizacionId, estado: { notIn: ["CANCELADO", "CERRADO"] } },
    },
    orderBy: { fecha: "asc" },
    include: {
      profesional: { select: { id: true, nombre: true, apellidos: true } },
      servicio: {
        select: {
          id: true,
          codigo: true,
          estado: true,
          profesional: { select: { id: true, nombre: true, apellidos: true } },
          solicitud: {
            select: {
              id: true,
              codigo: true,
              persona: { select: { nombre: true, apellidos: true } },
              necesidad: { select: { nombre: true } },
            },
          },
        },
      },
    },
  });

  // Las incidencias que ya están abiertas sobre esos servicios: si alguien ya
  // está en ello, el riesgo se enseña con su incidencia al lado en vez de
  // aparecer como si nadie lo hubiera visto.
  const abiertas = await prisma.incidencia.findMany({
    where: { servicioId: { in: jornadas.map((v) => v.servicioId) }, estado: { not: "CERRADA" } },
    select: { id: true, codigo: true, estado: true, servicioId: true, visitaId: true },
    orderBy: { createdAt: "desc" },
  });
  // La de esa jornada manda sobre las del servicio: un servicio puede tener
  // abierta una incidencia de salud que no tiene nada que ver con que el día
  // 24 no haya quien vaya. Entre las del servicio, la más reciente.
  type Abierta = (typeof abiertas)[number];
  const porVisita = new Map<string, Abierta>();
  const porServicio = new Map<string, Abierta>();
  for (const i of abiertas) {
    if (i.visitaId && !porVisita.has(i.visitaId)) porVisita.set(i.visitaId, i);
    if (i.servicioId && !porServicio.has(i.servicioId)) porServicio.set(i.servicioId, i);
  }

  const revisar = await revisorDeAsignacion(organizacionId);

  const riesgos = [];
  for (const v of jornadas) {
    // El sello de la jornada manda sobre el profesional del servicio: si se
    // reasignó, quien tiene que ir ese día es el que lleva la jornada.
    const pro = v.profesional ?? v.servicio.profesional;

    let motivo: string | null = null;
    let gravedad: Gravedad = "BLOQUEA";
    if (!pro) {
      motivo = "No hay nadie asignado a esta jornada.";
    } else {
      const impedimento = revisar(pro.id, v.fecha);
      if (impedimento) {
        motivo = impedimento;
      } else if (v.servicio.estado === "ASIGNADO") {
        // Asignado pero sin confirmar: puede salir bien, pero a dos días de la
        // fecha ya es una llamada que hay que hacer.
        motivo = `${pro.nombre} todavía no ha confirmado el servicio.`;
        gravedad = "AVISA";
      }
    }
    if (!motivo) continue;

    const incidencia = porVisita.get(v.id) ?? porServicio.get(v.servicioId) ?? null;
    riesgos.push({
      visitaId: v.id,
      codigo: v.codigo,
      fecha: v.fecha,
      horaInicioProg: v.horaInicioProg,
      horaFinProg: v.horaFinProg,
      estado: v.estado,
      gravedad,
      motivo,
      servicio: { id: v.servicio.id, codigo: v.servicio.codigo, estado: v.servicio.estado },
      solicitudId: v.servicio.solicitud.id,
      persona: `${v.servicio.solicitud.persona.nombre} ${v.servicio.solicitud.persona.apellidos}`,
      necesidad: v.servicio.solicitud.necesidad.nombre,
      profesional: pro ? { id: pro.id, nombre: `${pro.nombre} ${pro.apellidos}` } : null,
      incidencia: incidencia ? { id: incidencia.id, codigo: incidencia.codigo, estado: incidencia.estado } : null,
    });
  }

  res.json({
    desde: aISO(desde),
    hasta: aISO(hasta),
    dias,
    jornadasRevisadas: jornadas.length,
    bloquean: riesgos.filter((r) => r.gravedad === "BLOQUEA").length,
    avisan: riesgos.filter((r) => r.gravedad === "AVISA").length,
    riesgos,
  });
});
