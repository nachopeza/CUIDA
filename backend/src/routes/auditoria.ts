import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";

export const auditoriaRouter = Router();
auditoriaRouter.use(autenticar);

// Auditoría visible para gestores de la organización (sección 4 y 14).
auditoriaRouter.get("/", requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"), async (req, res) => {
  const usuario = req.usuario!;
  const logs = await prisma.auditLog.findMany({
    where: usuario.rol === "SUPERADMIN" ? {} : { organizacionId: usuario.organizacionId ?? "__none__" },
    include: { usuario: { select: { email: true, rol: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});
