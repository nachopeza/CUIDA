import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { EstadoBadge, EstadoUnificadoBadge } from "../components/EstadoBadge.js";
import { estadoUnificadoDeSolicitud, ESTADOS_UNIFICADOS } from "../lib/estadoUnificado.js";
import { Pagination, usePaginacion } from "../components/Pagination.js";
import { ExportarBarra } from "../components/ExportarBarra.js";
import { SearchBox } from "../components/SearchBox.js";
import { ThOrdenable } from "../components/ThOrdenable.js";
import { useSeleccion } from "../lib/useSeleccion.js";
import { useOrdenacion } from "../lib/useOrdenacion.js";
import { exportarCSV } from "../lib/csv.js";
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
  IconTag,
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
import { ServiciosTab } from "./coordinador/ServiciosTab.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import { SolicitudFichaModal } from "../components/SolicitudFichaModal.js";
import { IncidenciaFichaModal } from "./coordinador/IncidenciaFichaModal.js";
import type { EmpresaColaboradora, Incidencia, Necesidad, Persona, Profesional, Servicio, Solicitud } from "../lib/types.js";

type Tab = "escritorio" | "solicitudes" | "servicios" | "incidencias" | "personas" | "profesionales" | "empresas" | "calendario" | "facturacion" | "actividad";

const NAV: { key: Tab; label: string; icon: typeof IconHome }[] = [
  { key: "escritorio", label: "Escritorio", icon: IconHome },
  { key: "solicitudes", label: "Solicitudes", icon: IconClipboard },
  { key: "servicios", label: "Servicios", icon: IconTag },
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

// Color por grupo (sección "dale estilo a las casillas de numeración de las
// solicitudes... planificadlas bien y estructúralas según su color de
// estado"): las casillas dejan de ser píldoras planas indistinguibles y
// pasan a tarjetas con el mismo código de color que el resto del panel.
const GRUPO_COLOR: Record<Grupo, { borde: string; fondo: string; texto: string; dot: string }> = {
  gestion: { borde: "border-amber-300", fondo: "bg-amber-50", texto: "text-amber-700", dot: "bg-amber-400" },
  en_proceso: { borde: "border-blue-300", fondo: "bg-blue-50", texto: "text-blue-700", dot: "bg-blue-400" },
  incidencias: { borde: "border-rose-300", fondo: "bg-rose-50", texto: "text-rose-700", dot: "bg-rose-400" },
  canceladas: { borde: "border-slate-300", fondo: "bg-slate-100", texto: "text-slate-700", dot: "bg-slate-400" },
  finalizadas: { borde: "border-teal-300", fondo: "bg-teal-50", texto: "text-teal-700", dot: "bg-teal-400" },
};

type Filtro = null | Grupo;

// Incidencia como ticket (sección "incidencia puede ser un ticket"): número
// de ticket, franja de color por prioridad y mini-pipeline del estado, en
// vez de una tarjeta genérica indistinguible de las demás.
const PIPELINE_INCIDENCIA = ["NUEVA", "EN_REVISION", "ASIGNADA", "EN_RESOLUCION", "RESUELTA", "CERRADA"];
const PRIORIDAD_BORDE: Record<string, string> = { ALTA: "border-l-rose-500", MEDIA: "border-l-amber-400", BAJA: "border-l-slate-300" };

export function CoordinadorPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("escritorio");
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [profesionalFiltro, setProfesionalFiltro] = useState("");
  const [busquedaSolicitudes, setBusquedaSolicitudes] = useState("");
  const [busquedaIncidencias, setBusquedaIncidencias] = useState("");
  const [prioridadFiltro, setPrioridadFiltro] = useState("");
  const [incidenciaEstadoFiltro, setIncidenciaEstadoFiltro] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [nuevaSolicitud, setNuevaSolicitud] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState<string | null>(null);
  const [incidenciaFichaAbierta, setIncidenciaFichaAbierta] = useState<string | null>(null);
  const [personaAbierta, setPersonaAbierta] = useState<string | null>(null);
  const [personasRefreshKey, setPersonasRefreshKey] = useState(0);

  async function cargar() {
    const [sols, servs, incs, pers, necs, pros] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Servicio[]>("/servicios", token),
      api.get<Incidencia[]>("/incidencias", token),
      api.get<Persona[]>("/personas", token),
      api.get<Necesidad[]>("/necesidades", token),
      api.get<Profesional[]>("/profesionales", token),
    ]);
    setSolicitudes(sols);
    setServicios(servs);
    setIncidencias(incs);
    setPersonas(pers);
    setNecesidades(necs);
    setProfesionales(pros);
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

  // El profesional ya terminó (Servicio FINALIZADO) pero coordinación
  // todavía no lo ha verificado: dentro de "En proceso" es el único caso
  // que requiere una acción de coordinación ahora mismo, así que se marca
  // aparte en vez de perderse mezclado con "confirmado"/"en curso".
  const porVerificarCount = useMemo(() => solicitudes.filter((s) => s.servicio?.estado === "FINALIZADO").length, [solicitudes]);

  const badges: Partial<Record<Tab, { valor: number; tono: "rose" | "amber" }>> = {
    incidencias: { valor: incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado)).length, tono: "rose" },
    solicitudes: { valor: gruposCount.gestion, tono: "amber" },
  };

  const solicitudesFiltradas = useMemo(() => {
    const q = busquedaSolicitudes.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (filtro && grupoDeSolicitud(s) !== filtro) return false;
      if (estadoFiltro && (s.servicio ? s.servicio.estado : s.estado) !== estadoFiltro) return false;
      if (tipoFiltro && (s.servicio?.tipoServicio ?? "PUNTUAL") !== tipoFiltro) return false;
      if (profesionalFiltro) {
        if (profesionalFiltro === "__sin__" && s.servicio?.profesionalId) return false;
        if (profesionalFiltro !== "__sin__" && s.servicio?.profesionalId !== profesionalFiltro) return false;
      }
      if (q) {
        const texto = `${s.codigo} ${s.persona.nombre} ${s.persona.apellidos} ${s.necesidad.nombre} ${s.descripcionLibre} ${
          s.servicio?.profesional ? `${s.servicio.profesional.nombre} ${s.servicio.profesional.apellidos}` : ""
        }`;
        if (!texto.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [solicitudes, filtro, estadoFiltro, tipoFiltro, profesionalFiltro, busquedaSolicitudes]);

  const ordenSolicitudes = useOrdenacion(solicitudesFiltradas, {
    codigo: (s) => s.codigo,
    fecha: (s) => s.createdAt,
    persona: (s) => `${s.persona.apellidos} ${s.persona.nombre}`,
    servicio: (s) => s.necesidad.nombre,
    estado: (s) => estadoUnificadoDeSolicitud(s),
    profesional: (s) => (s.servicio?.profesional ? `${s.servicio.profesional.apellidos} ${s.servicio.profesional.nombre}` : null),
  });

  const {
    items: solicitudesPagina,
    pagina: solicitudesPaginaActual,
    totalPaginas: solicitudesTotalPaginas,
    setPagina: setSolicitudesPagina,
  } = usePaginacion(ordenSolicitudes.ordenadas);
  const seleccionSolicitudes = useSeleccion(solicitudesFiltradas);

  // Eliminar en bloque (sección "si selecciono todas las solicitudes pueda
  // eliminarlo"): el backend solo deja borrar las que todavía no tienen
  // servicio en marcha, así que se informa de cuántas se han podido quitar.
  async function eliminarSolicitudes() {
    const filas = seleccionSolicitudes.seleccionadas;
    if (filas.length === 0) return;
    if (!confirm(`¿Eliminar ${filas.length} solicitud(es)? Las que ya tengan un servicio en marcha no se pueden borrar, hay que cancelarlas.`)) return;
    const resultados = await Promise.all(
      filas.map((s) =>
        api
          .delete(`/solicitudes/${s.id}`, token)
          .then(() => true)
          .catch(() => false),
      ),
    );
    const borradas = resultados.filter(Boolean).length;
    const bloqueadas = resultados.length - borradas;
    seleccionSolicitudes.limpiar();
    await cargar();
    if (bloqueadas > 0) {
      alert(`Se han eliminado ${borradas}. ${bloqueadas} no se han podido eliminar porque ya tienen un servicio en marcha: cancélalas desde su ficha.`);
    }
  }

  function exportarSolicitudes() {
    const filas = seleccionSolicitudes.seleccionadas.length > 0 ? seleccionSolicitudes.seleccionadas : solicitudesFiltradas;
    exportarCSV(
      filas,
      [
        { encabezado: "Código", valor: (s) => s.codigo },
        { encabezado: "Persona", valor: (s) => `${s.persona.nombre} ${s.persona.apellidos}` },
        { encabezado: "Necesidad", valor: (s) => s.necesidad.nombre },
        { encabezado: "Tipo", valor: (s) => (s.servicio?.tipoServicio === "RECURRENTE" ? "Recurrente" : "Puntual") },
        { encabezado: "Estado", valor: (s) => (s.servicio ? s.servicio.estado : s.estado) },
        { encabezado: "Profesional", valor: (s) => (s.servicio?.profesional ? `${s.servicio.profesional.nombre} ${s.servicio.profesional.apellidos}` : "") },
        { encabezado: "Creada", valor: (s) => new Date(s.createdAt).toLocaleDateString("es-ES") },
      ],
      "solicitudes",
    );
  }

  const incidenciasFiltradas = useMemo(() => {
    const q = busquedaIncidencias.trim().toLowerCase();
    return incidencias.filter((i) => {
      if (prioridadFiltro && i.prioridad !== prioridadFiltro) return false;
      if (incidenciaEstadoFiltro === "abiertas" && ["RESUELTA", "CERRADA"].includes(i.estado)) return false;
      if (incidenciaEstadoFiltro && incidenciaEstadoFiltro !== "abiertas" && i.estado !== incidenciaEstadoFiltro) return false;
      if (q && !`${i.codigo} ${i.descripcion} ${i.servicio?.solicitud?.persona.nombre ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [incidencias, prioridadFiltro, incidenciaEstadoFiltro, busquedaIncidencias]);

  const estadosPresentes = useMemo(() => {
    const set = new Set(solicitudes.map((s) => (s.servicio ? s.servicio.estado : s.estado)));
    return Array.from(set).sort();
  }, [solicitudes]);

  const tituloTab = NAV.find((n) => n.key === tab)?.label ?? "";

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Barra lateral (desktop) */}
      <aside className="hidden shrink-0 md:block md:w-56">
        <div className="sticky top-6">
          <div className="mb-3">
            <GlobalSearch
              personas={personas}
              solicitudes={solicitudes}
              onAbrirPersona={abrirPersona}
              onAbrirSolicitud={(id) => {
                setTab("solicitudes");
                setFichaAbierta(id);
              }}
            />
          </div>
          <nav className="space-y-0.5">
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
        </div>
      </aside>

      {/* Navegación móvil */}
      <div className="flex items-center gap-2 md:hidden">
        <button onClick={() => setMenuMovilAbierto((v) => !v)} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
          {menuMovilAbierto ? <IconX className="h-4 w-4" /> : <IconMenu className="h-4 w-4" />}
          {tituloTab}
        </button>
        <div className="min-w-0 flex-1">
          <GlobalSearch
            personas={personas}
            solicitudes={solicitudes}
            onAbrirPersona={abrirPersona}
            onAbrirSolicitud={(id) => {
              setTab("solicitudes");
              setFichaAbierta(id);
            }}
          />
        </div>
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
            <h2 className="text-lg font-semibold text-slate-800">{tab === "escritorio" ? "" : tituloTab}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        {tab === "escritorio" && <ResumenTab solicitudes={solicitudes} servicios={servicios} incidencias={incidencias} onIrA={irA} />}

        {tab === "solicitudes" && (
          <div>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <button
                onClick={() => setFiltro(null)}
                className={`rounded-lg border-2 px-2 py-2 text-center transition ${!filtro ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <p className={`text-xl font-semibold ${!filtro ? "text-brand-800" : "text-slate-800"}`}>{solicitudes.length}</p>
                <p className={`text-[11px] font-medium ${!filtro ? "text-brand-800" : "text-slate-500"}`}>Todas</p>
              </button>
              {(Object.keys(GRUPO_LABEL) as Grupo[]).map((g) => {
                const c = GRUPO_COLOR[g];
                const activo = filtro === g;
                return (
                  <button
                    key={g}
                    onClick={() => setFiltro(g)}
                    className={`rounded-lg border-2 px-2 py-2 text-center transition ${activo ? `${c.borde} ${c.fondo}` : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <p className={`text-xl font-semibold ${activo ? c.texto : "text-slate-800"}`}>{gruposCount[g]}</p>
                    <p className={`flex items-center justify-center gap-1 text-[11px] font-medium ${activo ? c.texto : "text-slate-500"}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} /> {GRUPO_LABEL[g]}
                    </p>
                  </button>
                );
              })}
            </div>

            {porVerificarCount > 0 && (
              <button
                onClick={() => {
                  setFiltro("en_proceso");
                  setEstadoFiltro("FINALIZADO");
                }}
                className={`mb-3 rounded-full px-3 py-1.5 text-xs font-medium ${
                  filtro === "en_proceso" && estadoFiltro === "FINALIZADO" ? "bg-orange-500 text-white" : "border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
                }`}
              >
                🕐 Por verificar ({porVerificarCount})
              </button>
            )}

            {/* Leyenda de color (sección "se debe ver de alguna forma
                visual que son los estados de cada solicitud. Simple
                minimalista"): una sola fuente de verdad (estadoUnificado.ts)
                para el color del badge, la leyenda y el estado que se puede
                elegir — así nunca se desincronizan entre sí. */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {ESTADOS_UNIFICADOS.map((e) => (
                <span key={e.clave} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${e.dot}`} /> {e.etiqueta}
                </span>
              ))}
            </div>

            {/* Barra de lista: buscar, ordenar y filtros avanzados encima de
                la tabla (sección "sobre ella una barra de búsqueda, un botón
                para ordenar, establecer filtros avanzados"). */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <SearchBox value={busquedaSolicitudes} onChange={setBusquedaSolicitudes} placeholder="Buscar por persona, código, servicio…" className="flex-1 sm:max-w-xs" />
              <select
                value={ordenSolicitudes.campo ?? ""}
                onChange={(e) => e.target.value && ordenSolicitudes.ordenarPor(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-2 text-xs"
              >
                <option value="">Ordenar por…</option>
                <option value="codigo">Código</option>
                <option value="fecha">Fecha de creación</option>
                <option value="persona">Persona</option>
                <option value="servicio">Servicio</option>
                <option value="estado">Estado</option>
                <option value="profesional">Profesional</option>
              </select>
              <button
                onClick={() => setFiltrosAbiertos((v) => !v)}
                className={`rounded-md border px-3 py-2 text-xs font-medium ${
                  estadoFiltro || tipoFiltro || profesionalFiltro ? "border-brand bg-brand-50 text-brand-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                ⚙ Filtros avanzados{[estadoFiltro, tipoFiltro, profesionalFiltro].filter(Boolean).length > 0 && ` (${[estadoFiltro, tipoFiltro, profesionalFiltro].filter(Boolean).length})`}
              </button>
              {(filtro || estadoFiltro || tipoFiltro || profesionalFiltro || busquedaSolicitudes) && (
                <button
                  onClick={() => {
                    setFiltro(null);
                    setEstadoFiltro("");
                    setTipoFiltro("");
                    setProfesionalFiltro("");
                    setBusquedaSolicitudes("");
                  }}
                  className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-700"
                >
                  Quitar filtros
                </button>
              )}
            </div>

            {filtrosAbiertos && (
              <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-3">
                <label className="text-slate-500">
                  Estado
                  <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5">
                    <option value="">Todos los estados</option>
                    {estadosPresentes.map((e) => (
                      <option key={e} value={e}>
                        {e.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-slate-500">
                  Tipo de servicio
                  <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5">
                    <option value="">Puntual y recurrente</option>
                    <option value="PUNTUAL">Puntual</option>
                    <option value="RECURRENTE">Recurrente</option>
                  </select>
                </label>
                <label className="text-slate-500">
                  Profesional
                  <select value={profesionalFiltro} onChange={(e) => setProfesionalFiltro(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5">
                    <option value="">Todos</option>
                    <option value="__sin__">Sin profesional asignado</option>
                    {profesionales.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} {p.apellidos}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {solicitudesFiltradas.length === 0 ? (
              <p className="text-sm text-slate-500">Sin solicitudes que mostrar.</p>
            ) : (
              <div>
                <ExportarBarra
                  total={solicitudesFiltradas.length}
                  seleccionadas={seleccionSolicitudes.seleccionadas.length}
                  onExportar={exportarSolicitudes}
                  onSeleccionarTodo={seleccionSolicitudes.seleccionarTodo}
                  onLimpiarSeleccion={seleccionSolicitudes.limpiar}
                  onEliminar={eliminarSolicitudes}
                  etiquetaEliminar="Eliminar solicitudes"
                />
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-8 px-4 py-2.5">
                        <input type="checkbox" checked={seleccionSolicitudes.todasMarcadas} onChange={seleccionSolicitudes.toggleTodos} />
                      </th>
                      <ThOrdenable campo="persona" campoActivo={ordenSolicitudes.campo} direccion={ordenSolicitudes.direccion} onOrdenar={ordenSolicitudes.ordenarPor}>
                        Persona
                      </ThOrdenable>
                      <ThOrdenable campo="servicio" campoActivo={ordenSolicitudes.campo} direccion={ordenSolicitudes.direccion} onOrdenar={ordenSolicitudes.ordenarPor}>
                        Servicio
                      </ThOrdenable>
                      <th className="px-4 py-2.5">Tipo</th>
                      <ThOrdenable campo="estado" campoActivo={ordenSolicitudes.campo} direccion={ordenSolicitudes.direccion} onOrdenar={ordenSolicitudes.ordenarPor}>
                        Estado
                      </ThOrdenable>
                      <ThOrdenable campo="profesional" campoActivo={ordenSolicitudes.campo} direccion={ordenSolicitudes.direccion} onOrdenar={ordenSolicitudes.ordenarPor}>
                        Profesional
                      </ThOrdenable>
                      <ThOrdenable campo="fecha" campoActivo={ordenSolicitudes.campo} direccion={ordenSolicitudes.direccion} onOrdenar={ordenSolicitudes.ordenarPor}>
                        Creada
                      </ThOrdenable>
                      <ThOrdenable campo="codigo" campoActivo={ordenSolicitudes.campo} direccion={ordenSolicitudes.direccion} onOrdenar={ordenSolicitudes.ordenarPor}>
                        Código
                      </ThOrdenable>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {solicitudesPagina.map((s) => (
                      <tr key={s.id} onClick={() => setFichaAbierta(s.id)} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={seleccionSolicitudes.ids.has(s.id)} onChange={() => seleccionSolicitudes.toggle(s.id)} />
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {s.persona.nombre} {s.persona.apellidos}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{s.necesidad.nombre}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {s.servicio?.tipoServicio === "RECURRENTE" ? "Recurrente" : "Puntual"}
                          {/* Un servicio sin fecha de fin es indefinido: se
                              marca de por sí, para no confundirlo con uno
                              recurrente que sí termina en una fecha. */}
                          {s.plan && !s.plan.fechaFin && (
                            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600" title="Sin fecha de fin">
                              📌 Indefinido
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <EstadoUnificadoBadge clave={estadoUnificadoDeSolicitud(s)} />
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
                        <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(s.createdAt).toLocaleDateString("es-ES")}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{s.codigo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination pagina={solicitudesPaginaActual} totalPaginas={solicitudesTotalPaginas} onChange={setSolicitudesPagina} total={solicitudesFiltradas.length} />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "servicios" && <ServiciosTab />}

        {tab === "incidencias" && (
          <div>
            {incidencias.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SearchBox value={busquedaIncidencias} onChange={setBusquedaIncidencias} placeholder="Buscar por código, descripción o persona…" className="flex-1 sm:max-w-xs" />
                <select value={prioridadFiltro} onChange={(e) => setPrioridadFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-xs">
                  <option value="">Todas las prioridades</option>
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Media</option>
                  <option value="BAJA">Baja</option>
                </select>
                <select value={incidenciaEstadoFiltro} onChange={(e) => setIncidenciaEstadoFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-xs">
                  <option value="">Todos los estados</option>
                  <option value="abiertas">Solo abiertas</option>
                  {PIPELINE_INCIDENCIA.map((e) => (
                    <option key={e} value={e}>
                      {e.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {incidenciasFiltradas.length > 0 && (
              <ExportarBarra
                total={incidenciasFiltradas.length}
                seleccionadas={0}
                onExportar={() =>
                  exportarCSV(
                    incidenciasFiltradas,
                    [
                      { encabezado: "Código", valor: (i) => i.codigo },
                      { encabezado: "Descripción", valor: (i) => i.descripcion },
                      { encabezado: "Prioridad", valor: (i) => i.prioridad },
                      { encabezado: "Estado", valor: (i) => i.estado },
                      { encabezado: "Persona", valor: (i) => i.servicio?.solicitud?.persona.nombre },
                    ],
                    "incidencias",
                  )
                }
              />
            )}
            {incidenciasFiltradas.length === 0 && <p className="text-sm text-slate-500">Sin incidencias que mostrar.</p>}
            {incidenciasFiltradas.map((i) => {
              const esCancelacion = i.tipo === "SOLICITUD_CANCELACION";
              const pendiente = !["RESUELTA", "CERRADA"].includes(i.estado);
              const paso = PIPELINE_INCIDENCIA.indexOf(i.estado);
              return (
                <div
                  key={i.id}
                  className={`mb-3 rounded-lg border border-l-4 border-slate-200 bg-white p-4 ${PRIORIDAD_BORDE[i.prioridad] ?? "border-l-slate-300"}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <button onClick={() => setIncidenciaFichaAbierta(i.id)} className="text-left hover:underline">
                      <p className="font-medium">
                        <span className="text-slate-400">🎫 {i.codigo}</span> {esCancelacion && "🚫 "}
                        {i.descripcion}
                      </p>
                      <p className="text-xs text-slate-400">
                        prioridad {i.prioridad.toLowerCase()}
                        {i.servicio?.solicitud && ` · ${i.servicio.solicitud.persona.nombre} · ${i.servicio.solicitud.necesidad.nombre}`}
                      </p>
                    </button>
                    <EstadoBadge estado={i.estado} />
                  </div>

                  {paso >= 0 && (
                    <div className="mb-3 flex items-center gap-1" title={PIPELINE_INCIDENCIA.map((e) => e.replace(/_/g, " ")).join(" → ")}>
                      {PIPELINE_INCIDENCIA.map((estado, idx) => (
                        <span key={estado} className={`h-1.5 flex-1 rounded-full ${idx <= paso ? "bg-slate-400" : "bg-slate-100"}`} />
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {esCancelacion && pendiente && (
                      <>
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
                      </>
                    )}
                    <button onClick={() => setIncidenciaFichaAbierta(i.id)} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">
                      Abrir ficha
                    </button>
                  </div>
                </div>
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
        {incidenciaFichaAbierta && (
          <IncidenciaFichaModal incidenciaId={incidenciaFichaAbierta} onClose={() => setIncidenciaFichaAbierta(null)} onChanged={cargar} />
        )}
      </div>
    </div>
  );
}
