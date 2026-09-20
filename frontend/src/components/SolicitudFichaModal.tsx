import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Modal } from "./Modal.js";
import { EstadoBadge } from "./EstadoBadge.js";
import type { EmpresaColaboradora, Necesidad, Profesional, Solicitud } from "../lib/types.js";

const SIGUIENTE_SOLICITUD: Record<string, string> = {
  BORRADOR: "ENVIADA",
  ENVIADA: "EN_REVISION",
  EN_REVISION: "BUSCANDO",
  BUSCANDO: "PROPUESTA",
  PROPUESTA: "ACEPTADA",
};

const SIGUIENTE_SERVICIO: Record<string, string> = {
  CONFIRMADO: "EN_CURSO",
  EN_CURSO: "FINALIZADO",
  FINALIZADO: "VALIDADO",
  VALIDADO: "CERRADO",
};

const SERVICIO_CANCELABLE = ["PENDIENTE", "ASIGNADO", "CONFIRMADO", "EN_CURSO"];
const FRANJAS = ["Mañana", "Tarde", "Todo el día"];

interface Props {
  solicitudId: string;
  onClose: () => void;
  onChanged: () => void;
}

// Ficha unificada: solicitud + plan + servicio + visitas + incidencias en un
// solo sitio, en vez de repartidos entre las pestañas Solicitudes/Servicios.
export function SolicitudFichaModal({ solicitudId, onClose, onChanged }: Props) {
  const { token } = useAuth();
  const [s, setS] = useState<Solicitud | null>(null);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);

  const [plan, setPlan] = useState({ fechaInicio: "", fechaFin: "", horaInicio: "", horaFin: "", franjaHoraria: "Mañana", recurrencia: "" });
  const [tarifa, setTarifa] = useState({ empresaColaboradoraId: "", tarifaImporte: "", tarifaTipo: "" as "" | "PAGADO" | "VOLUNTARIO", tarifaNotas: "" });
  const [nuevaVisita, setNuevaVisita] = useState({ fecha: "", horaInicio: "", horaFin: "", tareas: "" });

  async function cargar() {
    const [sol, necs, pros, emps] = await Promise.all([
      api.get<Solicitud>(`/solicitudes/${solicitudId}`, token),
      api.get<Necesidad[]>("/necesidades", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token),
    ]);
    setS(sol);
    setNecesidades(necs);
    setProfesionales(pros);
    setEmpresas(emps);
    if (sol.plan) {
      setPlan({
        fechaInicio: sol.plan.fechaInicio.slice(0, 10),
        fechaFin: sol.plan.fechaFin.slice(0, 10),
        horaInicio: sol.plan.horaInicio ?? "",
        horaFin: sol.plan.horaFin ?? "",
        franjaHoraria: sol.plan.franjaHoraria ?? "Mañana",
        recurrencia: sol.plan.recurrencia ?? "",
      });
    }
    if (sol.servicio) {
      setTarifa({
        empresaColaboradoraId: sol.servicio.empresaColaboradoraId ?? "",
        tarifaImporte: sol.servicio.tarifaImporte != null ? String(sol.servicio.tarifaImporte) : "",
        tarifaTipo: sol.servicio.tarifaTipo ?? "",
        tarifaNotas: sol.servicio.tarifaNotas ?? "",
      });
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudId]);

  async function recargar() {
    await cargar();
    onChanged();
  }

  async function clasificar(necesidadId: string) {
    await api.patch(`/solicitudes/${solicitudId}`, { necesidadId }, token);
    await recargar();
  }

  async function avanzarSolicitud() {
    if (!s) return;
    const siguiente = SIGUIENTE_SOLICITUD[s.estado];
    if (!siguiente) return;
    await api.post(`/solicitudes/${solicitudId}/estado`, { estado: siguiente }, token);
    await recargar();
  }

  async function guardarPlan() {
    await api.post(
      `/solicitudes/${solicitudId}/plan`,
      {
        fechaInicio: new Date(plan.fechaInicio).toISOString(),
        fechaFin: new Date(plan.fechaFin).toISOString(),
        horaInicio: plan.horaInicio || undefined,
        horaFin: plan.horaFin || undefined,
        franjaHoraria: plan.franjaHoraria || undefined,
        recurrencia: plan.recurrencia || undefined,
      },
      token,
    );
    await recargar();
  }

  async function crearServicio() {
    await api.post(`/solicitudes/${solicitudId}/servicio`, {}, token);
    await recargar();
  }

  async function asignar(profesionalId: string) {
    if (!s?.servicio || !profesionalId) return;
    await api.post(`/servicios/${s.servicio.id}/asignar`, { profesionalId }, token);
    await recargar();
  }

  async function guardarTarifa() {
    if (!s?.servicio) return;
    await api.post(
      `/servicios/${s.servicio.id}/tarifa`,
      {
        empresaColaboradoraId: tarifa.empresaColaboradoraId || null,
        tarifaImporte: tarifa.tarifaImporte ? Number(tarifa.tarifaImporte) : null,
        tarifaTipo: tarifa.tarifaTipo || null,
        tarifaNotas: tarifa.tarifaNotas || undefined,
      },
      token,
    );
    await recargar();
  }

  async function avanzarServicio() {
    if (!s?.servicio) return;
    const siguiente = SIGUIENTE_SERVICIO[s.servicio.estado];
    if (!siguiente) return;
    await api.post(`/servicios/${s.servicio.id}/estado`, { estado: siguiente }, token);
    await recargar();
  }

  async function cancelarServicio() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/estado`, { estado: "CANCELADO" }, token);
    await recargar();
  }

  async function marcarPagado() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/pago`, {}, token);
    await recargar();
  }

  async function revisarVisita(visitaId: string) {
    await api.post(`/visitas/${visitaId}/revisar`, {}, token);
    await recargar();
  }

  async function programarVisita() {
    if (!s?.servicio || !nuevaVisita.fecha) return;
    await api.post(
      `/servicios/${s.servicio.id}/visitas`,
      {
        fecha: new Date(nuevaVisita.fecha).toISOString(),
        horaInicioProg: nuevaVisita.horaInicio || undefined,
        horaFinProg: nuevaVisita.horaFin || undefined,
        tareas: nuevaVisita.tareas
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
      token,
    );
    setNuevaVisita({ fecha: "", horaInicio: "", horaFin: "", tareas: "" });
    await recargar();
  }

  async function confirmarCancelacion() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/confirmar-cancelacion`, {}, token);
    await recargar();
  }

  async function rechazarCancelacion() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/rechazar-cancelacion`, {}, token);
    await recargar();
  }

  if (!s) {
    return (
      <Modal title="Cargando…" onClose={onClose} size="lg">
        <p className="text-sm text-slate-500">Cargando ficha…</p>
      </Modal>
    );
  }

  const srv = s.servicio;
  const cancelacionPendiente = srv?.incidencias?.find((i) => i.tipo === "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));

  return (
    <Modal title={`${s.persona.nombre} ${s.persona.apellidos} · ${s.codigo}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {cancelacionPendiente && (
          <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
            <p className="text-sm font-medium text-rose-700">🚫 Piden cancelar este servicio: {cancelacionPendiente.descripcion}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={confirmarCancelacion} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700">
                Confirmar cancelación
              </button>
              <button onClick={rechazarCancelacion} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">
                Seguir con el servicio
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Clasificación</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={s.necesidad.id} onChange={(e) => clasificar(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {necesidades.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
            <EstadoBadge estado={s.estado} />
            {SIGUIENTE_SOLICITUD[s.estado] && (
              <button onClick={avanzarSolicitud} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
                Avanzar a {SIGUIENTE_SOLICITUD[s.estado].replace(/_/g, " ")}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">{s.descripcionLibre}</p>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Días y horas</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-slate-500">
              Desde
              <input type="date" value={plan.fechaInicio} onChange={(e) => setPlan((p) => ({ ...p, fechaInicio: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              Hasta
              <input type="date" value={plan.fechaFin} onChange={(e) => setPlan((p) => ({ ...p, fechaFin: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              Hora inicio
              <input type="time" value={plan.horaInicio} onChange={(e) => setPlan((p) => ({ ...p, horaInicio: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              Hora fin
              <input type="time" value={plan.horaFin} onChange={(e) => setPlan((p) => ({ ...p, horaFin: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {FRANJAS.map((f) => (
              <button
                key={f}
                onClick={() => setPlan((p) => ({ ...p, franjaHoraria: f }))}
                className={`rounded-md border px-2.5 py-1 text-xs ${plan.franjaHoraria === f ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {f}
              </button>
            ))}
            <input
              type="text"
              placeholder="Recurrencia (ej. L-V)"
              value={plan.recurrencia}
              onChange={(e) => setPlan((p) => ({ ...p, recurrencia: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <button onClick={guardarPlan} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
              Guardar días/horas
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Servicio</p>

          {!srv && s.estado === "ACEPTADA" && s.plan && (
            <button onClick={crearServicio} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              Crear servicio
            </button>
          )}
          {!srv && (s.estado !== "ACEPTADA" || !s.plan) && (
            <p className="text-xs text-slate-400">
              {!s.plan ? "Guarda días/horas primero." : "La solicitud debe estar ACEPTADA para crear el servicio."}
            </p>
          )}

          {srv && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">{srv.codigo}</span>
                <EstadoBadge estado={srv.estado} />
                {srv.estado === "ASIGNADO" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Esperando aceptación…</span>}
                {SIGUIENTE_SERVICIO[srv.estado] && (
                  <button onClick={avanzarServicio} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">
                    Avanzar a {SIGUIENTE_SERVICIO[srv.estado].replace(/_/g, " ")}
                  </button>
                )}
                {SERVICIO_CANCELABLE.includes(srv.estado) && (
                  <button onClick={cancelarServicio} className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50">
                    Cancelar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <label className="text-slate-500">
                  Profesional (Cantabria)
                  <select
                    key={srv.profesionalId ?? "sin-asignar"}
                    defaultValue={srv.profesionalId ?? ""}
                    onChange={(e) => asignar(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                  >
                    <option value="" disabled>
                      Elegir…
                    </option>
                    {profesionales.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} {p.apellidos} · {p.zona ?? "Cantabria"}
                        {p.empresaColaboradora ? ` · ${p.empresaColaboradora.nombre}` : " · independiente"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-slate-500">
                  Empresa responsable
                  <select
                    value={tarifa.empresaColaboradoraId}
                    onChange={(e) => setTarifa((t) => ({ ...t, empresaColaboradoraId: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                  >
                    <option value="">Ninguna (independiente)</option>
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-slate-500">
                  Tipo de tarifa
                  <select
                    value={tarifa.tarifaTipo}
                    onChange={(e) => setTarifa((t) => ({ ...t, tarifaTipo: e.target.value as typeof tarifa.tarifaTipo }))}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                  >
                    <option value="">Sin definir</option>
                    <option value="PAGADO">Pagado</option>
                    <option value="VOLUNTARIO">Voluntario</option>
                  </select>
                </label>
                <label className="text-slate-500">
                  Importe €
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tarifa.tarifaImporte}
                    onChange={(e) => setTarifa((t) => ({ ...t, tarifaImporte: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                  />
                </label>
                <input
                  type="text"
                  placeholder="Notas de la tarifa (opcional)"
                  value={tarifa.tarifaNotas}
                  onChange={(e) => setTarifa((t) => ({ ...t, tarifaNotas: e.target.value }))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 sm:col-span-2"
                />
              </div>
              <button onClick={guardarTarifa} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">
                Guardar tarifa y lanzar
              </button>

              {tarifa.tarifaTipo === "PAGADO" && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="text-slate-500">Pago al profesional/empresa:</span>
                  <EstadoBadge estado={srv.pagoProfesionalEstado ?? "PENDIENTE"} />
                  {srv.pagoProfesionalEstado !== "PAGADO" && ["FINALIZADO", "VALIDADO", "CERRADO"].includes(srv.estado) && (
                    <button onClick={marcarPagado} className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800">
                      Marcar como pagado
                    </button>
                  )}
                </div>
              )}

              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Visitas programadas</p>
                {srv.visitas && srv.visitas.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {srv.visitas.map((v) => (
                      <li key={v.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                        <span>
                          {new Date(v.fecha).toLocaleDateString("es-ES")} {v.horaInicioProg && `· ${v.horaInicioProg}-${v.horaFinProg}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <EstadoBadge estado={v.estado} />
                          {v.estado === "FINALIZADA" && (
                            <button onClick={() => revisarVisita(v.id)} className="rounded-md border border-slate-300 px-2 py-0.5 hover:bg-slate-100">
                              Verificar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {["CONFIRMADO", "EN_CURSO"].includes(srv.estado) && (
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <input
                      type="date"
                      value={nuevaVisita.fecha}
                      onChange={(e) => setNuevaVisita((v) => ({ ...v, fecha: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1.5"
                    />
                    <input
                      type="time"
                      value={nuevaVisita.horaInicio}
                      onChange={(e) => setNuevaVisita((v) => ({ ...v, horaInicio: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1.5"
                    />
                    <input
                      type="time"
                      value={nuevaVisita.horaFin}
                      onChange={(e) => setNuevaVisita((v) => ({ ...v, horaFin: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1.5"
                    />
                    <input
                      type="text"
                      placeholder="Tareas, separadas por coma"
                      value={nuevaVisita.tareas}
                      onChange={(e) => setNuevaVisita((v) => ({ ...v, tareas: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1.5"
                    />
                    <button onClick={programarVisita} className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 hover:bg-slate-100 sm:col-span-4">
                      Programar visita
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {s.estadoHistorial && s.estadoHistorial.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial</p>
            <ul className="space-y-1 text-xs text-slate-500">
              {s.estadoHistorial.map((h) => (
                <li key={h.id}>
                  {new Date(h.createdAt).toLocaleString("es-ES")} · {h.estadoNuevo.replace(/_/g, " ")}
                  {h.motivo && ` — ${h.motivo}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
