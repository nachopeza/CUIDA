import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";

export const profesionalesRouter = Router();
profesionalesRouter.use(autenticar);

// Lista de candidatos para el coordinador (sección 10: "lista de candidatos
// explicable → coordinador selecciona").
profesionalesRouter.get("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN"), async (req, res) => {
  const profesionales = await prisma.profesional.findMany({
    where: { organizacionId: req.usuario!.organizacionId ?? undefined, estado: "ACTIVO" },
    orderBy: { nombre: "asc" },
  });
  res.json(profesionales);
});

// Agenda del día/periodo del profesional (interfaz CUIDA PROFESIONAL, sección 9).
profesionalesRouter.get("/:id/agenda", async (req, res) => {
  const usuario = req.usuario!;
  const esPropio = usuario.rol === "PROFESIONAL" && usuario.profesionalId === req.params.id;
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"].includes(usuario.rol);
  if (!esPropio && !esGestor) return res.status(403).json({ error: "Sin permiso" });

  const visitas = await prisma.visita.findMany({
    where: { servicio: { profesionalId: req.params.id } },
    include: {
      servicio: { include: { solicitud: { include: { persona: true, necesidad: true } } } },
      tareas: true,
    },
    orderBy: { fecha: "asc" },
  });
  res.json(visitas);
});
