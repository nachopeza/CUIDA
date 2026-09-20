import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { autenticar } from "../middleware/auth.js";

export const necesidadesRouter = Router();
necesidadesRouter.use(autenticar);

// Catálogo de necesidades (sección 6): compra, acompañamiento, compañía,
// tareas domésticas, comida, recados, paseo, citas, apoyo puntual.
necesidadesRouter.get("/", async (_req, res) => {
  const necesidades = await prisma.necesidadCatalogo.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });
  res.json(necesidades);
});
