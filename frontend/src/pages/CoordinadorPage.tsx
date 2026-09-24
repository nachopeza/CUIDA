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
  IconArrowDown,
  IconArrowUp,
  IconBriefcase,
  IconCalendar,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconEuro,
  IconFamily,
  IconFile,
  IconHome,
  IconKey,
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
  IconWalk,
  IconX,
} from "../components/icons.js";
import { ResumenTab } from "./coordinador/ResumenTab.js";
import { GlobalSearch } from "./coordinador/GlobalSearch.js";
import { createPortal } from "react-dom";
import { Navegacion, type AreaNav, type BadgeNav, type ItemNav } from "../components/Navegacion.js";
import { Panel } from "../components/Layout.js";
import { RANURA_BUSCADOR, useRanura } from "../lib/ranuras.js";
import { duracion, minutosEntre } from "../lib/economia.js";
import { PersonasTab } from "./coordinador/PersonasTab.js";
import { NuevoUsuarioModal } from "./coordinador/NuevoUsuarioModal.js";
import { PersonaDetalleModal } from "./coordinador/PersonaDetalleModal.js";
import { ProfesionalesTab } from "./coordinador/ProfesionalesTab.js";
import { CalendarioTab } from "./coordinador/CalendarioTab.js";
import { ActividadTab } from "./coordinador/ActividadTab.js";
import { FacturacionTab } from "./coordinador/FacturacionTab.js";
import { VerificacionTab } from "./coordinador/VerificacionTab.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import { SolicitudFichaModal } from "../components/SolicitudFichaModal.js";
import { IncidenciaFichaModal } from "./coordinador/IncidenciaFichaModal.js";
import { IncidenciasTab } from "./coordinador/IncidenciasTab.js";
import { AnalisisTab } from "./coordinador/AnalisisTab.js";
import { BandejaTab } from "./coordinador/BandejaTab.js";
import { PersonalTab } from "./coordinador/PersonalTab.js";
import { CoberturaTab } from "./coordinador/CoberturaTab.js";
import { ContactosTab } from "./coordinador/ContactosTab.js";
import { DisponibilidadTab } from "./coordinador/DisponibilidadTab.js";
import { PermisosTab } from "./coordinador/PermisosTab.js";
import { ConfiguracionTab } from "./coordinador/ConfiguracionTab.js";
import { EquipoTab } from "./coordinador/EquipoTab.js";
import type { EmpresaColaboradora, Incidencia, Necesidad, Persona, Profesional, RiesgosCobertura, Servicio, Solicitud } from "../lib/types.js";

type Tab =
  | "escritorio"
  // Operación
  | "solicitudes"
  | "servicios"
  | "visitas"
  | "calendario"
  // Personas
  | "personas"
  | "contactos"
  // Profesionales
  | "profesionales"
  | "disponibilidad"
  | "cobertura"
  // Seguimiento
  | "incidencias"
  | "verificacion"
  | "historial"
  // Finanzas
  | "cobros"
  | "pagos"
  | "facturacion"
  | "liquidaciones"
  // Análisis
  | "ind_indicadores"
  | "ind_servicios"
  | "ind_profesionales"
  | "ind_ingresos"
  // Administración
  | "usuarios"
  | "permisos"
  | "configuracion"
  // Dos destinos que no están en el menú porque no se entra a ellos desde el
  // menú: a la bandeja se llega desde el escritorio y al expediente de un
  // profesional, desde la fila que lo nombra.
  | "bandeja"
  | "personal";

// El menú es el de la maqueta, entrada por entrada: siete áreas y veintidós
// destinos. Lo que antes eran entradas sueltas se ha replegado dentro de
// ellos —el catálogo, las reglas, la empresa y los colaboradores viven en
// Configuración; el equipo interno, también— porque un menú se lee entero
// cada vez que se busca algo, y veintidós entradas agrupadas se leen mejor
// que veintidós entradas y siete más al final.
//
// Dos pares de entradas comparten pantalla a propósito, porque son la misma
// tabla mirada desde dos preguntas distintas: Visitas / Verificaciones, y
// Cobros / Facturación (igual que Pagos / Liquidaciones).
const AREAS: AreaNav[] = [
  {
    // Sin rótulo: lo primero del menú no necesita que le pongan nombre.
    titulo: "",
    items: [{ key: "escritorio", label: "Inicio", icon: IconHome }],
  },
  {
    titulo: "Operación",
    items: [
      { key: "solicitudes", label: "Solicitudes", icon: IconClipboard },
      { key: "servicios", label: "Servicios", icon: IconBriefcase },
      { key: "visitas", label: "Visitas", icon: IconWalk },
      { key: "calendario", label: "Calendario", icon: IconCalendar },
    ],
  },
  {
    titulo: "Personas",
    items: [
      { key: "personas", label: "Personas", icon: IconUsers },
      { key: "contactos", label: "Familiares / Contactos", icon: IconFamily },
    ],
  },
  {
    titulo: "Profesionales",
    items: [
      { key: "profesionales", label: "Profesionales", icon: IconUsersGroup },
      { key: "disponibilidad", label: "Disponibilidad", icon: IconClock },
      { key: "cobertura", label: "Cobertura", icon: IconShield },
    ],
  },
  {
    titulo: "Seguimiento",
    items: [
      { key: "incidencias", label: "Incidencias", icon: IconAlert },
      { key: "verificacion", label: "Verificaciones", icon: IconCheckCircle },
      { key: "historial", label: "Historial", icon: IconActivity },
    ],
  },
  {
    titulo: "Finanzas",
    items: [
      { key: "cobros", label: "Cobros", icon: IconArrowDown },
      { key: "pagos", label: "Pagos", icon: IconArrowUp },
      { key: "facturacion", label: "Facturación", icon: IconFile },
      { key: "liquidaciones", label: "Liquidaciones", icon: IconReceipt },
    ],
  },
  {
    titulo: "Análisis",
    items: [
      { key: "ind_indicadores", label: "Indicadores", icon: IconChart },
      { key: "ind_servicios", label: "Servicios", icon: IconTag },
      { key: "ind_profesionales", label: "Profesionales", icon: IconUsers },
      { key: "ind_ingresos", label: "Ingresos", icon: IconEuro },
    ],
  },
  {
    titulo: "Administración",
    items: [
      { key: "usuarios", label: "Usuarios", icon: IconIdCard },
      { key: "permisos", label: "Permisos", icon: IconKey },
      { key: "configuracion", label: "Configuración", icon: IconSettings },
    ],
  },
];

// El título de cada pantalla. No siempre es la etiqueta del menú: "Servicios"
// aparece dos veces —en Operación y en Análisis— y a media pantalla hay que
// saber en cuál de las dos estás.
const TITULOS: Record<Tab, string> = {
  escritorio: "Inicio",
  solicitudes: "Solicitudes",
  servicios: "Servicios",
  visitas: "Visitas",
  calendario: "Calendario",
  personas: "Personas atendidas",
  contactos: "Familiares y contactos",
  profesionales: "Profesionales",
  disponibilidad: "Disponibilidad",
  cobertura: "Cobertura",
  incidencias: "Incidencias",
  verificacion: "Verificaciones",
  historial: "Historial",
  cobros: "Cobros",
  pagos: "Pagos",
  facturacion: "Facturación",
  liquidaciones: "Liquidaciones",
  ind_indicadores: "Análisis · Indicadores",
  ind_servicios: "Análisis · Servicios",
  ind_profesionales: "Análisis · Profesionales",
  ind_ingresos: "Análisis · Ingresos",
  usuarios: "Usuarios",
  permisos: "Permisos",
  configuracion: "Configuración",
  bandeja: "Bandeja de trabajo",
  personal: "Expediente del profesional",
};

// Lo que va en la barra de abajo del móvil: las cuatro cosas que se tocan
// todos los días. El resto sigue estando en el cajón, a un toque de "Menú".
const PESTANAS_MOVIL: ItemNav[] = [
  { key: "escritorio", label: "Inicio", icon: IconHome },
  { key: "calendario", label: "Agenda", icon: IconCalendar },
  { key: "personas", label: "Personas", icon: IconUsers },
  { key: "profesionales", label: "Pros", icon: IconUsersGroup },
];

// El filtro de la lista usa el mismo vocabulario que los badges y las
// casillas de conteo (estadoUnificado.ts): una fase de trabajo, o bien el
// corte transversal "tiene una incidencia abierta".
type Filtro = null | ClaveEstado | "con_incidencia";

// Qué fases entran en cada una de las dos entradas de Operación. No son dos
// tablas distintas: es la misma cadena partida por donde de verdad cambia el
// trabajo. Antes de que haya alguien confirmado, lo que se hace es gestionar
// una petición; a partir de ahí, lo que se hace es vigilar un servicio en
// marcha.
const AMBITO: Record<"solicitudes" | "servicios", ClaveEstado[]> = {
  solicitudes: ["nueva", "buscando", "por_confirmar", "cancelada"],
  servicios: ["en_curso", "por_verificar", "finalizada"],
};

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
  // Sólo para las dos cifras de Finanzas del menú: cuántas facturas quedan
  // por cobrar y cuántas liquidaciones por pagar.
  const [cobrosPendientes, setCobrosPendientes] = useState(0);
  const [pagosPendientes, setPagosPendientes] = useState(0);
  const ranuraBuscador = useRanura(RANURA_BUSCADOR);

  async function cargar() {
    const [sols, servs, incs, pers, necs, pros, ries, facs, liqs] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Servicio[]>("/servicios", token),
      api.get<Incidencia[]>("/incidencias", token),
      api.get<Persona[]>("/personas", token),
      api.get<Necesidad[]>("/necesidades", token),
      api.get<Profesional[]>("/profesionales", token),
      // El repaso de las jornadas que vienen: alimenta a la vez la cifra del
      // menú y la lista de Cobertura, para que no digan cosas distintas.
      api.get<RiesgosCobertura>("/cobertura/riesgos?dias=14", token).catch(() => null),
      api.get<{ estado: string }[]>("/facturas", token).catch(() => []),
      api.get<{ estado: string }[]>("/liquidaciones", token).catch(() => []),
    ]);
    setSolicitudes(sols);
    setServicios(servs);
    setIncidencias(incs);
    setPersonas(pers);
    setNecesidades(necs);
    setProfesionales(pros);
    setRiesgos(ries);
    setCobrosPendientes(facs.filter((f) => ["EMITIDA", "IMPAGADA"].includes(f.estado)).length);
    setPagosPendientes(liqs.filter((l) => l.estado !== "PAGADA").length);
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

  // Las tres cifras del menú que no salen del listado de solicitudes: las
  // jornadas de hoy y lo que queda por cobrar y por pagar.
  const visitasDeHoy = useMemo(() => {
    const hoy = new Date();
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    return servicios.reduce((total, s) => total + (s.visitas ?? []).filter((v) => v.fecha.slice(0, 10) === iso).length, 0);
  }, [servicios]);

  const conteoEstados = useMemo(() => {
    const conteo = { nueva: 0, buscando: 0, por_confirmar: 0, en_curso: 0, por_verificar: 0, finalizada: 0, cancelada: 0 } as Record<ClaveEstado, number>;
    for (const s of solicitudes) conteo[estadoDeSolicitud(s)]++;
    return conteo;
  }, [solicitudes]);


  // Las cifras del menú. Cada una dice cuántas cosas hay ahí dentro
  // esperando, no cuántas filas tiene la tabla: un número que no cambia
  // nunca deja de leerse a la semana de estar puesto.
  //
  // El tono ámbar es para lo que ya va tarde; el verde, para lo que
  // simplemente está ahí.
  const badges: Partial<Record<Tab, BadgeNav>> = {
    // Peticiones sin resolver: lo nuevo sin revisar y lo que busca
    // profesional o espera que lo confirmen.
    solicitudes: { valor: conteoEstados.nueva + conteoEstados.buscando + conteoEstados.por_confirmar, tono: "amber" },
    // Servicios vivos.
    servicios: { valor: conteoEstados.en_curso, tono: "verde" },
    // Jornadas de hoy.
    visitas: { valor: visitasDeHoy, tono: "verde" },
    personas: { valor: personas.length, tono: "verde" },
    profesionales: { valor: profesionales.filter((p) => p.estado === "ACTIVO").length, tono: "verde" },
    // Jornadas que, tal como están, no se van a poder prestar. En rojo
    // porque cada una es una persona que se queda esperando en su casa.
    cobertura: { valor: riesgos?.bloquean ?? 0, tono: "rose" },
    incidencias: { valor: incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado)).length, tono: "amber" },
    verificacion: { valor: conteoEstados.por_verificar, tono: "verde" },
    cobros: { valor: cobrosPendientes, tono: "amber" },
    pagos: { valor: pagosPendientes, tono: "verde" },
  };

  // Sólo las fases del ámbito que se está mirando. La cadena es una, pero
  // "Solicitudes" y "Servicios" miran dos tramos distintos de ella.
  const ambito: "solicitudes" | "servicios" = tab === "servicios" ? "servicios" : "solicitudes";
  const delAmbito = useMemo(
    () => solicitudes.filter((s) => AMBITO[ambito].includes(estadoDeSolicitud(s))),
    [solicitudes, ambito],
  );
  const estadosDelAmbito = useMemo(() => ESTADOS.filter((e) => AMBITO[ambito].includes(e.clave)), [ambito]);
  const conIncidenciaCount = useMemo(() => delAmbito.filter(tieneIncidencia).length, [delAmbito]);

  const solicitudesFiltradas = useMemo(() => {
    const q = busquedaSolicitudes.trim().toLowerCase();
    return delAmbito.filter((s) => {
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
  }, [delAmbito, filtro, tipoFiltro, profesionalFiltro, busquedaSolicitudes]);

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


  const tituloTab = TITULOS[tab] ?? "";

  // El buscador se pinta en la ranura de la cabecera: quien sabe qué hay que
  // buscar es este panel, pero dónde se busca lo dice la cabecera.
  const buscador = (
    <GlobalSearch
      personas={personas}
      solicitudes={solicitudes}
      onAbrirPersona={abrirPersona}
      onAbrirSolicitud={(id) => {
        setTab("solicitudes");
        setFichaAbierta(id);
      }}
    />
  );

  return (
    <Panel
      nav={
      <Navegacion
        areas={AREAS}
        activo={tab}
        onIr={irA}
        badges={badges}
        pestanasMovil={PESTANAS_MOVIL}
        abierto={menuMovilAbierto}
        onAbrir={() => setMenuMovilAbierto(true)}
        onCerrar={() => setMenuMovilAbierto(false)}
        cabecera={buscador}
      />
      }
    >
      {/* En escritorio el buscador va en la cabecera de la aplicación. */}
      {ranuraBuscador && createPortal(buscador, ranuraBuscador)}

      <div className="min-w-0 flex-1">
        {/* El título de la sección. El escritorio no lo lleva: su tarjeta de
            saludo ya dice dónde estás. */}
        {/* El título de la sección y, a su derecha, lo que se crea desde
            aquí. Los dos botones estaban en la barra lateral: en la maqueta
            la barra es sólo menú, y además "Nueva solicitud" pertenece a la
            pantalla de solicitudes igual que "Nuevo usuario" pertenece a la
            de personas. El escritorio no lleva título: su tarjeta de saludo
            ya dice dónde estás. */}
        {tab !== "escritorio" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-800">{tituloTab}</h2>
            {(tab === "solicitudes" || tab === "servicios") && (
              <button onClick={() => void abrirNuevaSolicitud()} className="boton-verde px-4 py-2 text-xs">
                <IconPlus className="h-4 w-4" /> Nueva solicitud
              </button>
            )}
            {(tab === "personas" || tab === "contactos") && (
              <button onClick={() => setNuevoUsuario(true)} className="boton-verde px-4 py-2 text-xs">
                <IconPlus className="h-4 w-4" /> Nuevo usuario
              </button>
            )}
          </div>
        )}

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

        {(tab === "solicitudes" || tab === "servicios") && (
          <div>
            {/* Las casillas son a la vez el resumen, la leyenda y el filtro:
                mismo nombre y mismo color que el badge de cada fila, así no
                hay dos vocabularios que aprender (sección "simplifica
                estados de solicitudes, que sea más práctico y visual"). */}
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              <button
                onClick={() => setFiltro(null)}
                className={`rounded-lg border px-2.5 py-2 text-left transition ${!filtro ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <p className={`text-xl font-semibold leading-tight ${!filtro ? "text-brand-800" : "text-slate-800"}`}>{delAmbito.length}</p>
                <p className={`text-[11px] font-medium ${!filtro ? "text-brand-800" : "text-slate-500"}`}>Todas</p>
              </button>
              {estadosDelAmbito.map((e) => {
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
                <div className="overflow-x-auto tarjeta">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-[#f1f7fa] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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

        {(tab === "verificacion" || tab === "visitas") && (
          <VerificacionTab
            solicitudes={solicitudes}
            servicios={servicios}
            focoVisitaId={foco}
            onFocoConsumido={() => setFoco(null)}
            onAbrirSolicitud={(id) => setFichaAbierta(id)}
            onCambiado={cargar}
            pestanaInicial={tab === "visitas" ? "todas" : "pendientes"}
          />
        )}

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
        {tab === "contactos" && <ContactosTab onAbrirPersona={abrirPersona} />}
        {tab === "profesionales" && <ProfesionalesTab />}
        {tab === "disponibilidad" && <DisponibilidadTab />}
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
        {tab === "usuarios" && <EquipoTab />}
        {tab === "permisos" && <PermisosTab />}
        {tab === "configuracion" && <ConfiguracionTab />}

        {/* Las cuatro entradas de Análisis: los mismos datos, cada entrada
            con lo que contesta su pregunta. */}
        {tab === "ind_indicadores" && <AnalisisTab seccion="indicadores" />}
        {tab === "ind_servicios" && <AnalisisTab seccion="servicios" />}
        {tab === "ind_profesionales" && <AnalisisTab seccion="profesionales" />}
        {tab === "ind_ingresos" && <AnalisisTab seccion="ingresos" />}
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
        {tab === "calendario" && <CalendarioTab onAbrirSolicitud={(id) => setFichaAbierta(id)} />}

        {/* Las cuatro entradas de Finanzas: dos listas, enteras o sólo por
            lo que queda pendiente. */}
        {(tab === "facturacion" || tab === "cobros" || tab === "liquidaciones" || tab === "pagos") && (
          <FacturacionTab focoFacturaId={foco} onFocoConsumido={() => setFoco(null)} vista={tab} onIrA={irA} />
        )}

        {tab === "historial" && <ActividadTab />}

        {nuevaSolicitud && (
          <SolicitudModal
            personas={personas}
            necesidades={necesidades}
            onClose={() => setNuevaSolicitud(false)}
            onCreated={async (id) => {
              await cargar();
              // Y se abre su ficha: el alta deja la solicitud sin horas ni
              // precio a propósito —eso se decide mirando la agenda—, así que
              // lo siguiente siempre es abrirla. Hacerlo a mano obligaba a
              // buscar en el listado la fila que se acababa de crear.
              if (id) setFichaAbierta(id);
            }}
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
    </Panel>
  );
}
