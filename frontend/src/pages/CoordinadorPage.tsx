import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import type { Incidencia, Profesional, Servicio, Solicitud } from "../lib/types.js";

const SIGUIENTE_SOLICITUD: Record<string, string> = {
  BORRADOR: "ENVIADA",
  ENVIADA: "EN_REVISION",
  EN_REVISION: "BUSCANDO",
  BUSCANDO: "PROPUESTA",
  PROPUESTA: "ACEPTADA",
};

const SIGUIENTE_SERVICIO: Record<string, string> = {
  ASIGNADO: "CONFIRMADO",
  CONFIRMADO: "EN_CURSO",
  EN_CURSO: "FINALIZADO",
  FINALIZADO: "VALIDADO",
  VALIDADO: "CERRADO",
};

const SIGUIENTE_INCIDENCIA: Record<string, string> = {
  NUEVA: "EN_REVISION",
  EN_REVISION: "ASIGNADA",
  ASIGNADA: "EN_RESOLUCION",
  EN_RESOLUCION: "RESUELTA",
  RESUELTA: "CERRADA",
};

type Tab = "solicitudes" | "servicios" | "incidencias";

export function CoordinadorPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("solicitudes");
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [planForm, setPlanForm] = useState<Record<string, { fechaInicio: string; fechaFin: string; recurrencia: string; franjaHoraria: string }>>({});

  async function cargar() {
    const [sols, servs, pros, incs] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Servicio[]>("/servicios", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<Incidencia[]>("/incidencias", token),
    ]);
    setSolicitudes(sols);
    setServicios(servs);
    setProfesionales(pros);
    setIncidencias(incs);
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

  async function avanzarIncidencia(i: Incidencia) {
    const siguiente = SIGUIENTE_INCIDENCIA[i.estado];
    if (!siguiente) return;
    await api.post(`/incidencias/${i.id}/estado`, { estado: siguiente }, token);
    await cargar();
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Panel de coordinación</h2>

      <div className="mb-4 flex gap-2 text-sm">
        {(["solicitudes", "servicios", "incidencias"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 font-medium capitalize ${tab === t ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-300"}`}
          >
            {t}
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
          {servicios.map((s) => (
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
                  <select
                    onChange={(e) => asignar(s.id, e.target.value)}
                    defaultValue=""
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
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
                {SIGUIENTE_SERVICIO[s.estado] && (
                  <button onClick={() => avanzarServicio(s)} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">
                    Avanzar a {SIGUIENTE_SERVICIO[s.estado].replace(/_/g, " ")}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "incidencias" && (
        <div>
          {incidencias.length === 0 && <p className="text-sm text-slate-500">Sin incidencias abiertas.</p>}
          {incidencias.map((i) => (
            <Card key={i.id}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{i.descripcion}</p>
                  <p className="text-xs text-slate-400">
                    {i.codigo} · prioridad {i.prioridad}
                  </p>
                </div>
                <EstadoBadge estado={i.estado} />
              </div>
              {SIGUIENTE_INCIDENCIA[i.estado] && (
                <button onClick={() => avanzarIncidencia(i)} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">
                  Avanzar a {SIGUIENTE_INCIDENCIA[i.estado].replace(/_/g, " ")}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
