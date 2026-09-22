import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar } from "../middleware/auth.js";
import { esGestorOrganizacion } from "../services/permisos.js";
import type { TokenPayload } from "../lib/jwt.js";

// Chat entre la persona/familia y un profesional (sección "el panel de
// chat debe ser más intuitivo... si es el mismo profesional se debe poder
// visualizar todo junto"): la conversación se identifica por el par
// (profesionalId, personaId), no por un servicio concreto — un profesional
// con varios servicios para la misma familia tiene un único hilo.
export const conversacionesRouter = Router();
conversacionesRouter.use(autenticar);

async function puedeVerConversacion(usuario: TokenPayload, profesionalId: string, personaId: string): Promise<boolean> {
  // Solo hay conversación si alguna vez hubo (o hay) un servicio real que
  // una a ese profesional con esa persona — nunca entre desconocidos.
  const relacionReal = await prisma.servicio.findFirst({ where: { profesionalId, solicitud: { personaId } } });
  if (!relacionReal) return false;

  if (usuario.rol === "PROFESIONAL") return usuario.profesionalId === profesionalId;
  if (usuario.rol === "PERSONA") return usuario.personaId === personaId;
  if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({ where: { personaId, usuarioId: usuario.sub, revocadoAt: null } });
    return relacion !== null;
  }
  if (esGestorOrganizacion(usuario)) {
    const persona = await prisma.persona.findUnique({ where: { id: personaId }, select: { organizacionId: true } });
    return persona?.organizacionId === usuario.organizacionId;
  }
  return false;
}

// Bandeja compacta: una fila por conversación (par profesional↔persona),
// con el último mensaje como vista previa — en vez de una caja de chat por
// cada servicio, que confundía sobre "por dónde" hablar cuando era el mismo
// profesional en varios servicios.
conversacionesRouter.get("/", async (req, res) => {
  const usuario = req.usuario!;
  let pares: { profesionalId: string; personaId: string }[] = [];

  if (usuario.rol === "PERSONA" && usuario.personaId) {
    const servicios = await prisma.servicio.findMany({
      where: { solicitud: { personaId: usuario.personaId }, profesionalId: { not: null } },
      select: { profesionalId: true },
      distinct: ["profesionalId"],
    });
    pares = servicios.map((s) => ({ profesionalId: s.profesionalId!, personaId: usuario.personaId! }));
  } else if (usuario.rol === "FAMILIAR") {
    const relaciones = await prisma.familiarRelacion.findMany({ where: { usuarioId: usuario.sub, revocadoAt: null }, select: { personaId: true } });
    for (const rel of relaciones) {
      const servicios = await prisma.servicio.findMany({
        where: { solicitud: { personaId: rel.personaId }, profesionalId: { not: null } },
        select: { profesionalId: true },
        distinct: ["profesionalId"],
      });
      pares.push(...servicios.map((s) => ({ profesionalId: s.profesionalId!, personaId: rel.personaId })));
    }
  } else if (usuario.rol === "PROFESIONAL" && usuario.profesionalId) {
    const servicios = await prisma.servicio.findMany({
      where: { profesionalId: usuario.profesionalId },
      select: { solicitud: { select: { personaId: true } } },
      distinct: ["solicitudId"],
    });
    const personaIds = Array.from(new Set(servicios.map((s) => s.solicitud.personaId)));
    pares = personaIds.map((personaId) => ({ profesionalId: usuario.profesionalId!, personaId }));
  }

  const conversaciones = await Promise.all(
    pares.map(async ({ profesionalId, personaId }) => {
      const [persona, profesional, ultimoMensaje] = await Promise.all([
        prisma.persona.findUnique({ where: { id: personaId } }),
        prisma.profesional.findUnique({ where: { id: profesionalId } }),
        prisma.mensaje.findFirst({ where: { profesionalId, personaId }, orderBy: { createdAt: "desc" } }),
      ]);
      return { profesionalId, personaId, persona, profesional, ultimoMensaje };
    }),
  );

  conversaciones.sort((a, b) => {
    const fechaA = a.ultimoMensaje?.createdAt ?? new Date(0);
    const fechaB = b.ultimoMensaje?.createdAt ?? new Date(0);
    return fechaB.getTime() - fechaA.getTime();
  });

  res.json(conversaciones);
});

// Con quién se habla exactamente. El profesional veía un botón genérico
// ("escribir a la familia") sin saber si al otro lado está la hija autorizada
// o la propia persona atendida, que puede no usar la aplicación. Saberlo
// cambia cómo se escribe y si merece la pena escribir.
conversacionesRouter.get("/:profesionalId/:personaId", async (req, res) => {
  const { profesionalId, personaId } = req.params;
  const permitido = await puedeVerConversacion(req.usuario!, profesionalId, personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const [persona, cuentaPersona, relaciones] = await Promise.all([
    prisma.persona.findUnique({ where: { id: personaId }, select: { id: true, nombre: true, apellidos: true } }),
    prisma.usuario.findFirst({ where: { personaId, activo: true }, select: { id: true } }),
    prisma.familiarRelacion.findMany({
      where: { personaId, revocadoAt: null },
      include: { usuario: { select: { id: true, nombre: true, email: true, activo: true } } },
      orderBy: { esRepresentante: "desc" },
    }),
  ]);
  if (!persona) return res.status(404).json({ error: "Persona no encontrada" });

  // Solo cuenta quien puede leerlo de verdad: una relación revocada o una
  // cuenta desactivada no es un interlocutor.
  const familiares = relaciones
    .filter((r) => r.usuario.activo)
    .map((r) => ({
      nombre: r.usuario.nombre ?? r.usuario.email,
      parentesco: r.parentesco,
      esRepresentante: r.esRepresentante,
    }));

  res.json({
    persona: { id: persona.id, nombre: persona.nombre, apellidos: persona.apellidos, tieneCuenta: cuentaPersona != null },
    familiares,
  });
});

conversacionesRouter.get("/:profesionalId/:personaId/mensajes", async (req, res) => {
  const { profesionalId, personaId } = req.params;
  const permitido = await puedeVerConversacion(req.usuario!, profesionalId, personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const mensajes = await prisma.mensaje.findMany({
    where: { profesionalId, personaId },
    include: { autor: { select: { id: true, rol: true, email: true, nombre: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(mensajes);
});

const crearMensajeSchema = z.object({ texto: z.string().min(1).max(2000) });

conversacionesRouter.post("/:profesionalId/:personaId/mensajes", async (req, res) => {
  const { profesionalId, personaId } = req.params;
  const permitido = await puedeVerConversacion(req.usuario!, profesionalId, personaId);
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });

  const parsed = crearMensajeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const mensaje = await prisma.mensaje.create({
    data: {
      profesionalId,
      personaId,
      autorUsuarioId: req.usuario!.sub,
      texto: parsed.data.texto,
    },
    include: { autor: { select: { id: true, rol: true, email: true, nombre: true } } },
  });

  res.status(201).json(mensaje);
});
