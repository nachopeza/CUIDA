import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import { Pagination, usePaginacion } from "../components/Pagination.js";
import {
  IconActivity,
  IconAlert,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconClipboard,
  IconHome,
  IconMenu,
  IconPlus,
  IconReceipt,
  IconUsers,
  IconX,
} from "../components/icons.js";
import { ResumenTab } from "./coordinador/ResumenTab.js";
import { GlobalSearch } from "./coordinador/GlobalSearch.js";
import { PersonasTab } from "./coordinador/PersonasTab.js";
import { NuevoUsuarioModal } from "./coordinador/NuevoUsuarioModal.js";
import { PersonaDetalleModal } from "./coordinador/PersonaDetalleModal.js";
import { ProfesionalesTab } from "./coordinador/ProfesionalesTab.js";
import { EmpresasTab } from "./coordinador/EmpresasTab.js";
import { CalendarioTab } from "./coordinador/CalendarioTab.js";
import { ActividadTab } from "./coordinador/ActividadTab.js";
import { FacturacionTab } from "./coordinador/FacturacionTab.js";
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

type Tab = "resumen" | "solicitudes" | "incidencias" | "personas" | "profesionales" | "empresas" | "calendario" | "facturacion" | "actividad";

const NAV: { key: Tab; label: string; icon: typeof IconHome }[] = [
  { key: "resumen", label: "Resumen", icon: IconHome },
  { key: "solicitudes", label: "Solicitudes", icon: IconClipboard },
  { key: "incidencias", label: "Incidencias", icon: IconAlert },
  { key: "personas", label: "Usuarios", icon: IconUsers },
  { key: "profesionales", label: "Profesionales", icon: IconBriefcase },
  { key: "empresas", label: "Empresas colaboradoras", icon: IconBuilding },
  { key: "calendario", label: "Calendario", icon: IconCalendar },
  { key: "facturacion", label: "Facturación", icon: IconReceipt },
  { key: "actividad", label: "Actividad", icon: IconActivity },
];

// Agrupación única de la solicitud en un estado de negocio (sección "debe
// ser solicitudes (en general), gestión, en proceso, incidencias,
// canceladas y finalizadas"): una sola función de la que dependen los KPIs,
// los chips de filtro y el aviso de incidencia en la tabla, para que nunca
// se desincronicen entre sí (esa desincronización era la causa de que
// "Finalizadas" pareciera no encontrar nunca nada).
type Grupo = "gestion" | "en_proceso" | "incidencias" | "canceladas" | "finalizadas";

function grupoDeSolicitud(s: Solicitud): Grupo {
  const incidenciaAbierta = s.servicio?.incidencias?.some((i) => !["RESUELTA", "CERRADA"].includes(i.estado));
  if (incidenciaAbierta) return "incidencias";
  if (s.estado === "CANCELADA" || s.servicio?.estado === "CANCELADO") return "canceladas";
  if (s.servicio && ["VALIDADO", "CERRADO"].includes(s.servicio.estado)) return "finalizadas";
  if (s.servicio && ["CONFIRMADO", "EN_CURSO", "FINALIZADO"].includes(s.servicio.estado)) return "en_proceso";
  // Sin servicio todavía, o servicio PENDIENTE/ASIGNADO: coordinación
  // todavía está buscando o confirmando quién lo va a hacer.
  return "gestion";
}

const GRUPO_LABEL: Record<Grupo, string> = {
  gestion: "Gestión",
  en_proceso: "En proceso",
  incidencias: "Incidencias",
  canceladas: "Canceladas",
  finalizadas: "Finalizadas",
};

type Filtro = null | Grupo;

export function CoordinadorPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("resumen");
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [nuevaSolicitud, setNuevaSolicitud] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);
  const [personaAbierta, setPersonaAbierta] = useState<string | null>(null);
  const [personasRefreshKey, setPersonasRefreshKey] = useState(0);

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

  function irA(t: string, f?: string) {
    setTab(t as Tab);
    setFiltro((f ?? null) as Filtro);
    setMenuMovilAbierto(false);
  }

  async function abrirNuevaSolicitud() {
    // Refrescamos antes de abrir para que un usuario recién creado en la
    // pestaña "Usuarios" aparezca siempre en el selector (bug: "si creo un
    // perfil no te sale para añadirle un servicio").
    await cargar();
    setNuevaSolicitud(true);
  }

  function abrirPersona(id: string) {
    setPersonaAbierta(id);
  }

  async function alCrearUsuario() {
    setPersonasRefreshKey((k) => k + 1);
    await cargar();
  }

  const gruposCount = useMemo(() => {
    const conteo: Record<Grupo, number> = { gestion: 0, en_proceso: 0, incidencias: 0, canceladas: 0, finalizadas: 0 };
    for (const s of solicitudes) conteo[grupoDeSolicitud(s)]++;
    return conteo;
  }, [solicitudes]);

  const kpis: { label: string; valor: number; onClick: () => void }[] = [
    { label: "Solicitudes", valor: solicitudes.length, onClick: () => irA("solicitudes") },
    { label: "Gestión", valor: gruposCount.gestion, onClick: () => irA("solicitudes", "gestion") },
    { label: "En proceso", valor: gruposCount.en_proceso, onClick: () => irA("solicitudes", "en_proceso") },
    { label: "Incidencias", valor: gruposCount.incidencias, onClick: () => irA("solicitudes", "incidencias") },
    { label: "Canceladas", valor: gruposCount.canceladas, onClick: () => irA("solicitudes", "canceladas") },
    { label: "Finalizadas", valor: gruposCount.finalizadas, onClick: () => irA("solicitudes", "finalizadas") },
  ];

  const badges: Partial<Record<Tab, { valor: number; tono: "rose" | "amber" }>> = {
    incidencias: { valor: incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado)).length, tono: "rose" },
    solicitudes: { valor: gruposCount.gestion, tono: "amber" },
  };

  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((s) => {
      if (filtro && grupoDeSolicitud(s) !== filtro) return false;
      if (estadoFiltro && (s.servicio ? s.servicio.estado : s.estado) !== estadoFiltro) return false;
      if (tipoFiltro && (s.servicio?.tipoServicio ?? "PUNTUAL") !== tipoFiltro) return false;
      return true;
    });
  }, [solicitudes, filtro, estadoFiltro, tipoFiltro]);

  const { items: solicitudesPagina, pagina: solicitudesPaginaActual, totalPaginas: solicitudesTotalPaginas, setPagina: setSolicitudesPagina } = usePaginacion(solicitudesFiltradas);

  const estadosPresentes = useMemo(() => {
    const set = new Set(solicitudes.map((s) => (s.servicio ? s.servicio.estado : s.estado)));
    return Array.from(set).sort();
  }, [solicitudes]);

  const tituloTab = NAV.find((n) => n.key === tab)?.label ?? "";

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Barra lateral (desktop) */}
      <aside className="hidden shrink-0 md:block md:w-56">
        <nav className="sticky top-6 space-y-0.5">
          {NAV.map((n) => {
            const badge = badges[n.key];
            return (
              <button
                key={n.key}
                onClick={() => irA(n.key)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition ${
                  tab === n.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <n.icon className="h-4 w-4 shrink-0" />
                  {n.label}
                </span>
                {badge && badge.valor > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      tab === n.key ? "bg-white/25 text-white" : badge.tono === "rose" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {badge.valor}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Navegación móvil */}
      <div className="flex items-center justify-between md:hidden">
        <button onClick={() => setMenuMovilAbierto((v) => !v)} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
          {menuMovilAbierto ? <IconX className="h-4 w-4" /> : <IconMenu className="h-4 w-4" />}
          {tituloTab}
        </button>
      </div>
      {menuMovilAbierto && (
        <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-white p-2 md:hidden">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => irA(n.key)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium ${tab === n.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <n.icon className="h-4 w-4 shrink-0" />
              {n.label}
            </button>
          ))}
        </div>
      )}

      {/* Contenido principal */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{tab === "resumen" ? "Panel de coordinación" : tituloTab}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GlobalSearch
              personas={personas}
              solicitudes={solicitudes}
              onAbrirPersona={abrirPersona}
              onAbrirSolicitud={(id) => {
                setTab("solicitudes");
                setFichaAbierta(id);
              }}
            />
            <button
              onClick={() => setNuevoUsuario(true)}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <IconPlus className="h-4 w-4" /> Usuario
            </button>
            <button
              onClick={abrirNuevaSolicitud}
              className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              <IconPlus className="h-4 w-4" /> Solicitud
            </button>
          </div>
        </div>

        {tab === "resumen" && <ResumenTab solicitudes={solicitudes} servicios={servicios} incidencias={incidencias} kpis={kpis} onIrA={irA} />}

        {tab === "solicitudes" && (
          <div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                onClick={() => setFiltro(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${!filtro ? "bg-brand text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                Todas ({solicitudes.length})
              </button>
              {(Object.keys(GRUPO_LABEL) as Grupo[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setFiltro(g)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${filtro === g ? "bg-brand text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {GRUPO_LABEL[g]} ({gruposCount[g]})
                </button>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
                <option value="">Todos los estados</option>
                {estadosPresentes.map((e) => (
                  <option key={e} value={e}>
                    {e.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
                <option value="">Puntual y recurrente</option>
                <option value="PUNTUAL">Puntual</option>
                <option value="RECURRENTE">Recurrente</option>
              </select>
              {(filtro || estadoFiltro || tipoFiltro) && (
                <button
                  onClick={() => {
                    setFiltro(null);
                    setEstadoFiltro("");
                    setTipoFiltro("");
                  }}
                  className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-700"
                >
                  Quitar filtros
                </button>
              )}
            </div>

            {solicitudesFiltradas.length === 0 ? (
              <p className="text-sm text-slate-500">Sin solicitudes que mostrar.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Persona</th>
                      <th className="px-4 py-2.5">Necesidad</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5">Profesional</th>
                      <th className="px-4 py-2.5">Código</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {solicitudesPagina.map((s) => (
                      <tr key={s.id} onClick={() => setFichaAbierta(s.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {s.persona.nombre} {s.persona.apellidos}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{s.necesidad.nombre}</td>
                        <td className="px-4 py-2.5 text-slate-500">{s.servicio?.tipoServicio === "RECURRENTE" ? "Recurrente" : "Puntual"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <EstadoBadge estado={s.servicio ? s.servicio.estado : s.estado} />
                            {grupoDeSolicitud(s) === "incidencias" && (
                              <span className="text-amber-600" title="Incidencia abierta">
                                ⚠
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {s.servicio?.profesional ? `${s.servicio.profesional.nombre} ${s.servicio.profesional.apellidos}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{s.codigo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination pagina={solicitudesPaginaActual} totalPaginas={solicitudesTotalPaginas} onChange={setSolicitudesPagina} total={solicitudesFiltradas.length} />
              </div>
            )}
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

        {tab === "personas" && <PersonasTab onAbrirFicha={abrirPersona} refreshKey={personasRefreshKey} />}
        {tab === "profesionales" && <ProfesionalesTab />}
        {tab === "empresas" && <EmpresasTab />}
        {tab === "calendario" && <CalendarioTab />}
        {tab === "facturacion" && <FacturacionTab />}
        {tab === "actividad" && <ActividadTab />}

        {nuevaSolicitud && (
          <SolicitudModal
            personas={personas}
            necesidades={necesidades}
            onClose={() => setNuevaSolicitud(false)}
            onCreated={cargar}
          />
        )}

        {nuevoUsuario && (
          <NuevoUsuarioModal
            onClose={() => setNuevoUsuario(false)}
            onCreated={alCrearUsuario}
          />
        )}

        {personaAbierta && (
          <PersonaDetalleModal
            personaId={personaAbierta}
            onClose={() => setPersonaAbierta(null)}
            onCambiado={alCrearUsuario}
          />
        )}

        {fichaAbierta && <SolicitudFichaModal solicitudId={fichaAbierta} onClose={cerrarFicha} onChanged={cargar} />}
      </div>
    </div>
  );
}
