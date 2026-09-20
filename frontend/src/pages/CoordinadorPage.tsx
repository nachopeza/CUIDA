import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import { PersonasTab } from "./coordinador/PersonasTab.js";
import { ProfesionalesTab } from "./coordinador/ProfesionalesTab.js";
import { EmpresasTab } from "./coordinador/EmpresasTab.js";
import { CalendarioTab } from "./coordinador/CalendarioTab.js";
import { ActividadTab } from "./coordinador/ActividadTab.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import type { EmpresaColaboradora, Incidencia, Necesidad, Persona, Profesional, Servicio, Solicitud } from "../lib/types.js";

const SIGUIENTE_SOLICITUD: Record<string, string> = {
  BORRADOR: "ENVIADA",
  ENVIADA: "EN_REVISION",
  EN_REVISION: "BUSCANDO",
  BUSCANDO: "PROPUESTA",
  PROPUESTA: "ACEPTADA",
};

// ASIGNADO → CONFIRMADO ya no está aquí: solo el propio profesional puede
// aceptar (POST /servicios/:id/aceptar). Coordinación propone, no acepta.
const SIGUIENTE_SERVICIO: Record<string, string> = {
  CONFIRMADO: "EN_CURSO",
  EN_CURSO: "FINALIZADO",
  FINALIZADO: "VALIDADO",
  VALIDADO: "CERRADO",
};

const SERVICIO_CANCELABLE = ["PENDIENTE", "ASIGNADO", "CONFIRMADO", "EN_CURSO"];

const SIGUIENTE_INCIDENCIA: Record<string, string> = {
  NUEVA: "EN_REVISION",
  EN_REVISION: "ASIGNADA",
  ASIGNADA: "EN_RESOLUCION",
  EN_RESOLUCION: "RESUELTA",
  RESUELTA: "CERRADA",
};

type Tab = "solicitudes" | "servicios" | "incidencias" | "personas" | "profesionales" | "empresas" | "calendario" | "actividad";

const TAB_LABEL: Record<Tab, string> = {
  solicitudes: "Solicitudes",
  servicios: "Servicios",
  incidencias: "Incidencias",
  personas: "Usuarios",
  profesionales: "Profesionales",
  empresas: "Empresas colaboradoras",
  calendario: "Calendario",
  actividad: "Actividad",
};

interface TarifaForm {
  empresaColaboradoraId: string;
  tarifaImporte: string;
  tarifaTipo: "PAGADO" | "VOLUNTARIO" | "";
  tarifaNotas: string;
}

const TARIFA_VACIA: TarifaForm = { empresaColaboradoraId: "", tarifaImporte: "", tarifaTipo: "", tarifaNotas: "" };

export function CoordinadorPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("solicitudes");
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [planForm, setPlanForm] = useState<Record<string, { fechaInicio: string; fechaFin: string; recurrencia: string; franjaHoraria: string }>>({});
  const [tarifaForm, setTarifaForm] = useState<Record<string, TarifaForm>>({});
  const [nuevaSolicitud, setNuevaSolicitud] = useState(false);

  async function cargar() {
    const [sols, servs, pros, incs, emps, pers, necs] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Servicio[]>("/servicios", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<Incidencia[]>("/incidencias", token),
      api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token),
      api.get<Persona[]>("/personas", token),
      api.get<Necesidad[]>("/necesidades", token),
    ]);
    setSolicitudes(sols);
    setServicios(servs);
    setProfesionales(pros);
    setIncidencias(incs);
    setEmpresas(emps);
    setPersonas(pers);
    setNecesidades(necs);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function avanzarSolicitud(s: Solicitud) {
    const siguiente = SIGUIENTE_SOLICITUD[s.estado];
    if (!siguiente) return;
    await api.post(`/solicitudes/${s.id}/estado`, { estado: siguiente }, token);
    await cargar();
  }

  async function guardarPlan(s: Solicitud) {
    const form = planForm[s.id];
    if (!form) return;
    await api.post(
      `/solicitudes/${s.id}/plan`,
      {
        fechaInicio: new Date(form.fechaInicio).toISOString(),
        fechaFin: new Date(form.fechaFin).toISOString(),
        recurrencia: form.recurrencia,
        franjaHoraria: form.franjaHoraria,
      },
      token,
    );
    await cargar();
  }

  async function crearServicio(s: Solicitud) {
    await api.post(`/solicitudes/${s.id}/servicio`, {}, token);
    await cargar();
  }

  async function asignar(servicioId: string, profesionalId: string) {
    if (!profesionalId) return;
    await api.post(`/servicios/${servicioId}/asignar`, { profesionalId }, token);
    await cargar();
  }

  async function avanzarServicio(s: Servicio) {
    const siguiente = SIGUIENTE_SERVICIO[s.estado];
    if (!siguiente) return;
    await api.post(`/servicios/${s.id}/estado`, { estado: siguiente }, token);
    await cargar();
  }

  async function guardarTarifa(servicioId: string) {
    const form = tarifaForm[servicioId] ?? TARIFA_VACIA;
    await api.post(
      `/servicios/${servicioId}/tarifa`,
      {
        empresaColaboradoraId: form.empresaColaboradoraId || null,
        tarifaImporte: form.tarifaImporte ? Number(form.tarifaImporte) : null,
        tarifaTipo: form.tarifaTipo || null,
        tarifaNotas: form.tarifaNotas || undefined,
      },
      token,
    );
    await cargar();
  }

  async function avanzarIncidencia(i: Incidencia) {
    const siguiente = SIGUIENTE_INCIDENCIA[i.estado];
    if (!siguiente) return;
    await api.post(`/incidencias/${i.id}/estado`, { estado: siguiente }, token);
    await cargar();
  }

  async function cancelarServicioDirecto(servicioId: string) {
    await api.post(`/servicios/${servicioId}/estado`, { estado: "CANCELADO" }, token);
    await cargar();
  }

  async function confirmarCancelacion(servicioId: string) {
    await api.post(`/servicios/${servicioId}/confirmar-cancelacion`, {}, token);
    await cargar();
  }

  async function rechazarCancelacion(servicioId: string) {
    await api.post(`/servicios/${servicioId}/rechazar-cancelacion`, {}, token);
    await cargar();
  }

  const kpis = [
    { label: "Solicitudes", valor: solicitudes.length },
    { label: "Gestionadas", valor: solicitudes.filter((s) => s.estado === "ACEPTADA" || s.servicio).length },
    { label: "En proceso", valor: servicios.filter((s) => s.estado === "EN_CURSO").length },
    { label: "Incidencias abiertas", valor: incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado)).length },
    { label: "Canceladas", valor: servicios.filter((s) => s.estado === "CANCELADO").length },
    { label: "Finalizadas", valor: servicios.filter((s) => ["VALIDADO", "CERRADO"].includes(s.estado)).length },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Panel de coordinación</h2>
        <button onClick={() => setNuevaSolicitud(true)} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          + Nueva solicitud
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
            <p className="text-2xl font-semibold text-slate-800">{k.valor}</p>
            <p className="text-xs text-slate-500">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 font-medium ${tab === t ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "solicitudes" && (
        <div>
          {solicitudes.map((s) => (
            <Card key={s.id}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {s.persona.nombre} {s.persona.apellidos} · {s.necesidad.nombre}
                  </p>
                  <p className="text-xs text-slate-400">{s.codigo} · {s.descripcionLibre}</p>
                </div>
                <EstadoBadge estado={s.estado} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {SIGUIENTE_SOLICITUD[s.estado] && (
                  <button onClick={() => avanzarSolicitud(s)} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100">
                    Avanzar a {SIGUIENTE_SOLICITUD[s.estado].replace(/_/g, " ")}
                  </button>
                )}
                {!s.servicio && s.estado === "ACEPTADA" && s.plan && (
                  <button onClick={() => crearServicio(s)} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">
                    Crear servicio
                  </button>
                )}
              </div>

              {!s.plan && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
                  <input
                    type="date"
                    onChange={(e) => setPlanForm((p) => ({ ...p, [s.id]: { ...p[s.id], fechaInicio: e.target.value } as any }))}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="date"
                    onChange={(e) => setPlanForm((p) => ({ ...p, [s.id]: { ...p[s.id], fechaFin: e.target.value } as any }))}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="text"
                    placeholder="Recurrencia"
                    onChange={(e) => setPlanForm((p) => ({ ...p, [s.id]: { ...p[s.id], recurrencia: e.target.value } as any }))}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                  <input
                    type="text"
                    placeholder="Franja horaria"
                    onChange={(e) => setPlanForm((p) => ({ ...p, [s.id]: { ...p[s.id], franjaHoraria: e.target.value } as any }))}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  />
                  <button onClick={() => guardarPlan(s)} className="col-span-2 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 sm:col-span-4">
                    Guardar plan
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === "servicios" && (
        <div>
          {servicios.map((s) => {
            const tf = tarifaForm[s.id] ?? TARIFA_VACIA;
            const tieneTarifa = s.tarifaImporte != null || s.tarifaTipo != null || s.empresaColaboradoraId;
            return (
              <Card key={s.id}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {s.solicitud?.persona.nombre} · {s.solicitud?.necesidad.nombre}
                    </p>
                    <p className="text-xs text-slate-400">{s.codigo}</p>
                  </div>
                  <EstadoBadge estado={s.estado} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {s.estado === "PENDIENTE" && (
                    <select onChange={(e) => asignar(s.id, e.target.value)} defaultValue="" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                      <option value="" disabled>
                        Asignar profesional…
                      </option>
                      {profesionales.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} {p.apellidos} ({p.zona})
                        </option>
                      ))}
                    </select>
                  )}
                  {s.estado === "ASIGNADO" && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">Esperando que el profesional acepte…</span>
                  )}
                  {SIGUIENTE_SERVICIO[s.estado] && (
                    <button onClick={() => avanzarServicio(s)} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">
                      Avanzar a {SIGUIENTE_SERVICIO[s.estado].replace(/_/g, " ")}
                    </button>
                  )}
                  {SERVICIO_CANCELABLE.includes(s.estado) && (
                    <button onClick={() => cancelarServicioDirecto(s.id)} className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50">
                      Cancelar
                    </button>
                  )}
                </div>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    Empresa colaboradora y tarifa <span className="text-slate-400">(no visible para la persona atendida)</span>
                  </p>
                  {tieneTarifa && (
                    <p className="mb-2 text-xs text-slate-600">
                      Actual: {s.empresaColaboradora ? `${s.empresaColaboradora.nombre} · ` : ""}
                      {s.tarifaTipo === "VOLUNTARIO" ? "Voluntario (sin coste)" : s.tarifaImporte != null ? `${s.tarifaImporte} €` : "sin definir"}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <select
                      value={tf.empresaColaboradoraId}
                      onChange={(e) => setTarifaForm((p) => ({ ...p, [s.id]: { ...tf, empresaColaboradoraId: e.target.value } }))}
                      className="rounded-md border border-slate-300 px-2 py-1"
                    >
                      <option value="">Sin empresa externa</option>
                      {empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nombre}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tf.tarifaTipo}
                      onChange={(e) => setTarifaForm((p) => ({ ...p, [s.id]: { ...tf, tarifaTipo: e.target.value as TarifaForm["tarifaTipo"] } }))}
                      className="rounded-md border border-slate-300 px-2 py-1"
                    >
                      <option value="">Tipo…</option>
                      <option value="PAGADO">Pagado</option>
                      <option value="VOLUNTARIO">Voluntario</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Importe €"
                      value={tf.tarifaImporte}
                      onChange={(e) => setTarifaForm((p) => ({ ...p, [s.id]: { ...tf, tarifaImporte: e.target.value } }))}
                      className="rounded-md border border-slate-300 px-2 py-1"
                    />
                    <input
                      type="text"
                      placeholder="Notas (opcional)"
                      value={tf.tarifaNotas}
                      onChange={(e) => setTarifaForm((p) => ({ ...p, [s.id]: { ...tf, tarifaNotas: e.target.value } }))}
                      className="rounded-md border border-slate-300 px-2 py-1"
                    />
                  </div>
                  <button onClick={() => guardarTarifa(s.id)} className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">
                    Guardar tarifa
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "incidencias" && (
        <div>
          {incidencias.length === 0 && <p className="text-sm text-slate-500">Sin incidencias abiertas.</p>}
          {incidencias.map((i) => {
            const esCancelacion = i.tipo === "SOLICITUD_CANCELACION";
            const pendiente = !["RESUELTA", "CERRADA"].includes(i.estado);
            return (
              <Card key={i.id}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {esCancelacion && "🚫 "}
                      {i.descripcion}
                    </p>
                    <p className="text-xs text-slate-400">
                      {i.codigo} · prioridad {i.prioridad}
                      {i.servicio?.solicitud && ` · ${i.servicio.solicitud.persona.nombre} · ${i.servicio.solicitud.necesidad.nombre}`}
                    </p>
                  </div>
                  <EstadoBadge estado={i.estado} />
                </div>

                {esCancelacion && pendiente ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => i.servicioId && confirmarCancelacion(i.servicioId)}
                      className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
                    >
                      Confirmar cancelación
                    </button>
                    <button
                      onClick={() => i.servicioId && rechazarCancelacion(i.servicioId)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
                    >
                      Seguir con el servicio
                    </button>
                  </div>
                ) : (
                  SIGUIENTE_INCIDENCIA[i.estado] && (
                    <button onClick={() => avanzarIncidencia(i)} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">
                      Avanzar a {SIGUIENTE_INCIDENCIA[i.estado].replace(/_/g, " ")}
                    </button>
                  )
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === "personas" && <PersonasTab />}
      {tab === "profesionales" && <ProfesionalesTab />}
      {tab === "empresas" && <EmpresasTab />}
      {tab === "calendario" && <CalendarioTab />}
      {tab === "actividad" && <ActividadTab />}

      {nuevaSolicitud && (
        <SolicitudModal
          personas={personas}
          necesidades={necesidades}
          onClose={() => setNuevaSolicitud(false)}
          onCreated={cargar}
        />
      )}
    </div>
  );
}
