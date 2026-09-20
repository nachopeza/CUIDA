import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";

export const agendaRouter = Router();
agendaRouter.use(autenticar);

// Calendario/escaleta de la organización: qué profesional tiene qué
// servicio qué día (sección 9 — coordinación). A diferencia de
// /profesionales/:id/agenda (agenda de un único profesional), esta ruta
// da la vista completa que necesita el coordinador para planificar.
agendaRouter.get("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"), async (req, res) => {
  const usuario = req.usuario!;
  const visitas = await prisma.visita.findMany({
    where: usuario.rol === "SUPERADMIN" ? {} : { servicio: { organizacionId: usuario.organizacionId ?? "__none__" } },
    include: {
      servicio: {
        include: {
          profesional: true,
          solicitud: { include: { persona: true, necesidad: true } },
        },
      },
    },
    orderBy: { fecha: "asc" },
  });
  res.json(visitas);
});
