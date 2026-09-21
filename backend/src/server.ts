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
import { empresasColaboradorasRouter } from "./routes/empresasColaboradoras.js";
import { agendaRouter } from "./routes/agenda.js";
import { conversacionesRouter } from "./routes/conversaciones.js";
import { facturasRouter } from "./routes/facturas.js";
import { catalogoServiciosRouter } from "./routes/catalogoServicios.js";

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
app.use("/empresas-colaboradoras", empresasColaboradorasRouter);
app.use("/agenda", agendaRouter);
app.use("/conversaciones", conversacionesRouter);
app.use("/facturas", facturasRouter);
app.use("/catalogo-servicios", catalogoServiciosRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`CUIDA backend escuchando en :${PORT}`);
});
