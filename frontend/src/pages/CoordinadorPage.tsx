import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { SolicitudFichaModal } from "../components/SolicitudFichaModal.js";
import type { EmpresaColaboradora, Incidencia, Necesidad, Persona, Profesional, Servicio, Solicitud } from "../lib/types.js";

const SIGUIENTE_INCIDENCIA: Record<string, string> = {
  NUEVA: "EN_REVISION",
  EN_REVISION: "ASIGNADA",
  ASIGNADA: "EN_RESOLUCION",
  EN_RESOLUCION: "RESUELTA",
  RESUELTA: "CERRADA",
};

type Tab = "solicitudes" | "incidencias" | "personas" | "profesionales" | "empresas" | "calendario" | "actividad";

const TAB_LABEL: Record<Tab, string> = {
  solicitudes: "Solicitudes",
  incidencias: "Incidencias",
  personas: "Usuarios",
  profesionales: "Profesionales",
  empresas: "Empresas colaboradoras",
  calendario: "Calendario",
  actividad: "Actividad",
};

type Filtro = null | "gestionadas" | "en_proceso" | "canceladas" | "finalizadas";

export function CoordinadorPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("solicitudes");
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [nuevaSolicitud, setNuevaSolicitud] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);

  async function cargar() {
    const [sols, servs, incs, pers, necs] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Servicio[]>("/servicios", token),
      api.get<Incidencia[]>("/incidencias", token),
      api.get<Persona[]>("/personas", token),
      api.get<Necesidad[]>("/necesidades", token),
    ]);
    setSolicitudes(sols);
    setServicios(servs);
    setIncidencias(incs);
    setPersonas(pers);
    setNecesidades(necs);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al pinchar una notificación llegamos aquí con ?solicitud=<id> en la URL:
  // abrimos su ficha directamente, sin que la coordinadora tenga que buscarla.
  useEffect(() => {
    const id = searchParams.get("solicitud");
    if (id) {
      setTab("solicitudes");
      setFichaAbierta(id);
    }
  }, [searchParams]);

  function cerrarFicha() {
    setFichaAbierta(null);
    if (searchParams.get("solicitud")) {
      searchParams.delete("solicitud");
      setSearchParams(searchParams, { replace: true });
    }
  }

  async function avanzarIncidencia(i: Incidencia) {
    const siguiente = SIGUIENTE_INCIDENCIA[i.estado];
    if (!siguiente) return;
    await api.post(`/incidencias/${i.id}/estado`, { estado: siguiente }, token);
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

  function irA(t: Tab, f: Filtro = null) {
    setTab(t);
    setFiltro(f);
  }

  const kpis: { label: string; valor: number; onClick: () => void }[] = [
    { label: "Solicitudes", valor: solicitudes.length, onClick: () => irA("solicitudes") },
    {
      label: "Gestionadas",
      valor: solicitudes.filter((s) => s.estado === "ACEPTADA" || s.servicio).length,
      onClick: () => irA("solicitudes", "gestionadas"),
    },
    {
      label: "En proceso",
      valor: servicios.filter((s) => s.estado === "EN_CURSO").length,
      onClick: () => irA("solicitudes", "en_proceso"),
    },
    {
      label: "Incidencias abiertas",
      valor: incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado)).length,
      onClick: () => irA("incidencias"),
    },
    {
      label: "Canceladas",
      valor: servicios.filter((s) => s.estado === "CANCELADO").length,
      onClick: () => irA("solicitudes", "canceladas"),
    },
    {
      label: "Finalizadas",
      valor: servicios.filter((s) => ["VALIDADO", "CERRADO"].includes(s.estado)).length,
      onClick: () => irA("solicitudes", "finalizadas"),
    },
  ];

  const solicitudesFiltradas = solicitudes.filter((s) => {
    if (!filtro) return true;
    if (filtro === "gestionadas") return s.estado === "ACEPTADA" || s.servicio;
    if (filtro === "en_proceso") return s.servicio?.estado === "EN_CURSO";
    if (filtro === "canceladas") return s.servicio?.estado === "CANCELADO";
    if (filtro === "finalizadas") return s.servicio && ["VALIDADO", "CERRADO"].includes(s.servicio.estado);
    return true;
  });

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
          <button
            key={k.label}
            onClick={k.onClick}
            className="rounded-lg border border-slate-200 bg-white p-3 text-center transition hover:border-slate-400 hover:bg-slate-50"
          >
            <p className="text-2xl font-semibold text-slate-800">{k.valor}</p>
            <p className="text-xs text-slate-500">{k.label}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t !== "solicitudes") setFiltro(null);
            }}
            className={`rounded-md px-3 py-1.5 font-medium ${tab === t ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "solicitudes" && (
        <div>
          {filtro && (
            <button onClick={() => setFiltro(null)} className="mb-3 text-xs text-slate-500 underline decoration-dotted hover:text-slate-700">
              Quitar filtro
            </button>
          )}
          {solicitudesFiltradas.length === 0 && <p className="text-sm text-slate-500">Sin solicitudes que mostrar.</p>}
          {solicitudesFiltradas.map((s) => (
            <button key={s.id} onClick={() => setFichaAbierta(s.id)} className="block w-full text-left">
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {s.persona.nombre} {s.persona.apellidos} · {s.necesidad.nombre}
                    </p>
                    <p className="text-xs text-slate-400">
                      {s.codigo} · {s.descripcionLibre}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <EstadoBadge estado={s.estado} />
                    {s.servicio && <EstadoBadge estado={s.servicio.estado} />}
                  </div>
                </div>
              </Card>
            </button>
          ))}
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

      {fichaAbierta && <SolicitudFichaModal solicitudId={fichaAbierta} onClose={cerrarFicha} onChanged={cargar} />}
    </div>
  );
}
