import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { useRegistrarMenuMovil } from "../lib/menuMovil.js";
import { api } from "../lib/api.js";
import { EstadoBadge, EstadoUnificadoBadge } from "../components/EstadoBadge.js";
import { estadoDeSolicitud, tieneIncidencia, ESTADOS, infoEstado, type ClaveEstado } from "../lib/estadoUnificado.js";
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
  IconCheckCircle,
  IconClipboard,
  IconHome,
  IconList,
  IconInfinity,
  IconPlus,
  IconReceipt,
  IconChart,
  IconSettings,
  IconTag,
  IconUsers,
  IconIdCard,
  IconShield,
  IconUsersGroup,
  IconX,
} from "../components/icons.js";
import { ResumenTab } from "./coordinador/ResumenTab.js";
import { GlobalSearch } from "./coordinador/GlobalSearch.js";
import { Navegacion, type AreaNav } from "../components/Navegacion.js";
import { duracion, minutosEntre } from "../lib/economia.js";
import { PersonasTab } from "./coordinador/PersonasTab.js";
import { NuevoUsuarioModal } from "./coordinador/NuevoUsuarioModal.js";
import { PersonaDetalleModal } from "./coordinador/PersonaDetalleModal.js";
import { ProfesionalesTab } from "./coordinador/ProfesionalesTab.js";
import { EmpresasTab } from "./coordinador/EmpresasTab.js";
import { CalendarioTab } from "./coordinador/CalendarioTab.js";
import { ActividadTab } from "./coordinador/ActividadTab.js";
import { FacturacionTab } from "./coordinador/FacturacionTab.js";
import { ServiciosTab } from "./coordinador/ServiciosTab.js";
import { VerificacionTab } from "./coordinador/VerificacionTab.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import { SolicitudFichaModal } from "../components/SolicitudFichaModal.js";
import { IncidenciaFichaModal } from "./coordinador/IncidenciaFichaModal.js";
import { IncidenciasTab } from "./coordinador/IncidenciasTab.js";
import { EquipoTab } from "./coordinador/EquipoTab.js";
import { AnalisisTab } from "./coordinador/AnalisisTab.js";
import { BandejaTab } from "./coordinador/BandejaTab.js";
import { ReglasTab } from "./coordinador/ReglasTab.js";
import { ProteccionDatosTab } from "./coordinador/ProteccionDatosTab.js";
import { EmpresaTab } from "./coordinador/EmpresaTab.js";
import { PersonalTab } from "./coordinador/PersonalTab.js";
import { CoberturaTab } from "./coordinador/CoberturaTab.js";
import type { EmpresaColaboradora, Incidencia, Necesidad, Persona, Profesional, RiesgosCobertura, Servicio, Solicitud } from "../lib/types.js";

type Tab =
  | "empresa"
  | "proteccion"
  | "bandeja"
  | "analisis"
  | "reglas"
  | "escritorio"
  | "solicitudes"
  | "verificacion"
  | "servicios"
  | "incidencias"
  | "personas"
  | "profesionales"
  | "equipo"
  | "empresas"
  | "calendario"
  | "facturacion"
  | "personal"
  | "cobertura"
  | "actividad";

// Doce entradas sueltas obligaban a leérselas todas para encontrar una. Se
// agrupan por aquello de lo que tratan, que es también el orden en que se
// trabaja: primero lo que ocurre hoy, luego a quién atiendes, con quién,
// cómo va, cuánto se cobra y, al final, la casa.
//
// Profesionales y Equipo son cosas distintas y por eso están en áreas
// distintas: profesional es quien hace el servicio en casa de la persona
// —trabaje para la empresa o por su cuenta—; el equipo es quien está en la
// oficina.
const AREAS: AreaNav[] = [
  {
    // Sin rótulo: lo primero del menú es "qué tengo que hacer hoy", y eso no
    // necesita que nadie le ponga nombre.
    titulo: "",
    items: [
      { key: "escritorio", label: "Centro de coordinación", icon: IconHome },
      // La bandeja va pegada al escritorio: son la misma pregunta, una
      // resumida y la otra completa.
      { key: "bandeja", label: "Bandeja de trabajo", icon: IconList },
    ],
  },
  {
    // El trabajo del día, en el orden en que ocurre: llega una petición, se
    // pone en el calendario, se comprueba lo que se hizo y, si algo se
    // tuerce, se abre una incidencia. Antes estaba repartido entre
    // "Operaciones" y "Seguimiento", que obligaba a saber en cuál de los dos
    // vivía cada cosa.
    titulo: "El día",
    items: [
      { key: "solicitudes", label: "Solicitudes", icon: IconClipboard },
      { key: "calendario", label: "Calendario", icon: IconCalendar },
      { key: "verificacion", label: "Verificación", icon: IconCheckCircle },
      { key: "incidencias", label: "Incidencias", icon: IconAlert },
    ],
  },
  {
    // Quién recibe el cuidado y quién lo presta, juntos: en una empresa de
    // ayuda a domicilio son las dos caras del mismo encaje, y cubrir un
    // servicio se mira saltando de una lista a la otra.
    titulo: "Personas",
    items: [
      { key: "personas", label: "Personas atendidas", icon: IconUsers },
      { key: "profesionales", label: "Profesionales", icon: IconBriefcase },
      { key: "personal", label: "Expedientes y jornada", icon: IconIdCard },
      { key: "cobertura", label: "Cobertura", icon: IconShield },
    ],
  },
  {
    // Lo que entra, lo que sale y las horas de las que salen los dos números.
    titulo: "Dinero",
    items: [
      { key: "facturacion", label: "Cobros y pagos", icon: IconReceipt },
      { key: "analisis", label: "Horas y economía", icon: IconChart },
    ],
  },
  {
    // Lo que se configura una vez y se toca de tarde en tarde: va plegado,
    // para que el menú del día quepa de un vistazo.
    titulo: "Configuración",
    plegable: true,
    items: [
      // La empresa va primero: es lo que hay que tener puesto antes de poder
      // facturar nada.
      { key: "empresa", label: "Mi empresa", icon: IconBuilding },
      { key: "equipo", label: "Equipo", icon: IconUsersGroup },
      { key: "empresas", label: "Empresas colaboradoras", icon: IconBuilding },
      { key: "servicios", label: "Catálogo de servicios", icon: IconTag },
      { key: "reglas", label: "Reglas de negocio", icon: IconSettings },
      { key: "proteccion", label: "Protección de datos", icon: IconShield },
      { key: "actividad", label: "Actividad", icon: IconActivity },
    ],
  },
];

// Para el título de la página en móvil y para el buscador: la lista plana
// sigue haciendo falta aunque la navegación esté agrupada.
const NAV = AREAS.flatMap((a) => a.items) as { key: Tab; label: string; icon: typeof IconHome }[];

// El filtro de la lista usa el mismo vocabulario que los badges y las
// casillas de conteo (estadoUnificado.ts): una fase de trabajo, o bien el
// corte transversal "tiene una incidencia abierta".
type Filtro = null | ClaveEstado | "con_incidencia";

// De cuándo a cuándo va una solicitud. Un servicio sin fecha de fin es
// indefinido y se dice así, no con una fecha inventada.
function periodoDe(s: Solicitud): string {
  if (!s.plan) return "Sin fijar";
  const desde = new Date(s.plan.fechaInicio).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  if (!s.plan.fechaFin) return `Desde ${desde} · indefinido`;
  const hasta = new Date(s.plan.fechaFin).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return desde === hasta ? desde : `${desde} – ${hasta}`;
}

export function CoordinadorPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("escritorio");
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  // La hamburguesa está en la cabecera y abre este cajón.
  useRegistrarMenuMovil(() => setMenuMovilAbierto(true));
  const [filtro, setFiltro] = useState<Filtro>(null);
  // Lo que hay que abrir nada más aterrizar en la pestaña de destino: la
  // jornada concreta, el expediente concreto. Sin esto, "Decidir" dejaba a la
  // coordinadora buscando a ojo la fila que venía a resolver.
  const [foco, setFoco] = useState<string | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [profesionalFiltro, setProfesionalFiltro] = useState("");
  const [busquedaSolicitudes, setBusquedaSolicitudes] = useState("");
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
  const [riesgos, setRiesgos] = useState<RiesgosCobertura | null>(null);

  async function cargar() {
    const [sols, servs, incs, pers, necs, pros, ries] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Servicio[]>("/servicios", token),
      api.get<Incidencia[]>("/incidencias", token),
      api.get<Persona[]>("/personas", token),
      api.get<Necesidad[]>("/necesidades", token),
      api.get<Profesional[]>("/profesionales", token),
      // El repaso de las jornadas que vienen: alimenta a la vez la cifra del
      // menú y la lista de Cobertura, para que no digan cosas distintas.
      api.get<RiesgosCobertura>("/cobertura/riesgos?dias=14", token).catch(() => null),
    ]);
    setSolicitudes(sols);
    setServicios(servs);
    setIncidencias(incs);
    setPersonas(pers);
    setNecesidades(necs);
    setProfesionales(pros);
    setRiesgos(ries);
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
    // Lo mismo con ?incidencia=<id>: un aviso de incidencia también tiene que
    // abrir su ficha, no dejarte en el listado buscándola.
    const incidenciaId = searchParams.get("incidencia");
    if (incidenciaId) {
      setTab("incidencias");
      setIncidenciaFichaAbierta(incidenciaId);
    }
  }, [searchParams]);

  function cerrarFicha() {
    setFichaAbierta(null);
    if (searchParams.get("solicitud")) {
      searchParams.delete("solicitud");
      setSearchParams(searchParams, { replace: true });
    }
  }

  function cerrarIncidencia() {
    setIncidenciaFichaAbierta(null);
    if (searchParams.get("incidencia")) {
      searchParams.delete("incidencia");
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

  function irA(t: string, f?: string, fo?: string) {
    setTab(t as Tab);
    setFiltro((f ?? null) as Filtro);
    setFoco(fo ?? null);
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

  const conteoEstados = useMemo(() => {
    const conteo = { nueva: 0, buscando: 0, por_confirmar: 0, en_curso: 0, por_verificar: 0, finalizada: 0, cancelada: 0 } as Record<ClaveEstado, number>;
    for (const s of solicitudes) conteo[estadoDeSolicitud(s)]++;
    return conteo;
  }, [solicitudes]);

  const conIncidenciaCount = useMemo(() => solicitudes.filter(tieneIncidencia).length, [solicitudes]);

  const badges: Partial<Record<Tab, { valor: number; tono: "rose" | "amber" }>> = {
    incidencias: { valor: incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado)).length, tono: "rose" },
    // Lo que espera a coordinación en Solicitudes: lo nuevo sin revisar más
    // lo terminado sin verificar.
    solicitudes: { valor: conteoEstados.nueva + conteoEstados.por_verificar, tono: "amber" },
    // Jornadas que, tal como están, no se van a poder prestar. Va en rojo
    // porque cada una es una persona que se queda esperando en su casa.
    cobertura: { valor: riesgos?.bloquean ?? 0, tono: "rose" },
  };

  const solicitudesFiltradas = useMemo(() => {
    const q = busquedaSolicitudes.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (filtro === "con_incidencia" && !tieneIncidencia(s)) return false;
      if (filtro && filtro !== "con_incidencia" && estadoDeSolicitud(s) !== filtro) return false;
      
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
  }, [solicitudes, filtro, tipoFiltro, profesionalFiltro, busquedaSolicitudes]);

  const ordenSolicitudes = useOrdenacion(solicitudesFiltradas, {
    codigo: (s) => s.codigo,
    // Se ordena por cuándo se presta, no por cuándo se escribió.
    fecha: (s) => s.plan?.fechaInicio ?? s.createdAt,
    duracion: (s) => minutosEntre(s.plan?.horaInicio, s.plan?.horaFin) ?? -1,
    persona: (s) => `${s.persona.apellidos} ${s.persona.nombre}`,
    servicio: (s) => s.necesidad.nombre,
    estado: (s) => estadoDeSolicitud(s),
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
        { encabezado: "Desde", valor: (s) => (s.plan ? new Date(s.plan.fechaInicio).toLocaleDateString("es-ES") : "") },
        { encabezado: "Hasta", valor: (s) => (s.plan?.fechaFin ? new Date(s.plan.fechaFin).toLocaleDateString("es-ES") : "indefinido") },
        { encabezado: "Horario", valor: (s) => (s.plan?.horaInicio ? `${s.plan.horaInicio}-${s.plan.horaFin}` : "") },
        { encabezado: "Duración", valor: (s) => { const m = minutosEntre(s.plan?.horaInicio, s.plan?.horaFin); return m == null ? "" : duracion(m); } },
      ],
      "solicitudes",
    );
  }


  const tituloTab = NAV.find((n) => n.key === tab)?.label ?? "";

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <Navegacion
        areas={AREAS}
        activo={tab}
        onIr={irA}
        badges={badges}
        abierto={menuMovilAbierto}
        onCerrar={() => setMenuMovilAbierto(false)}
        acciones={
          // Lo que se crea, arriba del menú y siempre a la vista: dar de alta
          // una solicitud es lo que más veces se hace en el día.
          <div className="space-y-1.5">
            <button
              onClick={() => {
                setMenuMovilAbierto(false);
                void abrirNuevaSolicitud();
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              <IconPlus className="h-4 w-4" /> Nueva solicitud
            </button>
            <button
              onClick={() => {
                setMenuMovilAbierto(false);
                setNuevoUsuario(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <IconPlus className="h-4 w-4" /> Nuevo usuario
            </button>
          </div>
        }
        cabecera={
          <GlobalSearch
            personas={personas}
            solicitudes={solicitudes}
            onAbrirPersona={abrirPersona}
            onAbrirSolicitud={(id) => {
              setTab("solicitudes");
              setFichaAbierta(id);
            }}
          />
        }
      />

      {/* En móvil sólo queda el buscador: el botón de menú vive ahora en la
          cabecera, que es donde la mano lo busca y donde no se va al
          desplazar la página. */}
      <div className="flex items-center gap-2 md:hidden">
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

      {/* Contenido principal */}
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{tab === "escritorio" ? "" : tituloTab}</h2>
          </div>
        </div>

        {tab === "escritorio" && (
          <ResumenTab
            solicitudes={solicitudes}
            servicios={servicios}
            incidencias={incidencias}
            onIrA={irA}
            onAbrirPersona={abrirPersona}
            onAbrirSolicitud={(id) => {
              setTab("solicitudes");
              setFichaAbierta(id);
            }}
            onAbrirIncidencia={setIncidenciaFichaAbierta}
            onCambiado={cargar}
          />
        )}

        {tab === "solicitudes" && (
          <div>
            {/* Las casillas son a la vez el resumen, la leyenda y el filtro:
                mismo nombre y mismo color que el badge de cada fila, así no
                hay dos vocabularios que aprender (sección "simplifica
                estados de solicitudes, que sea más práctico y visual"). */}
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              <button
                onClick={() => setFiltro(null)}
                className={`rounded-lg border px-2.5 py-2 text-left transition ${!filtro ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <p className={`text-xl font-semibold leading-tight ${!filtro ? "text-brand-800" : "text-slate-800"}`}>{solicitudes.length}</p>
                <p className={`text-[11px] font-medium ${!filtro ? "text-brand-800" : "text-slate-500"}`}>Todas</p>
              </button>
              {ESTADOS.map((e) => {
                const activo = filtro === e.clave;
                const valor = conteoEstados[e.clave];
                return (
                  <button
                    key={e.clave}
                    onClick={() => setFiltro(activo ? null : e.clave)}
                    title={e.ayuda}
                    className={`rounded-lg border px-2.5 py-2 text-left transition ${
                      activo ? `${e.borde} ${e.fondo}` : valor === 0 ? "border-slate-200 bg-white opacity-60 hover:opacity-100" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className={`text-xl font-semibold leading-tight ${activo ? e.texto : "text-slate-800"}`}>{valor}</p>
                    {/* Icono además del punto de color: en la casilla el
                        color era lo único que distinguía una fase de otra. */}
                    <p className={`flex items-center gap-1 text-[11px] font-medium ${activo ? e.texto : "text-slate-500"}`}>
                      <e.Icono className={`h-3 w-3 shrink-0 ${activo ? e.texto : "text-slate-400"}`} aria-hidden /> {e.etiqueta}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* La incidencia no es una fase: se cruza con cualquiera de
                ellas, así que va aparte de la rejilla, como un corte extra
                sobre la misma lista. Y junto a ella, qué toca hacer en la
                fase que se está mirando: el filtro deja de ser solo un
                recorte y pasa a decir para qué sirve. */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={() => setFiltro(filtro === "con_incidencia" ? null : "con_incidencia")}
                title="Solicitudes con una incidencia abierta, estén en la fase que estén"
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  filtro === "con_incidencia"
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : conIncidenciaCount === 0
                      ? "border-slate-200 text-slate-400 hover:bg-slate-50"
                      : "border-rose-200 text-rose-600 hover:bg-rose-50"
                }`}
              >
                <IconAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                Con incidencia ({conIncidenciaCount})
              </button>
              {filtro && filtro !== "con_incidencia" && <span className="text-xs text-slate-500">{infoEstado(filtro).ayuda}.</span>}
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
                  tipoFiltro || profesionalFiltro ? "border-brand bg-brand-50 text-brand-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <IconSettings className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                Filtros avanzados{[tipoFiltro, profesionalFiltro].filter(Boolean).length > 0 && ` (${[tipoFiltro, profesionalFiltro].filter(Boolean).length})`}
              </button>
              {(filtro || tipoFiltro || profesionalFiltro || busquedaSolicitudes) && (
                <button
                  onClick={() => {
                    setFiltro(null);
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

            {/* El estado ya se filtra con las casillas de arriba: aquí solo
                lo que no cabe ahí, para no reintroducir el desplegable con
                los quince estados internos. */}
            {filtrosAbiertos && (
              <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2">
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
                        Cuándo
                      </ThOrdenable>
                      <ThOrdenable campo="duracion" campoActivo={ordenSolicitudes.campo} direccion={ordenSolicitudes.direccion} onOrdenar={ordenSolicitudes.ordenarPor}>
                        Duración
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
                              <IconInfinity className="mr-0.5 inline h-3 w-3 align-text-bottom" />
                              Indefinido
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <EstadoUnificadoBadge clave={estadoDeSolicitud(s)} />
                            {tieneIncidencia(s) && (
                              <IconAlert className="h-3.5 w-3.5 text-amber-600" aria-label="Incidencia abierta" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {s.servicio?.profesional ? `${s.servicio.profesional.nombre} ${s.servicio.profesional.apellidos}` : "—"}
                        </td>
                        {/* Lo que importa de una solicitud no es cuándo se
                            escribió, sino de cuándo a cuándo va y cuánto
                            dura: el ERP se mide en tiempo. */}
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{periodoDe(s)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                          {(() => {
                            const m = minutosEntre(s.plan?.horaInicio, s.plan?.horaFin);
                            if (m == null) return <span className="text-slate-300">—</span>;
                            return (
                              <>
                                {duracion(m)}
                                {s.plan?.recurrencia && <span className="block text-[10px] text-slate-400">{s.plan.recurrencia}</span>}
                              </>
                            );
                          })()}
                        </td>
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

        {tab === "verificacion" && (
          <VerificacionTab
            solicitudes={solicitudes}
            servicios={servicios}
            focoVisitaId={foco}
            onFocoConsumido={() => setFoco(null)}
            onAbrirSolicitud={(id) => setFichaAbierta(id)}
            onCambiado={cargar}
          />
        )}

        {tab === "servicios" && <ServiciosTab />}

        {tab === "incidencias" && (
          <IncidenciasTab
            incidencias={incidencias}
            servicios={servicios}
            onAbrirFicha={setIncidenciaFichaAbierta}
            onConfirmarCancelacion={confirmarCancelacion}
            onRechazarCancelacion={rechazarCancelacion}
            onCambiado={cargar}
          />
        )}

        {tab === "personas" && <PersonasTab onAbrirFicha={abrirPersona} refreshKey={personasRefreshKey} />}
        {tab === "profesionales" && <ProfesionalesTab />}
        {tab === "personal" && <PersonalTab focoProfesionalId={foco} onFocoConsumido={() => setFoco(null)} />}
        {tab === "cobertura" && (
          <CoberturaTab
            solicitudes={solicitudes}
            servicios={servicios}
            onAbrirSolicitud={(id) => setFichaAbierta(id)}
            onAbrirIncidencia={(id) => setIncidenciaFichaAbierta(id)}
            riesgos={riesgos}
          />
        )}
        {tab === "equipo" && <EquipoTab />}
        {tab === "reglas" && <ReglasTab />}
        {tab === "proteccion" && <ProteccionDatosTab />}
        {tab === "empresa" && <EmpresaTab />}
        {tab === "analisis" && <AnalisisTab />}
        {tab === "bandeja" && (
          <BandejaTab
            solicitudes={solicitudes}
            servicios={servicios}
            incidencias={incidencias}
            onIrA={irA}
            onAbrirPersona={abrirPersona}
            onAbrirSolicitud={(id) => {
              setTab("solicitudes");
              setFichaAbierta(id);
            }}
            onAbrirIncidencia={setIncidenciaFichaAbierta}
          />
        )}
        {tab === "empresas" && <EmpresasTab />}
        {tab === "calendario" && <CalendarioTab onAbrirSolicitud={(id) => setFichaAbierta(id)} />}
        {tab === "facturacion" && <FacturacionTab focoFacturaId={foco} onFocoConsumido={() => setFoco(null)} />}
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
          <IncidenciaFichaModal
            incidenciaId={incidenciaFichaAbierta}
            onClose={cerrarIncidencia}
            onChanged={cargar}
            // Desde la incidencia se salta a su solicitud sin pasar por el
            // listado: son el mismo caso visto desde dos sitios.
            onAbrirSolicitud={(id) => {
              setIncidenciaFichaAbierta(null);
              setTab("solicitudes");
              setFichaAbierta(id);
            }}
          />
        )}
      </div>
    </div>
  );
}
