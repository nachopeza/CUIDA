import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { personasRouter } from "./routes/personas.js";
import { necesidadesRouter } from "./routes/necesidades.js";
import { solicitudesRouter } from "./routes/solicitudes.js";
import { serviciosRouter } from "./routes/servicios.js";
import { profesionalesRouter } from "./routes/profesionales.js";
import { visitasRouter } from "./routes/visitas.js";
import { incidenciasRouter } from "./routes/incidencias.js";
import { notificacionesRouter } from "./routes/notificaciones.js";
import { auditoriaRouter } from "./routes/auditoria.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", proyecto: "CUIDA", fase: 1 }));

app.use("/auth", authRouter);
app.use("/personas", personasRouter);
app.use("/necesidades", necesidadesRouter);
app.use("/solicitudes", solicitudesRouter);
app.use("/servicios", serviciosRouter);
app.use("/profesionales", profesionalesRouter);
app.use("/visitas", visitasRouter);
app.use("/incidencias", incidenciasRouter);
app.use("/notificaciones", notificacionesRouter);
app.use("/auditoria", auditoriaRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`CUIDA backend escuchando en :${PORT}`);
});
