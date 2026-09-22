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
import { cobrosRouter } from "./routes/cobros.js";
import { liquidacionesRouter } from "./routes/liquidaciones.js";
import { personalRouter } from "./routes/personal.js";
import { equipoRouter } from "./routes/equipo.js";
import { cuentaRouter } from "./routes/cuenta.js";
import { conErroresAsincronos } from "./lib/asincrono.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", proyecto: "CUIDA", fase: 1 }));

app.use("/auth", conErroresAsincronos(authRouter));
app.use("/personas", conErroresAsincronos(personasRouter));
app.use("/necesidades", conErroresAsincronos(necesidadesRouter));
app.use("/solicitudes", conErroresAsincronos(solicitudesRouter));
app.use("/servicios", conErroresAsincronos(serviciosRouter));
app.use("/profesionales", conErroresAsincronos(profesionalesRouter));
app.use("/visitas", conErroresAsincronos(visitasRouter));
app.use("/incidencias", conErroresAsincronos(incidenciasRouter));
app.use("/notificaciones", conErroresAsincronos(notificacionesRouter));
app.use("/auditoria", conErroresAsincronos(auditoriaRouter));
app.use("/empresas-colaboradoras", conErroresAsincronos(empresasColaboradorasRouter));
app.use("/agenda", conErroresAsincronos(agendaRouter));
app.use("/conversaciones", conErroresAsincronos(conversacionesRouter));
app.use("/facturas", conErroresAsincronos(facturasRouter));
app.use("/cobros", conErroresAsincronos(cobrosRouter));
app.use("/liquidaciones", conErroresAsincronos(liquidacionesRouter));
app.use("/personal", conErroresAsincronos(personalRouter));
app.use("/equipo", conErroresAsincronos(equipoRouter));
app.use("/cuenta", conErroresAsincronos(cuentaRouter));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

// Un error dentro de un handler async no lo recoge el middleware de error de
// Express: llegaba como promesa rechazada y tumbaba el proceso entero (una
// factura duplicada dejaba sin servicio a todo el mundo). Se registra y se
// sigue sirviendo.
process.on("unhandledRejection", (motivo) => {
  console.error("Promesa rechazada sin capturar:", motivo);
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`CUIDA backend escuchando en :${PORT}`);
});
