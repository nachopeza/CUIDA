import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar } from "../middleware/auth.js";
import { esGestorOrganizacion } from "../services/permisos.js";

// Chat entre la persona/familia y el profesional asignado a un servicio
// (sección "la usuaria debe tener un chat con la profesional"). Anclado al
// Servicio: solo participan la persona, su familiar autorizado, el
// profesional asignado y los gestores de la organización — nunca terceros.
export const mensajesRouter = Router();
mensajesRouter.use(autenticar);

async function puedeVerChat(req: Request<{ servicioId: string }>) {
  const usuario = req.usuario!;
  const servicio = await prisma.servicio.findUnique({
    where: { id: req.params.servicioId },
    include: { solicitud: true },
  });
  if (!servicio) return { servicio: null, permitido: false };

  if (esGestorOrganizacion(usuario) && servicio.organizacionId === usuario.organizacionId) {
    return { servicio, permitido: true };
  }
  if (usuario.rol === "PROFESIONAL" && usuario.profesionalId === servicio.profesionalId) {
    return { servicio, permitido: true };
  }
  if (usuario.rol === "PERSONA" && usuario.personaId === servicio.solicitud.personaId) {
    return { servicio, permitido: true };
  }
  if (usuario.rol === "FAMILIAR") {
    const relacion = await prisma.familiarRelacion.findFirst({
      where: { personaId: servicio.solicitud.personaId, usuarioId: usuario.sub, revocadoAt: null },
    });
    if (relacion) return { servicio, permitido: true };
  }
  return { servicio, permitido: false };
}

mensajesRouter.get("/servicios/:servicioId/mensajes", async (req, res) => {
  const { servicio, permitido } = await puedeVerChat(req);
  if (!servicio) return res.status(404).json({ error: "Servicio no encontrado" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });
  // El chat solo tiene sentido una vez hay un profesional asignado con quien
  // hablar; antes no hay hilo que mostrar.
  if (!servicio.profesionalId) return res.json([]);

  const mensajes = await prisma.mensaje.findMany({
    where: { servicioId: servicio.id },
    include: { autor: { select: { id: true, rol: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(mensajes);
});

const crearMensajeSchema = z.object({ texto: z.string().min(1).max(2000) });

mensajesRouter.post("/servicios/:servicioId/mensajes", async (req, res) => {
  const { servicio, permitido } = await puedeVerChat(req);
  if (!servicio) return res.status(404).json({ error: "Servicio no encontrado" });
  if (!permitido) return res.status(403).json({ error: "Sin permiso" });
  if (!servicio.profesionalId) return res.status(409).json({ error: "Este servicio todavía no tiene profesional asignado" });

  const parsed = crearMensajeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const usuario = req.usuario!;
  const mensaje = await prisma.mensaje.create({
    data: {
      servicioId: servicio.id,
      autorUsuarioId: usuario.sub,
      profesionalId: usuario.rol === "PROFESIONAL" ? usuario.profesionalId : undefined,
      texto: parsed.data.texto,
    },
    include: { autor: { select: { id: true, rol: true, email: true } } },
  });

  res.status(201).json(mensaje);
});
