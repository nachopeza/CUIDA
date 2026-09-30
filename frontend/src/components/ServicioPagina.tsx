import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { useRefrescoAutomatico } from "../lib/refresco.js";
import { diaDe } from "../lib/fechas.js";
import { diasPorSemana } from "../lib/recurrencia.js";
import { exportarCSV } from "../lib/csv.js";
import { duracion, euros, horaDe, minutosEntre, minutosFichados } from "../lib/economia.js";
import { estadoDeSolicitud, infoEstado, tieneIncidencia } from "../lib/estadoUnificado.js";
import { MOTIVOS_INCIDENCIA, infoMotivo, type MotivoIncidencia } from "../lib/incidencias.js";
import { IconoNecesidad } from "../lib/necesidadIconos.js";
import type { EstadoHistorialEntry, Solicitud, Visita } from "../lib/types.js";
import { Avatar } from "./Avatar.js";
import { EstadoBadge } from "./EstadoBadge.js";
import { Modal } from "./Modal.js";
import { ChatPanel } from "./ChatPanel.js";
import { CierreServicioModal, motivoNoPuede, type ModoCierre } from "./CierreServicioModal.js";
import { DesgloseVisitaModal } from "./DesgloseVisitaModal.js";
import { ProximasJornadas } from "./ProximasJornadas.js";
import { PerfilProfesionalModal } from "./PerfilProfesionalModal.js";
import { ResolverJornadaModal } from "./ResolverJornadaModal.js";
import { SolicitudFichaModal } from "./SolicitudFichaModal.js";
import { TiempoTrabajadoModal } from "./TiempoTrabajadoModal.js";
import { PersonaDetalleModal } from "../pages/coordinador/PersonaDetalleModal.js";
import { IncidenciaFichaModal } from "../pages/coordinador/IncidenciaFichaModal.js";
import {
  IconAlert,
  IconArrowLeft,
  IconCalendar,
  IconCheck,
  IconChat,
  IconClock,
  IconDownload,
  IconEuro,
  IconFile,
  IconPencil,
  IconPhone,
  IconPin,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsers,
} from "./icons.js";

// ---------------------------------------------------------------------------
// La página de un servicio
//
// Antes un servicio se abría en una ventana emergente pensada para editarlo, y
// desde ahí no se veía de un vistazo cómo iba: quién es la persona, quién lo
// hace, en qué punto está, qué se ha fichado, qué falta por cobrar y por pagar.
// Esta página es la lectura: todo lo que hace falta para decidir, y las acciones
// que cambian su estado (terminar, cancelar, eliminar) donde se ven. La ventana
// de edición sigue existiendo y se abre con «Editar servicio».
// ---------------------------------------------------------------------------

type Pestana = "resumen" | "jornadas" | "fichaje" | "facturacion" | "historial" | "documentos";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "jornadas", etiqueta: "Jornadas" },
  { clave: "fichaje", etiqueta: "Registro de fichaje" },
  { clave: "facturacion", etiqueta: "Facturación" },
  { clave: "historial", etiqueta: "Historial" },
  { clave: "documentos", etiqueta: "Documentos" },
];

const ETAPAS = ["Revisión", "Buscando profesional", "Confirmado", "En curso", "Verificación", "Cerrado"];

interface JornadaEconomia {
  id: string;
  codigo: string;
  fecha: string;
  estado: string;
  importeCliente: number | null;
  importeProfesional: number | null;
  importeCuida: number | null;
  factura: { id: string; codigo: string; estado: string } | null;
  liquidacion: { id: string; codigo: string; estado: string } | null;
}

const TRABAJADAS = ["FINALIZADA", "INCIDENCIA", "REVISADA", "LIQUIDADA"];

function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function diaCorto(iso: string): string {
  const [a, m, d] = diaDe(iso).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

// En qué punto del recorrido está, con cancelado aparte: no es una etapa más
// sino una salida.
function etapaDe(s: Solicitud): number {
  const srv = s.servicio;
  if (!srv) return 0;
  switch (srv.estado) {
    case "PENDIENTE":
    case "ASIGNADO":
      return 1;
    case "CONFIRMADO":
      return 2;
    case "EN_CURSO":
      return 3;
    case "FINALIZADO":
    case "VALIDADO":
      return 4;
    case "CERRADO":
      return 5;
    default:
      return 0;
  }
}

function proximaJornada(visitas: Visita[]): Visita | null {
  return (
    visitas
      .filter((v) => ["PROGRAMADA", "CONFIRMADA", "EN_CURSO"].includes(v.estado))
      .sort((a, b) => `${diaDe(a.fecha)}${a.horaInicioProg ?? ""}`.localeCompare(`${diaDe(b.fecha)}${b.horaInicioProg ?? ""}`))[0] ?? null
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Etiqueta>{etiqueta}</Etiqueta>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export function ServicioPagina({
  solicitudId,
  onVolver,
  onChanged,
  etiquetaVolver = "Volver a servicios",
}: {
  solicitudId: string;
  onVolver: () => void;
  onChanged: () => void;
  etiquetaVolver?: string;
}) {
  const { token } = useAuth();
  const [s, setS] = useState<Solicitud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<EstadoHistorialEntry[]>([]);
  const [jornadas, setJornadas] = useState<JornadaEconomia[]>([]);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [verMas, setVerMas] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [personaAbierta, setPersonaAbierta] = useState(false);
  const [profesionalAbierto, setProfesionalAbierto] = useState(false);
  const [cierre, setCierre] = useState<ModoCierre | null>(null);
  const [incidenciaAbierta, setIncidenciaAbierta] = useState<string | null>(null);
  const [nuevaIncidencia, setNuevaIncidencia] = useState(false);
  const [mensajeAbierto, setMensajeAbierto] = useState(false);
  const [resolviendo, setResolviendo] = useState<Visita | null>(null);
  const [verificando, setVerificando] = useState<Visita | null>(null);
  const [desgloseDe, setDesgloseDe] = useState<string | null>(null);

  async function cargar() {
    try {
      const sol = await api.get<Solicitud>(`/solicitudes/${solicitudId}`, token);
      setS(sol);
      setError(null);
      if (sol.servicio) {
        const [srv, eco] = await Promise.all([
          api.get<{ estadoHistorial?: EstadoHistorialEntry[] }>(`/servicios/${sol.servicio.id}`, token).catch(() => null),
          api.get<{ jornadas: JornadaEconomia[] }>(`/servicios/${sol.servicio.id}/economia`, token).catch(() => null),
        ]);
        setHistorial([...(srv?.estadoHistorial ?? []), ...(sol.estadoHistorial ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        setJornadas(eco?.jornadas ?? []);
      } else {
        setHistorial(sol.estadoHistorial ?? []);
        setJornadas([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cargar el servicio");
    }
  }

  useEffect(() => {
    setS(null);
    setPestana("resumen");
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudId]);

  useRefrescoAutomatico(cargar, 30000);

  // Una solicitud que aún no tiene servicio se gestiona en la ventana de
  // edición: es donde se clasifica, se acepta y se lanza la búsqueda.
  useEffect(() => {
    if (s && !s.servicio) setEditando(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id]);

  const srv = s?.servicio ?? null;
  const visitas = useMemo(() => [...(srv?.visitas ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha)), [srv?.visitas]);

  async function recargarTodo() {
    await cargar();
    onChanged();
  }

  if (error && !s) {
    return (
      <div className="tarjeta p-6 text-sm text-slate-600">
        <button onClick={onVolver} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <IconArrowLeft className="h-4 w-4" /> {etiquetaVolver}
        </button>
        <p className="text-rose-600">{error}</p>
      </div>
    );
  }
  if (!s) return <p className="p-6 text-sm text-slate-400">Cargando…</p>;

  const pro = srv?.profesional ?? null;
  const cancelado = s.estado === "CANCELADA" || srv?.estado === "CANCELADO";
  const etapa = etapaDe(s);
  const proxima = proximaJornada(visitas);
  const recurrente = srv?.tipoServicio === "RECURRENTE";
  const diasSemana = recurrente ? diasPorSemana(s.plan?.recurrencia) : null;
  const clave = estadoDeSolicitud(s);
  const info = infoEstado(clave);
  const conIncidencia = tieneIncidencia(s);
  const incidencias = srv?.incidencias ?? [];
  const abiertas = incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado));

  const minutosPlan = minutosEntre(s.plan?.horaInicio, s.plan?.horaFin);
  const minutosJornada = srv?.minutosPrevistos ?? minutosPlan;
  const precioHora = srv?.precioHora != null ? Number(srv.precioHora) : null;
  const comision = srv?.comisionPorcentaje != null ? Number(srv.comisionPorcentaje) : null;

  // El mes en curso: lo que ya hay escrito y, si aún no hay nada, lo previsto.
  const mes = diaDe(new Date()).slice(0, 7);
  const delMes = visitas.filter((v) => diaDe(v.fecha).slice(0, 7) === mes && v.estado !== "CANCELADA");
  const jornadasPrevistasMes = delMes.length > 0 ? delMes.length : recurrente && diasSemana ? Math.round(diasSemana * 4.3) : srv ? 1 : 0;
  const totalEstimadoMes = precioHora != null && minutosJornada ? (precioHora * minutosJornada * jornadasPrevistasMes) / 60 : null;

  const sumaJ = (f: (j: JornadaEconomia) => number) => jornadas.reduce((a, j) => a + f(j), 0);
  const trabajada = (j: JornadaEconomia) => TRABAJADAS.includes(j.estado);
  const facturadoMes = jornadas.filter((j) => diaDe(j.fecha).slice(0, 7) === mes).reduce((a, j) => a + (j.importeCliente ?? 0), 0);
  const cobrado = sumaJ((j) => (trabajada(j) && j.factura?.estado === "PAGADA" ? (j.importeCliente ?? 0) : 0));
  const pendienteCobro = sumaJ((j) => (trabajada(j) && j.factura?.estado !== "PAGADA" ? (j.importeCliente ?? 0) : 0));
  const pagadoPro = sumaJ((j) => (trabajada(j) && j.liquidacion?.estado === "PAGADA" ? (j.importeProfesional ?? 0) : 0));
  const pendientePago = sumaJ((j) => (trabajada(j) && j.liquidacion?.estado !== "PAGADA" ? (j.importeProfesional ?? 0) : 0));

  const porVerificar = visitas.filter((v) => ["FINALIZADA", "INCIDENCIA"].includes(v.estado));
  const abierta = visitas.find((v) => v.estado === "EN_CURSO");
  // La jornada que toca fichar desde coordinación: la que está abierta o la
  // primera por delante que ya debería haber empezado.
  const hoy = diaDe(new Date());
  const paraFichar = abierta ?? visitas.find((v) => ["PROGRAMADA", "CONFIRMADA"].includes(v.estado) && diaDe(v.fecha) <= hoy) ?? null;

  const motivoCancelacion = [...historial].reverse().find((h) => h.estadoNuevo === "CANCELADO" || h.estadoNuevo === "CANCELADA");

  function mensajeDeEstado(): string {
    if (cancelado) return "Este servicio está cancelado: no se hará ninguna jornada más.";
    if (!srv) return "La solicitud está pendiente de revisar y aceptar.";
    switch (srv.estado) {
      case "PENDIENTE":
        return "Se está buscando profesional. Elígelo entre los candidatos que encajan.";
      case "ASIGNADO":
        return `Esperando a que ${pro?.nombre ?? "la profesional"} confirme el servicio.`;
      case "CONFIRMADO":
        return `Confirmado con ${pro?.nombre ?? "la profesional"}.${proxima ? ` La primera jornada es el ${diaCorto(proxima.fecha)}.` : ""}`;
      case "EN_CURSO":
        return porVerificar.length > 0
          ? `En marcha. ${porVerificar.length} jornada${porVerificar.length === 1 ? "" : "s"} por verificar.`
          : `En marcha.${proxima ? ` Próxima jornada: ${diaCorto(proxima.fecha)}.` : ""}`;
      case "FINALIZADO":
        return porVerificar.length > 0
          ? `Terminado. Faltan ${porVerificar.length} jornada${porVerificar.length === 1 ? "" : "s"} por verificar.`
          : "Terminado. Falta darlo por verificado.";
      case "VALIDADO": {
        const falta: string[] = [];
        if (pendienteCobro > 0) falta.push(`cobrar ${euros(pendienteCobro)} a la familia`);
        if (pendientePago > 0) falta.push(`pagar ${euros(pendientePago)} a la profesional`);
        return falta.length > 0
          ? `Verificado. Para cerrarlo falta ${falta.join(" y ")}.`
          : "Verificado. Falta facturarlo y liquidarlo: se cierra solo al cobrar y pagar.";
      }
      case "CERRADO":
        return "Cerrado: cobrado a la familia y pagado a la profesional.";
      default:
        return "";
    }
  }

  function informe() {
    exportarCSV(
      visitas.filter((v) => v.estado !== "CANCELADA"),
      [
        { encabezado: "Jornada", valor: (v) => v.codigo },
        { encabezado: "Fecha", valor: (v) => diaDe(v.fecha) },
        { encabezado: "Previsto", valor: (v) => `${v.horaInicioProg ?? ""}-${v.horaFinProg ?? ""}` },
        { encabezado: "Entrada", valor: (v) => (v.horaInicioReal ? horaDe(v.horaInicioReal) : "") },
        { encabezado: "Salida", valor: (v) => (v.horaFinReal ? horaDe(v.horaFinReal) : "") },
        { encabezado: "Minutos", valor: (v) => v.minutosReales ?? minutosFichados(v.horaInicioReal, v.horaFinReal) ?? "" },
        { encabezado: "Estado", valor: (v) => v.estado },
        { encabezado: "Importe familia", valor: (v) => v.importeCliente ?? "" },
        { encabezado: "Importe profesional", valor: (v) => v.importeProfesional ?? "" },
      ],
      `informe-${srv?.codigo ?? s!.codigo}`,
    );
  }

  const noPuede = (m: ModoCierre) => motivoNoPuede(s, m);
  const acciones: { modo: ModoCierre; etiqueta: string; Icono: typeof IconCheck; peligro?: boolean }[] = [
    { modo: "terminar", etiqueta: "Terminar servicio", Icono: IconCheck },
    { modo: "cancelar", etiqueta: "Cancelar servicio", Icono: IconAlert, peligro: true },
    { modo: "eliminar", etiqueta: "Eliminar servicio", Icono: IconTrash, peligro: true },
  ];

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div>
        <button onClick={onVolver} className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <IconArrowLeft className="h-4 w-4" /> {etiquetaVolver}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold text-slate-800">{srv ? `Servicio ${srv.codigo}` : `Solicitud ${s.codigo}`}</h1>
              <span className={`pastilla ${info.badge}`}>
                <info.Icono className="h-3.5 w-3.5" /> {info.etiqueta}
              </span>
              {conIncidencia && (
                <span className="pastilla bg-rose-100 text-rose-700">
                  <IconAlert className="h-3.5 w-3.5" /> Incidencia abierta
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Solicitud creada el {fechaLarga(s.createdAt)}
              {srv?.updatedAt && <> · Última actualización {fechaHora(srv.updatedAt)}</>}
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <button onClick={() => setEditando(true)} className="boton-secundario">
              <IconPencil className="h-4 w-4" /> Editar servicio
            </button>
            {srv && (
              <>
                <button
                  onClick={() => setMenuAbierto((v) => !v)}
                  className="boton-secundario px-3"
                  aria-label="Más acciones"
                  aria-haspopup="menu"
                  aria-expanded={menuAbierto}
                >
                  <span className="text-lg leading-none">⋯</span>
                </button>
                {menuAbierto && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuAbierto(false)} />
                    <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                      {acciones.map(({ modo, etiqueta, Icono, peligro }) => {
                        const razon = noPuede(modo);
                        return (
                          <button
                            key={modo}
                            role="menuitem"
                            onClick={() => {
                              setMenuAbierto(false);
                              setCierre(modo);
                            }}
                            className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${razon ? "opacity-60" : ""}`}
                          >
                            <span className={`flex items-center gap-2 font-medium ${peligro ? "text-rose-600" : "text-slate-700"}`}>
                              <Icono className="h-4 w-4" /> {etiqueta}
                            </span>
                            {razon && <span className="mt-0.5 pl-6 text-xs text-slate-500">{razon}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 px-4 py-2.5 text-sm text-brand-green-800" role="status">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-brand-green-700 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {cancelado && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-medium">Servicio cancelado{motivoCancelacion ? ` el ${fechaLarga(motivoCancelacion.createdAt)}` : ""}.</p>
          {motivoCancelacion?.motivo && <p className="mt-0.5">Motivo: {motivoCancelacion.motivo}</p>}
          <p className="mt-1 text-rose-700/80">
            Lo encuentras en Servicios › Cancelados y en Solicitudes › Canceladas. Su historial y lo ya trabajado se conservan.
          </p>
        </div>
      )}

      {/* Persona y profesional */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="tarjeta flex items-start gap-4 p-4">
          <Avatar nombre={s.persona.nombre} apellidos={s.persona.apellidos} className="h-14 w-14 !text-sm" />
          <div className="min-w-0 flex-1">
            <Etiqueta>Persona usuaria</Etiqueta>
            <p className="truncate text-base font-semibold text-slate-800">
              {s.persona.nombre} {s.persona.apellidos}
            </p>
            <p className="text-xs text-slate-400">{s.persona.codigo}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {s.persona.telefono && (
                <p className="flex items-center gap-2">
                  <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {s.persona.telefono}
                </p>
              )}
              {(s.persona.direccion || s.persona.municipio) && (
                <p className="flex items-start gap-2">
                  <IconPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="min-w-0">{s.persona.direccion ?? s.persona.municipio}</span>
                </p>
              )}
            </div>
            <span className="pastilla mt-2 bg-slate-100 text-slate-600">{s.necesidad.nombre}</span>
          </div>
          <button onClick={() => setPersonaAbierta(true)} className="boton-secundario-sm shrink-0">
            Ver perfil
          </button>
        </div>

        <div className="tarjeta flex items-start gap-4 p-4">
          {pro ? (
            <>
              <Avatar foto={pro.foto} nombre={pro.nombre} apellidos={pro.apellidos} className="h-14 w-14 !text-sm" />
              <div className="min-w-0 flex-1">
                <Etiqueta>Profesional asignado</Etiqueta>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-semibold text-slate-800">
                    {pro.nombre} {pro.apellidos}
                  </p>
                  <span className={`pastilla !py-0.5 ${pro.estado === "INACTIVO" ? "bg-slate-200 text-slate-500" : "bg-brand-green-100 text-brand-green-700"}`}>
                    {pro.estado === "INACTIVO" ? "De baja" : "Activa"}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{pro.codigo}</p>
                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  {pro.telefono && (
                    <p className="flex items-center gap-2">
                      <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {pro.telefono}
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <IconCalendar className="h-3.5 w-3.5 text-slate-400" />
                    {proxima ? `Próxima visita: ${diaCorto(proxima.fecha)}${proxima.horaInicioProg ? ` · ${proxima.horaInicioProg}` : ""}` : "Sin próxima visita"}
                  </p>
                </div>
              </div>
              <button onClick={() => setProfesionalAbierto(true)} className="boton-secundario-sm shrink-0">
                Ver perfil
              </button>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <IconUsers className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <Etiqueta>Profesional asignado</Etiqueta>
                <p className="text-base font-semibold text-slate-800">Sin profesional</p>
                <p className="mt-1 text-sm text-slate-500">
                  {cancelado
                    ? "El servicio está cancelado."
                    : srv
                      ? `${srv.nInteresados ?? srv.interesados?.length ?? 0} interesada(s). Elige a alguien para lanzarlo.`
                      : "Se elige cuando la solicitud se acepta."}
                </p>
              </div>
              {srv && !cancelado && (
                <button onClick={() => setEditando(true)} className="boton-verde-sm shrink-0">
                  Asignar
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Resumen del servicio */}
      <div className="tarjeta p-4">
        <div className="grid items-center gap-4 sm:grid-cols-2 lg:grid-cols-[auto_repeat(4,minmax(0,1fr))_auto]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
              <IconoNecesidad codigo={s.necesidad.codigo} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{s.necesidad.nombre}</p>
              <p className="text-xs text-slate-500">{recurrente ? `Recurrente${diasSemana ? ` · ${diasSemana} día${diasSemana === 1 ? "" : "s"}/semana` : ""}` : "Puntual"}</p>
            </div>
          </div>
          <Dato etiqueta="Inicio">{fechaLarga(s.plan?.fechaInicio)}</Dato>
          <Dato etiqueta="Estado">
            <EstadoBadge estado={srv?.estado ?? s.estado} />
          </Dato>
          <Dato etiqueta="Próxima visita">
            {proxima ? `${diaCorto(proxima.fecha)}${proxima.horaInicioProg ? ` · ${proxima.horaInicioProg}` : ""}` : "—"}
          </Dato>
          <Dato etiqueta="Duración">{minutosJornada ? duracion(minutosJornada) : "—"}</Dato>
          <button onClick={() => setVerMas((v) => !v)} className="boton-secundario-sm justify-self-start lg:justify-self-end" aria-expanded={verMas}>
            {verMas ? "Ver menos" : "Ver más"}
          </button>
        </div>
        {verMas && (
          <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
            <div>
              <Etiqueta>Lo que ha pedido</Etiqueta>
              <p className="mt-0.5 whitespace-pre-line text-slate-700">{s.descripcionLibre || "—"}</p>
            </div>
            <div>
              <Etiqueta>Tareas previstas</Etiqueta>
              <p className="mt-0.5 whitespace-pre-line text-slate-700">{s.plan?.tareasPrevistas || "—"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Columna principal */}
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
            {PESTANAS.map((p) => (
              <button
                key={p.clave}
                role="tab"
                aria-selected={pestana === p.clave}
                onClick={() => setPestana(p.clave)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition ${
                  pestana === p.clave ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          {pestana === "resumen" && (
            <>
              <div className="tarjeta p-4">
                <h2 className="mb-4 text-sm font-semibold text-slate-800">Estado del servicio</h2>
                <ol className="flex items-start">
                  {ETAPAS.map((nombre, i) => {
                    const hecha = !cancelado && i < etapa;
                    const actual = !cancelado && i === etapa;
                    return (
                      <li key={nombre} className="flex min-w-0 flex-1 flex-col items-center text-center">
                        <div className="flex w-full items-center">
                          <div className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : hecha || actual ? "bg-brand-green-500" : "bg-slate-200"}`} />
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              hecha
                                ? "bg-brand-green-500 text-white"
                                : actual
                                  ? "border-2 border-brand-green-500 bg-white text-brand-green-700"
                                  : "border border-slate-200 bg-white text-slate-400"
                            }`}
                            aria-current={actual ? "step" : undefined}
                          >
                            {hecha ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                          </div>
                          <div className={`h-0.5 flex-1 ${i === ETAPAS.length - 1 ? "bg-transparent" : hecha ? "bg-brand-green-500" : "bg-slate-200"}`} />
                        </div>
                        <span className={`mt-1.5 px-0.5 text-[11px] leading-tight ${actual ? "font-semibold text-slate-800" : "text-slate-500"}`}>{nombre}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{mensajeDeEstado()}</p>
              </div>

              <div className="tarjeta p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Información del servicio</h2>
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Dato etiqueta="Tipo">{recurrente ? "Recurrente" : "Puntual"}</Dato>
                  <Dato etiqueta="Periodicidad">{s.plan?.recurrencia || (recurrente ? "—" : "Una vez")}</Dato>
                  <Dato etiqueta="Duración estimada">{minutosJornada ? `${duracion(minutosJornada)} por jornada` : "—"}</Dato>
                  <Dato etiqueta="Horario">{s.plan?.horaInicio && s.plan?.horaFin ? `${s.plan.horaInicio} – ${s.plan.horaFin}` : (s.plan?.franjaHoraria ?? "—")}</Dato>
                  <Dato etiqueta="Fecha de inicio">{fechaLarga(s.plan?.fechaInicio)}</Dato>
                  <Dato etiqueta="Fecha de fin">{s.plan ? (s.plan.fechaFin ? fechaLarga(s.plan.fechaFin) : "Indefinido") : "—"}</Dato>
                  <Dato etiqueta="Precio/hora">{precioHora != null ? `${euros(precioHora)}/h` : "Sin fijar"}</Dato>
                  <Dato etiqueta="Total estimado (mes)">{totalEstimadoMes != null ? euros(totalEstimadoMes) : "—"}</Dato>
                </div>
              </div>

              {srv && ["CONFIRMADO", "EN_CURSO"].includes(srv.estado) && (
                <ProximasJornadas servicioId={srv.id} recarga={`${visitas.length}-${srv.estado}-${s.plan?.fechaInicio}-${s.plan?.horaInicio}-${s.plan?.recurrencia}`} />
              )}

              <div className="tarjeta p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Registro de jornadas</h2>
                  <button onClick={() => setPestana("fichaje")} className="text-xs font-medium text-brand hover:underline">
                    Ver todo el registro
                  </button>
                </div>
                <TablaFichaje visitas={visitas.filter((v) => v.estado !== "CANCELADA").slice(-5).reverse()} onDesglose={setDesgloseDe} />
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
                <div className="tarjeta p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">Precio y reparto</h2>
                    <button onClick={() => setPestana("facturacion")} className="text-xs font-medium text-brand hover:underline">
                      Ver detalle de reparto
                    </button>
                  </div>
                  <Reparto precioHora={precioHora} comision={comision} />
                </div>

                <div className="tarjeta p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">Incidencias del servicio</h2>
                    {srv && !cancelado && (
                      <button onClick={() => setNuevaIncidencia(true)} className="text-xs font-medium text-brand hover:underline">
                        Registrar
                      </button>
                    )}
                  </div>
                  {incidencias.length === 0 ? (
                    <p className="text-sm text-slate-400">Sin incidencias. Todo en orden.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {incidencias.slice(0, 5).map((i) => {
                        const m = infoMotivo(i.motivo);
                        return (
                          <li key={i.id}>
                            <button onClick={() => setIncidenciaAbierta(i.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
                              <m.Icono className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-slate-700">{i.descripcion}</span>
                                <span className="text-xs text-slate-400">
                                  {i.codigo} · {m.etiqueta}
                                </span>
                              </span>
                              <EstadoBadge estado={i.estado} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div className="tarjeta p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Historial</h2>
                  <button onClick={() => setPestana("historial")} className="text-xs font-medium text-brand hover:underline">
                    Ver todo
                  </button>
                </div>
                <Linea entradas={[...historial].reverse().slice(0, 4)} />
              </div>
            </>
          )}

          {pestana === "jornadas" && (
            <div className="tarjeta overflow-x-auto p-4">
              {visitas.length === 0 ? (
                <p className="text-sm text-slate-400">Todavía no hay jornadas programadas.</p>
              ) : (
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-3 font-semibold">Jornada</th>
                      <th className="py-2 pr-3 font-semibold">Día</th>
                      <th className="py-2 pr-3 font-semibold">Horario</th>
                      <th className="py-2 pr-3 font-semibold">Profesional</th>
                      <th className="py-2 pr-3 font-semibold">Estado</th>
                      <th className="py-2 text-right font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {visitas.map((v) => (
                      <tr key={v.id}>
                        <td className="py-2 pr-3 font-medium text-slate-700">{v.codigo}</td>
                        <td className="py-2 pr-3 text-slate-600">{diaCorto(v.fecha)}</td>
                        <td className="py-2 pr-3 text-slate-600">{v.horaInicioProg && v.horaFinProg ? `${v.horaInicioProg} – ${v.horaFinProg}` : "—"}</td>
                        <td className="py-2 pr-3 text-slate-600">{v.profesional ? `${v.profesional.nombre} ${v.profesional.apellidos}` : "—"}</td>
                        <td className="py-2 pr-3">
                          <EstadoBadge estado={v.estado} />
                        </td>
                        <td className="py-2 text-right">
                          {["PROGRAMADA", "CONFIRMADA", "EN_CURSO"].includes(v.estado) && diaDe(v.fecha) <= hoy && (
                            <button onClick={() => setResolviendo(v)} className="boton-secundario-sm">
                              Fichar
                            </button>
                          )}
                          {["FINALIZADA", "INCIDENCIA"].includes(v.estado) && (
                            <button onClick={() => setVerificando(v)} className="boton-verde-sm">
                              Verificar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {pestana === "fichaje" && (
            <div className="tarjeta overflow-x-auto p-4">
              <TablaFichaje visitas={visitas.filter((v) => v.estado !== "CANCELADA").reverse()} onDesglose={setDesgloseDe} />
            </div>
          )}

          {pestana === "facturacion" && (
            <div className="space-y-4">
              <div className="tarjeta overflow-x-auto p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Cobro a la familia y pago a la profesional, jornada a jornada</h2>
                {jornadas.length === 0 ? (
                  <p className="text-sm text-slate-400">Aún no hay jornadas con importe.</p>
                ) : (
                  <table className="w-full min-w-[44rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Jornada</th>
                        <th className="py-2 pr-3 font-semibold">Día</th>
                        <th className="py-2 pr-3 text-right font-semibold">Familia</th>
                        <th className="py-2 pr-3 font-semibold">Factura</th>
                        <th className="py-2 pr-3 text-right font-semibold">Profesional</th>
                        <th className="py-2 pr-3 font-semibold">Liquidación</th>
                        <th className="py-2 text-right font-semibold">CUIDA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {jornadas.map((j) => (
                        <tr key={j.id}>
                          <td className="py-2 pr-3 font-medium text-slate-700">{j.codigo}</td>
                          <td className="py-2 pr-3 text-slate-600">{diaCorto(j.fecha)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{j.importeCliente != null ? euros(j.importeCliente) : "—"}</td>
                          <td className="py-2 pr-3">
                            {j.factura ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-slate-600">{j.factura.codigo}</span>
                                <EstadoBadge estado={j.factura.estado} />
                              </span>
                            ) : (
                              <span className="text-slate-400">{j.importeCliente != null ? "Sin facturar" : "—"}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{j.importeProfesional != null ? euros(j.importeProfesional) : "—"}</td>
                          <td className="py-2 pr-3">
                            {j.liquidacion ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-slate-600">{j.liquidacion.codigo}</span>
                                <EstadoBadge estado={j.liquidacion.estado} />
                              </span>
                            ) : (
                              <span className="text-slate-400">{j.importeProfesional != null ? "Sin liquidar" : "—"}</span>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums text-slate-500">{j.importeCuida != null ? euros(j.importeCuida) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="tarjeta p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Precio y reparto</h2>
                <Reparto precioHora={precioHora} comision={comision} />
              </div>
            </div>
          )}

          {pestana === "historial" && (
            <div className="tarjeta p-4">
              <Linea entradas={[...historial].reverse()} />
            </div>
          )}

          {pestana === "documentos" && (
            <div className="tarjeta space-y-3 p-4 text-sm text-slate-600">
              <p className="flex items-start gap-3">
                <IconFile className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  Los documentos de <span className="font-medium text-slate-800">{s.persona.nombre}</span> (consentimientos, datos fiscales, mandato de domiciliación) están en su ficha.
                </span>
              </p>
              <button onClick={() => setPersonaAbierta(true)} className="boton-secundario-sm">
                Abrir la ficha de {s.persona.nombre}
              </button>
              {pro && (
                <>
                  <p className="flex items-start gap-3 border-t border-slate-100 pt-3">
                    <IconFile className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span>
                      El expediente de <span className="font-medium text-slate-800">{pro.nombre}</span> (certificado de delitos sexuales, titulación, contrato) está en su perfil.
                    </span>
                  </p>
                  <button onClick={() => setProfesionalAbierto(true)} className="boton-secundario-sm">
                    Abrir el perfil de {pro.nombre}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Columna lateral */}
        <aside className="min-w-0 space-y-4">
          {srv && !cancelado && (
            <div className="tarjeta space-y-2 p-4">
              <button
                onClick={() => paraFichar && setResolviendo(paraFichar)}
                disabled={!paraFichar}
                title={paraFichar ? undefined : "No hay ninguna jornada por fichar ahora mismo"}
                className="boton-verde w-full"
              >
                <IconPlay className="h-4 w-4" /> Fichar visita
              </button>
              <button onClick={() => setNuevaIncidencia(true)} className="boton-secundario w-full">
                <IconAlert className="h-4 w-4" /> Registrar incidencia
              </button>
              {porVerificar.length > 0 && (
                <button onClick={() => setVerificando(porVerificar[0])} className="boton-principal w-full">
                  <IconCheck className="h-4 w-4" /> Verificar {porVerificar.length === 1 ? "la jornada" : `${porVerificar.length} jornadas`}
                </button>
              )}
            </div>
          )}

          {srv && (
            <div className="tarjeta p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Acciones rápidas</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {[
                  { etiqueta: "Reasignar profesional", Icono: IconRefresh, alPulsar: () => setEditando(true), oculto: cancelado },
                  { etiqueta: "Modificar horario", Icono: IconClock, alPulsar: () => setEditando(true), oculto: cancelado },
                  { etiqueta: "Añadir jornada", Icono: IconPlus, alPulsar: () => setEditando(true), oculto: cancelado },
                  { etiqueta: "Generar informe", Icono: IconDownload, alPulsar: informe },
                  { etiqueta: "Enviar mensaje", Icono: IconChat, alPulsar: () => setMensajeAbierto(true), oculto: !pro },
                ]
                  .filter((a) => !a.oculto)
                  .map(({ etiqueta, Icono, alPulsar }) => (
                    <li key={etiqueta}>
                      <button onClick={alPulsar} className="flex w-full items-center gap-3 py-2.5 text-left text-slate-700 hover:text-brand">
                        <Icono className="h-4 w-4 text-slate-400" /> {etiqueta}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="tarjeta p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Información adicional</h2>
              <button onClick={() => setPersonaAbierta(true)} className="text-xs font-medium text-brand hover:underline">
                Editar
              </button>
            </div>
            <Etiqueta>Notas de la persona</Etiqueta>
            <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">
              {[s.persona.preferencias, s.persona.recomendaciones].filter(Boolean).join("\n") || "Sin notas."}
            </p>
            {(s.persona.medicacion || s.persona.medico) && (
              <p className="mt-2 text-xs text-slate-500">
                {s.persona.medicacion && <>Medicación: {s.persona.medicacion}. </>}
                {s.persona.medico && <>Médico: {s.persona.medico}.</>}
              </p>
            )}
          </div>

          {srv && (
            <div className="tarjeta p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Datos económicos</h2>
                <button onClick={() => setPestana("facturacion")} className="text-xs font-medium text-brand hover:underline">
                  Ver detalle
                </button>
              </div>
              <dl className="space-y-2 text-sm">
                <Fila etiqueta="Facturación mensual" valor={euros(facturadoMes)} />
                <Fila etiqueta="Pendiente de cobro" valor={euros(pendienteCobro)} aviso={pendienteCobro > 0} />
                <Fila etiqueta="Cobrado" valor={euros(cobrado)} bueno={cobrado > 0} />
                <div className="my-2 border-t border-slate-100" />
                <Fila etiqueta="Pendiente de pagar a la profesional" valor={euros(pendientePago)} aviso={pendientePago > 0} />
                <Fila etiqueta="Pagado a la profesional" valor={euros(pagadoPro)} bueno={pagadoPro > 0} />
              </dl>
            </div>
          )}

          <div className="tarjeta p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Última actividad</h2>
            <Linea entradas={[...historial].reverse().slice(0, 5)} compacta />
          </div>
        </aside>
      </div>

      {editando && (
        <SolicitudFichaModal
          solicitudId={solicitudId}
          onClose={() => {
            setEditando(false);
            void cargar();
          }}
          onChanged={() => {
            void cargar();
            onChanged();
          }}
        />
      )}

      {personaAbierta && <PersonaDetalleModal personaId={s.persona.id} onClose={() => setPersonaAbierta(false)} onCambiado={recargarTodo} />}
      {profesionalAbierto && pro && <PerfilProfesionalModal profesionalId={pro.id} onClose={() => setProfesionalAbierto(false)} />}
      {incidenciaAbierta && <IncidenciaFichaModal incidenciaId={incidenciaAbierta} onClose={() => setIncidenciaAbierta(null)} onChanged={recargarTodo} />}

      {cierre && srv && (
        <CierreServicioModal
          solicitud={s}
          modo={cierre}
          onClose={() => setCierre(null)}
          onHecho={(texto, borrado) => {
            setAviso(texto);
            onChanged();
            if (borrado) onVolver();
            else void cargar();
          }}
        />
      )}

      {nuevaIncidencia && srv && (
        <NuevaIncidenciaModal
          servicioId={srv.id}
          visitas={visitas.filter((v) => v.estado !== "CANCELADA")}
          onClose={() => setNuevaIncidencia(false)}
          onCreada={async () => {
            setAviso("Incidencia registrada.");
            await recargarTodo();
          }}
        />
      )}

      {mensajeAbierto && pro && (
        <Modal title={`Mensajes con ${pro.nombre} · ${s.persona.nombre}`} onClose={() => setMensajeAbierto(false)} size="lg">
          <ChatPanel profesionalId={pro.id} personaId={s.persona.id} />
        </Modal>
      )}

      {resolviendo && (
        <ResolverJornadaModal
          visitaId={resolviendo.id}
          codigo={resolviendo.codigo}
          persona={`${s.persona.nombre} ${s.persona.apellidos}`}
          profesional={pro ? `${pro.nombre} ${pro.apellidos}` : null}
          horaInicioProg={resolviendo.horaInicioProg}
          horaFinProg={resolviendo.horaFinProg}
          onClose={() => setResolviendo(null)}
          onResuelta={() => void recargarTodo()}
        />
      )}

      {verificando && (
        <TiempoTrabajadoModal
          titulo="Verificar la jornada"
          explicacion={`${diaCorto(verificando.fecha)}. Confirma el tiempo trabajado: es lo que se cobra a la familia y se paga a la profesional.`}
          etiquetaConfirmar="Verificar"
          horaInicioProg={verificando.horaInicioProg}
          horaFinProg={verificando.horaFinProg}
          onConfirmar={async ({ horaInicio, horaFin }) => {
            await api.post(`/visitas/${verificando.id}/revisar`, { horaInicio, horaFin }, token);
            await recargarTodo();
          }}
          onClose={() => setVerificando(null)}
        />
      )}

      {desgloseDe && <DesgloseVisitaModal visitaId={desgloseDe} onClose={() => setDesgloseDe(null)} onCambio={recargarTodo} />}
    </div>
  );
}

function Fila({ etiqueta, valor, aviso, bueno }: { etiqueta: string; valor: string; aviso?: boolean; bueno?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{etiqueta}</dt>
      <dd className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${aviso ? "text-amber-600" : bueno ? "text-brand-green-700" : "text-slate-800"}`}>{valor}</dd>
    </div>
  );
}

// Lo fichado frente a lo acordado, jornada a jornada.
function TablaFichaje({ visitas, onDesglose }: { visitas: Visita[]; onDesglose: (id: string) => void }) {
  if (visitas.length === 0) return <p className="text-sm text-slate-400">Todavía no hay jornadas.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3 font-semibold">Jornada</th>
            <th className="py-2 pr-3 font-semibold">Entrada</th>
            <th className="py-2 pr-3 font-semibold">Salida</th>
            <th className="py-2 pr-3 font-semibold">Tiempo real</th>
            <th className="py-2 pr-3 font-semibold">Estado</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {visitas.map((v) => {
            const minutos = v.minutosReales ?? minutosFichados(v.horaInicioReal, v.horaFinReal);
            return (
              <tr key={v.id}>
                <td className="py-2 pr-3">
                  <span className="font-medium text-slate-700">{v.codigo}</span>
                  <span className="ml-2 text-xs text-slate-400">{diaCorto(v.fecha)}</span>
                </td>
                <td className="py-2 pr-3 tabular-nums text-slate-600">{v.horaInicioReal ? horaDe(v.horaInicioReal) : "—"}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-600">{v.horaFinReal ? horaDe(v.horaFinReal) : "—"}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-600">{minutos != null ? duracion(minutos) : "—"}</td>
                <td className="py-2 pr-3">
                  <EstadoBadge estado={v.estado} />
                </td>
                <td className="py-2 text-right">
                  {v.importeCliente != null && (
                    <button onClick={() => onDesglose(v.id)} className="text-xs font-medium text-brand hover:underline">
                      Ver desglose
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Cómo se reparte lo que paga la familia: lo que cobra la profesional y lo que
// se queda CUIDA. Son cifras por hora, las que se fijan en el servicio.
function Reparto({ precioHora, comision }: { precioHora: number | null; comision: number | null }) {
  if (precioHora == null) return <p className="text-sm text-slate-400">Sin precio fijado todavía.</p>;
  const cuida = comision ?? 0;
  const profesional = Math.max(0, 100 - cuida);
  const radio = 38;
  const perimetro = 2 * Math.PI * radio;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" role="img" aria-label={`Profesional ${profesional}%, CUIDA ${cuida}%`}>
        <circle cx="50" cy="50" r={radio} fill="none" strokeWidth="14" className="stroke-slate-200" />
        <circle
          cx="50"
          cy="50"
          r={radio}
          fill="none"
          strokeWidth="14"
          strokeDasharray={`${(profesional / 100) * perimetro} ${perimetro}`}
          className="stroke-brand-green-500"
        />
        <circle
          cx="50"
          cy="50"
          r={radio}
          fill="none"
          strokeWidth="14"
          strokeDasharray={`${(cuida / 100) * perimetro} ${perimetro}`}
          strokeDashoffset={-(profesional / 100) * perimetro}
          className="stroke-brand"
        />
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        <li className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-green-500" /> Profesional
          </span>
          <span className="font-semibold tabular-nums text-slate-800">
            {profesional}% · {euros((precioHora * profesional) / 100)}/h
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" /> CUIDA
          </span>
          <span className="font-semibold tabular-nums text-slate-800">
            {cuida}% · {euros((precioHora * cuida) / 100)}/h
          </span>
        </li>
        <li className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
          <span className="flex items-center gap-2 text-slate-600">
            <IconEuro className="h-3.5 w-3.5 text-slate-400" /> Paga la familia
          </span>
          <span className="font-semibold tabular-nums text-slate-800">{euros(precioHora)}/h</span>
        </li>
      </ul>
    </div>
  );
}

function Linea({ entradas, compacta }: { entradas: EstadoHistorialEntry[]; compacta?: boolean }) {
  if (entradas.length === 0) return <p className="text-sm text-slate-400">Sin cambios registrados.</p>;
  return (
    <ul className={compacta ? "space-y-3" : "space-y-3"}>
      {entradas.map((h) => (
        <li key={h.id} className="relative border-l-2 border-slate-200 pl-3 text-sm">
          <p className="text-slate-800">
            {h.estadoAnterior && h.estadoAnterior !== h.estadoNuevo ? (
              <>
                <span className="text-slate-400">{h.estadoAnterior.replace(/_/g, " ").toLowerCase()} → </span>
                <span className="font-medium">{h.estadoNuevo.replace(/_/g, " ").toLowerCase()}</span>
              </>
            ) : (
              <span className="font-medium">{h.estadoNuevo.replace(/_/g, " ").toLowerCase()}</span>
            )}
          </p>
          {h.motivo && <p className="text-xs text-slate-500">{h.motivo}</p>}
          <p className="text-xs text-slate-400">{fechaHora(h.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}

function NuevaIncidenciaModal({
  servicioId,
  visitas,
  onClose,
  onCreada,
}: {
  servicioId: string;
  visitas: Visita[];
  onClose: () => void;
  onCreada: () => Promise<void>;
}) {
  const { token } = useAuth();
  const [motivo, setMotivo] = useState<MotivoIncidencia>("OTRO");
  const [prioridad, setPrioridad] = useState("MEDIA");
  const [visitaId, setVisitaId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setError(null);
    if (!descripcion.trim()) {
      setError("Cuenta qué ha pasado.");
      return;
    }
    setEnviando(true);
    try {
      await api.post("/incidencias", { servicioId, visitaId: visitaId || undefined, motivo, prioridad, descripcion: descripcion.trim() }, token);
      await onCreada();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido registrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title="Registrar incidencia" onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">¿De qué va?</p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_INCIDENCIA.map((m) => (
              <button
                key={m.valor}
                onClick={() => setMotivo(m.valor)}
                title={m.ayuda}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  motivo === m.valor ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <m.Icono className="h-3.5 w-3.5" /> {m.etiqueta}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Prioridad</span>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="campo w-full">
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Jornada (opcional)</span>
            <select value={visitaId} onChange={(e) => setVisitaId(e.target.value)} className="campo w-full">
              <option value="">Todo el servicio</option>
              {visitas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.codigo} · {diaCorto(v.fecha)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Qué ha pasado</span>
          <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="campo w-full" autoFocus />
        </label>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="boton-secundario">
            Volver
          </button>
          <button onClick={guardar} disabled={enviando} className="boton-principal">
            {enviando ? "Guardando…" : "Registrar incidencia"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
