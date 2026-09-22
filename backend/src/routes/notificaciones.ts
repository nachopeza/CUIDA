import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { autenticar } from "../middleware/auth.js";

export const notificacionesRouter = Router();
notificacionesRouter.use(autenticar);

notificacionesRouter.get("/", async (req, res) => {
  const notificaciones = await prisma.notificacion.findMany({
    where: { usuarioId: req.usuario!.sub },
    orderBy: { createdAt: "desc" },
  });
  res.json(notificaciones);
});

notificacionesRouter.post("/:id/leida", async (req, res) => {
  const notificacion = await prisma.notificacion.findUnique({ where: { id: req.params.id } });
  if (!notificacion || notificacion.usuarioId !== req.usuario!.sub) {
    return res.status(404).json({ error: "No encontrada" });
  }
  const actualizada = await prisma.notificacion.update({
    where: { id: notificacion.id },
    data: { leida: true },
  });
  res.json(actualizada);
});

// Marcar de golpe. El escritorio enseña las novedades recientes y pedía una
// petición por cada una para darlas por vistas.
notificacionesRouter.post("/leidas", async (req, res) => {
  const { count } = await prisma.notificacion.updateMany({
    where: { usuarioId: req.usuario!.sub, leida: false },
    data: { leida: true },
  });
  res.json({ marcadas: count });
});
