import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { infoMotivo } from "../../lib/incidencias.js";
import { duracion, horaDe, minutosFichados, minutosEntre, compararConAcordado } from "../../lib/economia.js";
import type { CuentaResumen, Incidencia, IncidenciaServicio, Profesional } from "../../lib/types.js";
import { IconArrowRight, IconCheckCircle, IconClipboard, IconClock, IconMail, IconPhone, IconRefresh } from "../../components/icons.js";

// Espejo de TRANSICIONES_INCIDENCIA del backend (backend/src/services/estados.ts).
const TRANSICIONES_INCIDENCIA: Record<string, string[]> = {
  NUEVA: ["EN_REVISION"],
  EN_REVISION: ["ASIGNADA"],
  ASIGNADA: ["EN_RESOLUCION"],
  EN_RESOLUCION: ["RESUELTA"],
  RESUELTA: ["CERRADA"],
  CERRADA: [],
};

const ROL_LEGIBLE: Record<string, string> = {
  PERSONA: "persona atendida",
  FAMILIAR: "familiar",
  PROFESIONAL: "profesional",
  COORDINADOR: "coordinación",
  ORGANIZACION: "coordinación",
  ADMIN: "coordinación",
  SUPERADMIN: "coordinación",
};

// La jornada perdida se recupera otro día: por defecto, el siguiente.
function siguienteDia(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fechaCorta(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// Un dato de la ficha: etiqueta arriba, valor abajo. Sirve para que todo el
// contexto se lea en rejilla en vez de en un párrafo corrido.
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{etiqueta}</p>
      <div className="mt-0.5 text-sm text-slate-700">{children}</div>
    </div>
  );
}

interface Props {
  incidenciaId: string;
  onClose: () => void;
  onChanged: () => void;
  // Abrir la solicitud del caso sin tener que buscarla en otra pestaña.
  onAbrirSolicitud?: (solicitudId: string) => void;
}

// Ficha de incidencia. Además de gestionarla, reúne aquí todo el caso
// (sección "la información de la incidencia se debe fusionar con la ficha:
// debo ver de qué solicitud es, qué profesional está asignada, quién envió
// la incidencia"): antes contaba el problema pero no de quién venía ni a qué
// servicio pertenecía, y había que ir a buscarlo a tres sitios distintos.
export function IncidenciaFichaModal({ incidenciaId, onClose, onChanged, onAbrirSolicitud }: Props) {
  const { token, usuario } = useAuth();
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario?.rol ?? "");
  const [i, setI] = useState<Incidencia | null>(null);
  const [nota, setNota] = useState("");
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [coordinadores, setCoordinadores] = useState<CuentaResumen[]>([]);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reemplazo: a quién se pone en lugar de quien no puede ir, y si la jornada
  // perdida se recupera otro día.
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [sustitutoId, setSustitutoId] = useState("");
  const [recuperar, setRecuperar] = useState(false);
  const [fechaRecuperacion, setFechaRecuperacion] = useState("");
  const [notaReemplazo, setNotaReemplazo] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [resumenReemplazo, setResumenReemplazo] = useState<string | null>(null);
  const [errorReemplazo, setErrorReemplazo] = useState<string | null>(null);

  async function cargar() {
    setI(await api.get<Incidencia>(`/incidencias/${incidenciaId}`, token));
  }

  useEffect(() => {
    cargar();
    api.get<CuentaResumen[]>("/cuenta/coordinadores", token).then(setCoordinadores).catch(() => setCoordinadores([]));
    if (esGestor) api.get<Profesional[]>("/profesionales", token).then(setProfesionales).catch(() => setProfesionales([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidenciaId]);

  async function recargar() {
    await cargar();
    onChanged();
  }

  async function cambiarEstado(estado: string) {
    setError(null);
    try {
      await api.post(`/incidencias/${incidenciaId}/estado`, { estado }, token);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cambiar el estado");
    }
  }

  // Cerrar sin recorrer el pipeline entero: la mayoría se resuelven de una
  // llamada y obligar a dar cinco pasos hacía que nadie las cerrara.
  async function cerrar() {
    setCerrando(true);
    setError(null);
    try {
      await api.post(`/incidencias/${incidenciaId}/cerrar`, {}, token);
      await recargar();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cerrar");
      setCerrando(false);
    }
  }

  async function asignar(responsableUsuarioId: string) {
    setError(null);
    try {
      await api.post(`/incidencias/${incidenciaId}/asignar`, { responsableUsuarioId: responsableUsuarioId || null }, token);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido asignar");
    }
  }

  // Poner a otra persona en el servicio. Lo que impide asignar a alguien
  // (papeles caducados, contrato de encargo sin firmar, una ausencia
  // aprobada ese día) lo decide el backend y vuelve como un 409 con el
  // motivo escrito: se enseña tal cual, que es lo que hay que resolver.
  async function aplicarReemplazo() {
    if (!sustitutoId) return;
    setAplicando(true);
    setErrorReemplazo(null);
    setResumenReemplazo(null);
    try {
      const r = await api.post<{ resumen: string }>(
        `/incidencias/${incidenciaId}/reemplazo`,
        {
          profesionalId: sustitutoId,
          recuperarJornada: recuperar,
          // Si no se toca el selector va la fecha que se está enseñando, no
          // la del día que se perdió: lo que se ve es lo que se manda.
          fechaRecuperacion: recuperar ? fechaRecuperacion || (i?.visita ? siguienteDia(i.visita.fecha) : undefined) : undefined,
          nota: notaReemplazo.trim() || undefined,
        },
        token,
      );
      setResumenReemplazo(r.resumen);
      setSustitutoId("");
      setNotaReemplazo("");
      setRecuperar(false);
      await recargar();
    } catch (e) {
      setErrorReemplazo(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido aplicar el reemplazo");
    } finally {
      setAplicando(false);
    }
  }

  async function enviarNota() {
    if (!nota.trim()) return;
    setEnviandoNota(true);
    try {
      await api.post(`/incidencias/${incidenciaId}/nota`, { nota: nota.trim() }, token);
      setNota("");
      await recargar();
    } finally {
      setEnviandoNota(false);
    }
  }

  if (!i) {
    return (
      <Modal title="Cargando…" onClose={onClose}>
        <p className="text-sm text-slate-500">Cargando incidencia…</p>
      </Modal>
    );
  }

  const esCancelacion = i.tipo === "SOLICITUD_CANCELACION";
  const siguientes = TRANSICIONES_INCIDENCIA[i.estado] ?? [];
  const motivo = infoMotivo(i.motivo);
  const IconoMotivo = motivo.Icono;

  // El caso puede colgar del servicio entero o de una jornada concreta; el
  // contexto es el mismo, solo cambia de dónde se saca.
  const servicio: IncidenciaServicio | null | undefined = i.servicio ?? i.visita?.servicio;
  const solicitud = servicio?.solicitud;
  const persona = solicitud?.persona;
  const profesional = i.visita?.profesional ?? servicio?.profesional;
  // Para reemplazar cuenta quién lleva el servicio ahora, no quién tenía
  // sellada aquella jornada: si ya se sustituyó, la jornada sigue siendo de
  // quien la tenía, pero a quien se releva es a la persona actual.
  const profesionalActual = servicio?.profesional ?? i.visita?.profesional;
  const plan = solicitud?.plan;
  const visita = i.visita;

  const fichados = visita ? minutosFichados(visita.horaInicioReal, visita.horaFinReal) : null;
  const previstos = visita ? minutosEntre(visita.horaInicioProg, visita.horaFinProg) ?? servicio?.minutosPrevistos ?? null : null;
  const desvio = fichados != null && previstos != null ? compararConAcordado(fichados, previstos) : null;

  const autor = i.creadoPor;
  const autorNombre = autor?.nombre ?? autor?.email ?? null;
  const autorRol = autor?.rol ? ROL_LEGIBLE[autor.rol] ?? autor.rol.toLowerCase() : null;

  return (
    <Modal title={`${i.codigo} · ${esCancelacion ? "Solicitud de cancelación" : "Incidencia"}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Qué ha pasado, de qué va y en qué estado está. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <IconoMotivo className="h-3.5 w-3.5" /> {motivo.etiqueta} · prioridad {i.prioridad.toLowerCase()}
            </p>
            <p className="mt-1 text-sm text-slate-800">{i.descripcion}</p>
            <p className="mt-1 text-xs text-slate-400">
              {autorNombre ? (
                <>
                  Abierta por <span className="font-medium text-slate-600">{autorNombre}</span>
                  {autorRol && ` (${autorRol})`}
                </>
              ) : (
                "No consta quién la abrió"
              )}
              {i.createdAt && ` · ${new Date(i.createdAt).toLocaleString("es-ES")}`}
            </p>
          </div>
          <EstadoBadge estado={i.estado} />
        </div>

        {/* El caso: de qué solicitud viene, a quién se atiende y quién la
            tiene asignada. Todo junto, que es lo que hace falta para poder
            llamar a alguien y resolverla. */}
        {(solicitud || profesional) && (
          <section className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <IconClipboard className="h-3.5 w-3.5 text-slate-400" /> El caso
              </p>
              {solicitud?.id && onAbrirSolicitud && (
                <button
                  onClick={() => onAbrirSolicitud(solicitud.id!)}
                  className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-800"
                >
                  Abrir la solicitud <IconArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {solicitud && persona && (
                <Dato etiqueta="Solicitud">
                  {solicitud.codigo ?? servicio?.codigo} · {solicitud.necesidad.nombre}
                  <span className="block text-xs text-slate-500">
                    {persona.nombre} {persona.apellidos}
                    {persona.telefono && ` · ${persona.telefono}`}
                  </span>
                </Dato>
              )}

              {servicio?.codigo && (
                <Dato etiqueta="Servicio">
                  {servicio.codigo}
                  <span className="block text-xs text-slate-500">
                    {servicio.tipoServicio === "RECURRENTE" ? "Recurrente" : "Puntual"}
                    {servicio.estado && ` · ${servicio.estado.replace(/_/g, " ").toLowerCase()}`}
                  </span>
                </Dato>
              )}

              <Dato etiqueta="Profesional asignada">
                {profesional ? (
                  <>
                    {profesional.nombre} {profesional.apellidos}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {profesional.telefono && (
                        <span className="flex items-center gap-1">
                          <IconPhone className="h-3 w-3" /> {profesional.telefono}
                        </span>
                      )}
                      {profesional.usuario?.email && (
                        <span className="flex items-center gap-1">
                          <IconMail className="h-3 w-3" /> {profesional.usuario.email}
                        </span>
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Sin cubrir</span>
                )}
              </Dato>

              {plan && (
                <Dato etiqueta="Cuándo se hace">
                  {plan.horaInicio && plan.horaFin ? `${plan.horaInicio}–${plan.horaFin}` : plan.franjaHoraria ?? "Sin horario fijado"}
                  <span className="block text-xs text-slate-500">
                    {plan.recurrencia ? plan.recurrencia : fechaCorta(plan.fechaInicio)}
                    {plan.recurrencia && ` · desde el ${fechaCorta(plan.fechaInicio)}`}
                    {plan.recurrencia && !plan.fechaFin && " · indefinido"}
                  </span>
                </Dato>
              )}
            </div>

            {/* Si la incidencia va de una jornada concreta, se ve esa jornada
                con su fichaje: es lo primero que se mira en una incidencia de
                horas o de ausencia. */}
            {visita && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <IconClock className="h-3.5 w-3.5 text-slate-400" />
                  Jornada {visita.codigo} · {fechaCorta(visita.fecha)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {fichados != null ? (
                    <>
                      Fichó de {horaDe(visita.horaInicioReal)} a {horaDe(visita.horaFinReal)} · {duracion(fichados)}
                      {visita.horaInicioProg && visita.horaFinProg && ` (previsto ${visita.horaInicioProg}–${visita.horaFinProg})`}
                      {desvio && desvio.desvio !== "exacto" && (
                        <span className={desvio.desvio === "de_mas" ? " text-amber-600" : " text-rose-600"}>
                          {" "}
                          {desvio.diferencia > 0 ? "+" : ""}
                          {duracion(desvio.diferencia)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="font-medium text-amber-600">Sin fichaje</span>
                  )}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Tramitar el reemplazo. Una baja, una enfermedad o un "no fue nadie"
            no se resuelven con una anotación: hay que poner a otra persona en
            el servicio. Se hace desde aquí, sin ir a buscar el servicio a otra
            pestaña, y la incidencia queda en resolución —no cerrada—, porque
            todavía falta avisar a la familia. */}
        {esGestor && !esCancelacion && i.servicioId && i.estado !== "CERRADA" && (
          <section className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <IconRefresh className="h-3.5 w-3.5 text-slate-400" /> Buscar reemplazo
            </p>
            <p className="mb-2 text-xs text-slate-500">
              {profesionalActual ? (
                <>
                  Pasa el servicio de{" "}
                  <span className="font-medium text-slate-700">
                    {profesionalActual.nombre} {profesionalActual.apellidos}
                  </span>{" "}
                  a otra persona. Las jornadas que aún no han empezado pasan al sustituto; las ya trabajadas siguen siendo de quien las hizo.
                </>
              ) : (
                "El servicio está sin cubrir. Elige quién lo atiende a partir de ahora."
              )}
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Quién va en su lugar
                <select
                  value={sustitutoId}
                  onChange={(e) => setSustitutoId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm font-normal normal-case text-slate-700"
                >
                  <option value="">Elige un profesional…</option>
                  {profesionales
                    .filter((p) => p.id !== profesionalActual?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} {p.apellidos}
                        {p.zona ? ` · ${p.zona}` : ""}
                      </option>
                    ))}
                </select>
              </label>

              {/* Recuperar la jornada perdida crea una nueva, no reescribe la
                  que no se hizo: aquel día no fue nadie y eso queda como pasó. */}
              {visita && (
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={recuperar} onChange={(e) => setRecuperar(e.target.checked)} className="h-4 w-4" />
                    Recuperar la jornada perdida otro día
                  </label>
                  {recuperar && (
                    <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Cuándo se recupera
                      <input
                        type="date"
                        value={fechaRecuperacion || siguienteDia(visita.fecha)}
                        onChange={(e) => setFechaRecuperacion(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm font-normal normal-case text-slate-700"
                      />
                      <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
                        Se crea una jornada nueva a la misma hora ({visita.horaInicioProg ?? "?"}–{visita.horaFinProg ?? "?"}).
                      </span>
                    </label>
                  )}
                </div>
              )}

              <input
                type="text"
                value={notaReemplazo}
                onChange={(e) => setNotaReemplazo(e.target.value)}
                placeholder="Nota para el historial (opcional): qué se ha hablado con la familia…"
                maxLength={500}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />

              <button
                onClick={aplicarReemplazo}
                disabled={aplicando || !sustitutoId}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                <IconRefresh className="h-4 w-4" />
                {aplicando ? "Aplicando…" : "Aplicar el reemplazo"}
              </button>
            </div>

            {resumenReemplazo && (
              <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{resumenReemplazo}</p>
            )}
            {errorReemplazo && (
              <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorReemplazo}</p>
            )}
          </section>
        )}

        {/* El estado como desplegable, igual que en el servicio: ofrece solo
            los pasos a los que de verdad se puede ir desde donde está, en vez
            de una fila de botones que crecía con cada fase. */}
        {!esCancelacion && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Estado
              <select
                value=""
                onChange={(e) => e.target.value && cambiarEstado(e.target.value)}
                disabled={siguientes.length === 0}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm font-normal normal-case text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {i.estado.replace(/_/g, " ").toLowerCase()}
                  {siguientes.length === 0 ? " · sin más pasos" : " · pasar a…"}
                </option>
                {siguientes.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado.replace(/_/g, " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </label>

            {/* A quién le toca resolverla. Sin esto, en el listado ponía
                "sin asignar" y nadie sabía de quién era. */}
            <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Asignada a
              <select
                value={i.responsable ? coordinadores.find((c) => c.email === i.responsable?.email)?.id ?? "" : ""}
                onChange={(e) => asignar(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm font-normal normal-case text-slate-700"
              >
                <option value="">Sin asignar</option>
                {coordinadores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre ?? c.email}
                  </option>
                ))}
              </select>
            </label>

            {/* Cerrar de un tirón, sin pasar por revisión, asignación y
                resolución: va directa a archivadas. */}
            {i.estado !== "CERRADA" && (
              <button
                onClick={cerrar}
                disabled={cerrando}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <IconCheckCircle className="h-4 w-4" />
                {cerrando ? "Cerrando…" : "Cerrar incidencia y archivar"}
              </button>
            )}
          </div>
        )}

        {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Anotaciones</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escribe una anotación…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              onClick={enviarNota}
              disabled={enviandoNota || !nota.trim()}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        </div>

        {i.estadoHistorial && i.estadoHistorial.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial</p>
            <ul className="space-y-1.5 text-xs text-slate-600">
              {[...i.estadoHistorial].reverse().map((h) => (
                <li key={h.id} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <span className="text-slate-400">{new Date(h.createdAt).toLocaleString("es-ES")}</span>
                  {h.estadoAnterior !== h.estadoNuevo && (
                    <span className="ml-2 font-medium text-slate-700">
                      {h.estadoAnterior?.replace(/_/g, " ")} <IconArrowRight className="inline h-3 w-3 align-text-bottom text-slate-300" /> {h.estadoNuevo.replace(/_/g, " ")}
                    </span>
                  )}
                  {h.motivo && <p className="mt-0.5">{h.motivo}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
