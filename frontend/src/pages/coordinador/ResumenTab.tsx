import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { ActividadFeed } from "./ActividadTab.js";
import { CargaTrabajo } from "./CargaTrabajo.js";
import { Cronometro, horasTrabajadas } from "../../components/Cronometro.js";
import { Novedades } from "../../components/Novedades.js";
import { INFO_PRIORIDAD, calcularPendientes, hace, type Asunto } from "../../lib/pendientes.js";
import { compararConAcordado, duracion, euros, minutosFichados, conMayusculaInicial } from "../../lib/economia.js";
import { IconAlert, IconArrowDown, IconArrowUp, IconBriefcase, IconCalendar, IconCheck, IconClipboard, IconClock, IconReceipt, IconRefresh, IconUsers } from "../../components/icons.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { TiempoTrabajadoModal } from "../../components/TiempoTrabajadoModal.js";
import { IncidenciaFormModal } from "./IncidenciaFormModal.js";
import { FaltaProfesionalModal } from "../../components/FaltaProfesionalModal.js";
import type { Factura, Incidencia, Profesional, Servicio, Solicitud, Visita, Ausencia, FichaProfesional, Persona } from "../../lib/types.js";

interface Props {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  incidencias: Incidencia[];
  onIrA: (tab: string, filtro?: string, foco?: string) => void;
  onAbrirSolicitud: (solicitudId: string) => void;
  // Abrir la incidencia en su ficha. Antes el aviso solo llevaba a la
  // pestaña de incidencias y había que volver a buscarla en el listado.
  onAbrirIncidencia: (incidenciaId: string) => void;
  onAbrirPersona: (personaId: string) => void;
  onCambiado: () => void;
}

interface Aviso {
  clave: string;
  singular: string;
  plural: string;
  detalle: string;
  valor: number;
  icon: (p: { className?: string }) => JSX.Element;
  tono: "rose" | "amber";
  onClick: () => void;
}

// Una visita de la agenda, ya emparejada con el servicio y la solicitud a la
// que pertenece: en la lista plana de servicios esa información está dos
// niveles más arriba y el escritorio la necesita en cada fila.
interface FilaAgenda {
  visita: Visita;
  servicio: Servicio;
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mesDe(d: Date) {
  return iso(d).slice(0, 7);
}

// Saludo según la hora (sección "cuando entras debe saludarte buenos días,
// buenas tardes o buenas noches").
function saludo(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

function haceCuanto(desde: number, ahora: number): string {
  const seg = Math.max(0, Math.round((ahora - desde) / 1000));
  if (seg < 60) return "hace unos segundos";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
}

// Minutos transcurridos desde una hora "HH:MM" de hoy. Negativo si aún no ha
// llegado.
function minutosDesde(hora: string, ahora: number): number {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date(ahora);
  const previsto = new Date(d);
  previsto.setHours(h, m, 0, 0);
  return Math.round((d.getTime() - previsto.getTime()) / 60000);
}

// Una jornada abierta desde hace horas: el profesional se fue sin pulsar
// "finalizar". El backend decide desde cuántas horas cuenta, según las reglas
// de la casa.
interface JornadaAbierta {
  id: string;
  codigo: string;
  fecha: string;
  horaInicioReal: string | null;
  minutosAbierta: number | null;
  persona: { nombre: string; apellidos: string } | null;
  profesional: { id: string; nombre: string; apellidos: string; telefono: string | null } | null;
  solicitudId: string;
}

// Margen antes de dar una jornada por no presentada. Media hora perdona el
// atasco y el portero que no abre; más allá, alguien tiene que llamar.
const MARGEN_NO_PRESENTADO = 30;

function nombrePersona(s?: Servicio) {
  const p = s?.solicitud?.persona;
  return p ? `${p.nombre} ${p.apellidos}` : "—";
}

// Escritorio de coordinación: un puesto de trabajo, no un panel de lectura.
// Arriba lo que va mal ahora mismo; a la izquierda el día en vivo y la
// bandeja de lo que sólo puede resolver coordinación (se resuelve desde
// aquí, sin navegar); a la derecha la situación del mes, la plantilla y la
// demanda. La actividad reciente cierra, porque es contexto, no tarea.
// Una casilla del resumen: el icono en su círculo, el número grande y lo que
// cuenta debajo. Los cuatro tintes son los de la casa —rosa para lo urgente,
// ámbar para lo que espera, verde para lo que está en marcha y azul para el
// equipo— y siempre el mismo tinte para el mismo tipo de cifra.
const TINTES = {
  rose: { caja: "bg-rose-50 border-rose-100", icono: "bg-rose-100 text-rose-600", numero: "text-rose-700" },
  amber: { caja: "bg-amber-50 border-amber-100", icono: "bg-amber-100 text-amber-600", numero: "text-amber-700" },
  verde: { caja: "bg-brand-green-50 border-brand-green-100", icono: "bg-brand-green-100 text-brand-green-700", numero: "text-brand-green-800" },
  azul: { caja: "bg-brand-50 border-brand-100", icono: "bg-brand-100 text-brand-700", numero: "text-brand-800" },
} as const;

function Casilla({
  tono,
  valor,
  titulo,
  detalle,
  Icono,
  onClick,
}: {
  tono: keyof typeof TINTES;
  valor: number;
  titulo: string;
  detalle?: string;
  Icono: (p: { className?: string }) => JSX.Element;
  onClick: () => void;
}) {
  const t = TINTES[tono];
  return (
    <button onClick={onClick} className={`rounded-tarjeta border p-3 text-left transition hover:brightness-[0.98] ${t.caja}`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${t.icono}`}>
        <Icono className="h-4 w-4" />
      </span>
      <p className={`mt-2 text-2xl font-semibold leading-none tabular-nums ${t.numero}`}>{valor}</p>
      <p className="mt-1 text-xs font-medium text-slate-600">{titulo}</p>
      {detalle && <p className="text-[11px] text-slate-400">{detalle}</p>}
    </button>
  );
}


export function ResumenTab({ solicitudes, servicios, incidencias, onIrA, onAbrirSolicitud, onAbrirIncidencia, onAbrirPersona, onCambiado }: Props) {
  const { token } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [plantilla, setPlantilla] = useState<FichaProfesional[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);
  const [ultimaCarga, setUltimaCarga] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  const [refrescando, setRefrescando] = useState(false);
  const [verificando, setVerificando] = useState<string | null>(null);
  const [incidenciaFichaje, setIncidenciaFichaje] = useState<FilaAgenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Jornadas empezadas y nunca cerradas: casi siempre un botón sin pulsar,
  // no nueve horas de trabajo. Salen aquí para que alguien llame, en vez de
  // descubrirse al facturar el mes.
  const [abiertas, setAbiertas] = useState<JornadaAbierta[]>([]);
  const [cerrando, setCerrando] = useState<JornadaAbierta | null>(null);
  // La jornada a la que no fue nadie, mientras se registra.
  const [faltaProfesional, setFaltaProfesional] = useState<{ visitaId: string; codigo: string; persona: string } | null>(null);

  const cargarPropios = useCallback(async () => {
    const [facs, pros, me, eq, aus, abis, pers] = await Promise.all([
      api.get<Factura[]>("/facturas", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<{ nombre: string | null }>("/cuenta/me", token),
      api.get<FichaProfesional[]>("/personal", token).catch(() => []),
      api.get<Ausencia[]>("/personal/ausencias", token).catch(() => []),
      api.get<JornadaAbierta[]>("/visitas/abiertas", token).catch(() => []),
      api.get<Persona[]>("/personas", token).catch(() => []),
    ]);
    setPersonas(pers);
    setFacturas(facs);
    setProfesionales(pros);
    setNombre(me.nombre);
    setPlantilla(eq);
    setAusencias(aus);
    setAbiertas(abis);
  }, [token]);

  useEffect(() => {
    cargarPropios();
  }, [cargarPropios]);

  // El escritorio se mira durante horas seguidas: sin este latido el
  // "hace X" y el "sin empezar" de la agenda se quedarían congelados en la
  // hora a la que se abrió la pestaña.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  async function refrescar() {
    setRefrescando(true);
    setError(null);
    try {
      await Promise.all([cargarPropios(), onCambiado()]);
      setUltimaCarga(Date.now());
      setAhora(Date.now());
    } finally {
      setRefrescando(false);
    }
  }

  // Verificar una jornada sin salir del escritorio: es el paso que más veces
  // al día repite coordinación. El fichaje lo pone quien trabaja, así que
  // aquí solo se comprueba y se da el visto bueno; si falta, lo dice el
  // backend y hay que reclamarlo o abrir una incidencia.
  async function verificar(fila: FilaAgenda) {
    const { visita } = fila;
    setVerificando(visita.id);
    setError(null);
    try {
      await api.post(`/visitas/${visita.id}/revisar`, {}, token);
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido verificar la jornada");
    } finally {
      setVerificando(null);
    }
  }

  const hoyISO = iso(new Date());
  const mesActual = mesDe(new Date());
  const mesAnterior = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return mesDe(d);
  }, []);
  const horaAhora = new Date(ahora).toTimeString().slice(0, 5);

  const todasLasVisitas = useMemo<FilaAgenda[]>(
    () => servicios.flatMap((s) => (s.visitas ?? []).map((visita) => ({ visita, servicio: s }))),
    [servicios],
  );

  const agendaHoy = useMemo(
    () =>
      todasLasVisitas
        .filter(({ visita }) => visita.fecha.slice(0, 10) === hoyISO)
        .sort((a, b) => (a.visita.horaInicioProg ?? "99:99").localeCompare(b.visita.horaInicioProg ?? "99:99")),
    [todasLasVisitas, hoyISO],
  );

  const enMarcha = agendaHoy.filter(({ visita }) => visita.horaInicioReal && !visita.horaFinReal);
  // Tenía que haber empezado y nadie ha pulsado "He llegado": es la única
  // señal temprana de que una visita se ha caído.
  const retrasadas = agendaHoy.filter(
    ({ visita }) =>
      !visita.horaInicioReal &&
      !["REVISADA", "FINALIZADA"].includes(visita.estado) &&
      !!visita.horaInicioProg &&
      visita.horaInicioProg < horaAhora,
  );
  const porVerificarHoy = agendaHoy.filter(({ visita }) => visita.estado === "FINALIZADA");

  const visitasPorVerificar = useMemo(
    () => todasLasVisitas.filter(({ visita }) => visita.estado === "FINALIZADA"),
    [todasLasVisitas],
  );

  const nuevas = useMemo(() => solicitudes.filter((s) => !s.servicio && s.estado !== "CANCELADA"), [solicitudes]);
  const nuevasEstancadas = nuevas.filter((s) => ahora - new Date(s.createdAt).getTime() > 2 * 86400000);

  const cancelacionesPendientes = incidencias.filter((i) => i.tipo === "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));
  const incidenciasAbiertas = incidencias.filter((i) => i.tipo !== "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));
  const serviciosSinCubrir = servicios.filter((s) => s.estado === "PENDIENTE" && !s.profesionalId);
  const profesionalesPendientes = profesionales.filter((p) => p.estado === "PENDIENTE");

  // Servicio en marcha al que no le queda ninguna visita por delante: se
  // queda "vivo" en la lista pero en la práctica está parado, y hasta ahora
  // nada lo detectaba.
  const serviciosSinAgenda = useMemo(
    () =>
      servicios.filter(
        (s) =>
          ["CONFIRMADO", "EN_CURSO"].includes(s.estado) &&
          !(s.visitas ?? []).some((v) => v.fecha.slice(0, 10) >= hoyISO && !["REVISADA"].includes(v.estado)),
      ),
    [servicios, hoyISO],
  );

  const facturasVencidas = useMemo(() => facturas.filter((f) => f.mes < mesActual && f.estado !== "PAGADA"), [facturas, mesActual]);

  const avisos: Aviso[] = [
    {
      clave: "retrasadas",
      singular: "visita de hoy sin empezar",
      plural: "visitas de hoy sin empezar",
      detalle: "ya ha pasado su hora y el profesional no ha llegado",
      valor: retrasadas.length,
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("calendario"),
    },
    {
      clave: "cancelaciones",
      singular: "cancelación por corroborar",
      plural: "cancelaciones por corroborar",
      detalle: "la familia ha pedido cancelar y falta tu confirmación",
      valor: cancelacionesPendientes.length,
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("incidencias"),
    },
    {
      clave: "incidencias",
      singular: "incidencia abierta",
      plural: "incidencias abiertas",
      detalle: "tickets sin resolver",
      valor: incidenciasAbiertas.length,
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("incidencias"),
    },
    {
      clave: "estancadas",
      singular: "solicitud lleva más de 2 días sin aceptar",
      plural: "solicitudes llevan más de 2 días sin aceptar",
      detalle: "la familia sigue esperando respuesta",
      valor: nuevasEstancadas.length,
      icon: IconClipboard,
      tono: "rose" as const,
      onClick: () => onIrA("solicitudes", "nueva"),
    },
    {
      clave: "sin_agenda",
      singular: "servicio en marcha sin visitas programadas",
      plural: "servicios en marcha sin visitas programadas",
      detalle: "están activos pero no tienen nada por delante en la agenda",
      valor: serviciosSinAgenda.length,
      icon: IconCalendar,
      tono: "amber" as const,
      onClick: () => onIrA("solicitudes", "en_curso"),
    },
    {
      clave: "sin_cubrir",
      singular: "servicio sin cubrir",
      plural: "servicios sin cubrir",
      detalle: "publicados, esperando a un profesional",
      valor: serviciosSinCubrir.length,
      icon: IconBriefcase,
      tono: "amber" as const,
      onClick: () => onIrA("solicitudes", "buscando"),
    },
    {
      clave: "facturas",
      singular: "factura de un mes anterior sin cobrar",
      plural: "facturas de meses anteriores sin cobrar",
      detalle: "emitidas y todavía pendientes de pago",
      valor: facturasVencidas.length,
      icon: IconReceipt,
      tono: "amber" as const,
      onClick: () => onIrA("facturacion"),
    },
    {
      clave: "profesionales",
      singular: "profesional por verificar",
      plural: "profesionales por verificar",
      detalle: "se han dado de alta y esperan tu revisión",
      valor: profesionalesPendientes.length,
      icon: IconUsers,
      tono: "amber" as const,
      onClick: () => onIrA("profesionales"),
    },
    // Quien no tiene los papeles en regla no puede trabajar, y eso se
    // descubría el día que había que asignarle a alguien.
    {
      clave: "sin_papeles",
      valor: plantilla.filter((m) => m.bloqueado).length,
      singular: "persona del equipo no puede trabajar: le falta documentación",
      plural: "personas del equipo no pueden trabajar: les falta documentación",
      detalle: "Sin el certificado de delitos sexuales o el DNI no se les puede asignar ningún servicio",
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("equipo"),
    },
    {
      clave: "ausencias_pendientes",
      valor: ausencias.filter((a) => a.estado === "SOLICITADA").length,
      singular: "petición de días pendiente de responder",
      plural: "peticiones de días pendientes de responder",
      detalle: "Alguien del equipo espera respuesta",
      icon: IconCalendar,
      tono: "amber" as const,
      onClick: () => onIrA("equipo"),
    },
  ].filter((a) => a.valor > 0);

  // Horas realmente trabajadas: lo que se factura no son las horas
  // programadas sino las del temporizador (sección "lo que vale es el
  // tiempo que pasan los profesionales con los usuarios").
  function horasDelMes(mes: string) {
    return todasLasVisitas
      .filter(({ visita }) => visita.fecha.slice(0, 7) === mes)
      .reduce((acc, { visita }) => acc + horasTrabajadas(visita.horaInicioReal, visita.horaFinReal), 0);
  }
  const horasMes = useMemo(() => horasDelMes(mesActual), [todasLasVisitas, mesActual]);
  const horasMesAnterior = useMemo(() => horasDelMes(mesAnterior), [todasLasVisitas, mesAnterior]);
  const deltaHoras = horasMesAnterior > 0 ? ((horasMes - horasMesAnterior) / horasMesAnterior) * 100 : null;

  const facturasMes = useMemo(() => facturas.filter((f) => f.mes === mesActual), [facturas, mesActual]);
  const totalFacturadoMes = facturasMes.reduce((acc, f) => acc + Number(f.totalConIva ?? f.importeTotal), 0);
  const pendienteCobroMes = facturasMes.filter((f) => f.estado !== "PAGADA").reduce((acc, f) => acc + Number(f.totalConIva ?? f.importeTotal), 0);
  const comisionMes = facturasMes.reduce((acc, f) => acc + Number(f.comisionTotal), 0);

  // La comisión del mes pasado, para saber si el negocio sube o baja. Es la
  // comparación que le sirve a coordinación, no la de horas.
  const comisionMesAnterior = useMemo(
    () => facturas.filter((f) => f.mes === mesAnterior).reduce((acc, f) => acc + Number(f.comisionTotal), 0),
    [facturas, mesAnterior],
  );
  const deltaComision = comisionMesAnterior > 0 ? ((comisionMes - comisionMesAnterior) / comisionMesAnterior) * 100 : null;
  const aProfesionalesMes = useMemo(
    () => facturasMes.reduce((acc, f) => acc + Number(f.importeProfesionales ?? 0), 0),
    [facturasMes],
  );

  const profesionalesActivos = profesionales.filter((p) => p.estado === "ACTIVO").length;
  const profesionalesOcupados = useMemo(
    () => new Set(servicios.filter((s) => ["CONFIRMADO", "EN_CURSO"].includes(s.estado) && s.profesionalId).map((s) => s.profesionalId as string)).size,
    [servicios],
  );

  const distribucionNecesidad = useMemo(() => {
    const conteo = new Map<string, { nombre: string; codigo: string; valor: number }>();
    for (const s of solicitudes) {
      const actual = conteo.get(s.necesidad.id) ?? { nombre: s.necesidad.nombre, codigo: s.necesidad.codigo, valor: 0 };
      actual.valor += 1;
      conteo.set(s.necesidad.id, actual);
    }
    return Array.from(conteo.values())
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  }, [solicitudes]);
  const maxDistribucion = Math.max(1, ...distribucionNecesidad.map((d) => d.valor));

  const totalBandeja = nuevas.length + visitasPorVerificar.length + cancelacionesPendientes.length;

  // Todo lo que requiere una decisión, con un único criterio de prioridad.
  // Antes cada bloque del escritorio decidía por su cuenta qué era urgente y
  // no había forma de saber por dónde empezar.
  const pendientes = useMemo(
    () => calcularPendientes({ solicitudes, servicios, incidencias, facturas, plantilla, personas }),
    [solicitudes, servicios, incidencias, facturas, plantilla, personas],
  );
  const criticos = pendientes.filter((a) => a.prioridad === "critico");

  function irAsunto(a: Asunto) {
    if (a.destino.tipo === "solicitud") onAbrirSolicitud(a.destino.id);
    else if (a.destino.tipo === "incidencia") onAbrirIncidencia(a.destino.id);
    else if (a.destino.tipo === "persona") onAbrirPersona(a.destino.id);
    else onIrA(a.destino.tab, undefined, a.destino.foco);
  }

  return (
    <div className="space-y-4">
      {/* Mi día. Es lo primero que se ve al entrar, así que va en su propia
          tarjeta: el saludo, la fecha y la hora, y debajo las cuatro cifras
          que deciden en qué se emplea la mañana. */}
      <section className="tarjeta relative overflow-hidden p-4 sm:p-5">
        {/* La hoja de la marca, en la esquina y apenas insinuada: identidad
            sin quitarle sitio a ningún dato. */}
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -right-6 -top-8 h-44 w-44 text-brand-green-400/10" aria-hidden>
          <path fill="currentColor" d="M56 8C33 8 14 18 9 38c-2 8 1 15 6 18 2-14 10-26 24-33-11 9-18 20-20 34 15 3 28-3 34-15 4-9 5-22 3-34Z" />
        </svg>

        <header className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-800 sm:text-2xl">
              {saludo()}
              {nombre ? `, ${conMayusculaInicial(nombre.split(" ")[0])}` : ""}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {pendientes.length > 0
                ? `Aquí tienes lo más importante de hoy: ${pendientes.length} ${pendientes.length === 1 ? "asunto requiere" : "asuntos requieren"} tu atención.`
                : "Aquí tienes un resumen de lo más importante de hoy."}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="flex items-center gap-2 text-sm text-slate-500 sm:justify-end">
              <span>{conMayusculaInicial(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</span>
              <span className="flex items-center gap-1 font-medium tabular-nums text-slate-700 sm:hidden">
                <IconClock className="h-3.5 w-3.5 text-slate-400" />
                {new Date(ahora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>
            <p className="mt-0.5 hidden items-center justify-end gap-1.5 text-sm font-medium tabular-nums text-slate-700 sm:flex">
              <IconClock className="h-3.5 w-3.5 text-slate-400" />
              {new Date(ahora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <button
              onClick={refrescar}
              disabled={refrescando}
              className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 transition hover:text-slate-600 disabled:opacity-60 sm:ml-auto"
              title="Volver a cargar los datos del escritorio"
            >
              <IconRefresh className={`h-3 w-3 ${refrescando ? "animate-spin" : ""}`} />
              {refrescando ? "Actualizando…" : `Actualizado ${haceCuanto(ultimaCarga, ahora)}`}
            </button>
          </div>
        </header>

        {/* Las casillas. Cada una es un botón que lleva a lo que cuenta: el
            número no se queda en número. */}
        <div className="relative mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Casilla
            tono="rose"
            valor={criticos.length}
            titulo={criticos.length === 1 ? "Asunto urgente" : "Asuntos urgentes"}
            Icono={IconAlert}
            onClick={() => onIrA("bandeja")}
          />
          <Casilla
            tono="amber"
            valor={pendientes.length}
            titulo={pendientes.length === 1 ? "Pendiente" : "Pendientes"}
            Icono={IconClipboard}
            onClick={() => onIrA("bandeja")}
          />
          <Casilla
            tono="verde"
            valor={agendaHoy.length}
            titulo={agendaHoy.length === 1 ? "Visita hoy" : "Visitas hoy"}
            detalle={enMarcha.length > 0 ? `${enMarcha.length} en marcha ahora` : undefined}
            Icono={IconCalendar}
            onClick={() => onIrA("calendario")}
          />
          <Casilla
            tono="azul"
            valor={profesionalesActivos}
            titulo={profesionalesActivos === 1 ? "Profesional activo" : "Profesionales activos"}
            Icono={IconUsers}
            onClick={() => onIrA("profesionales")}
          />
        </div>
      </section>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {/* Lo que ha cambiado desde la última vez. Antes sólo estaba en la
          campana, y la campana hay que abrirla para enterarse. */}
      <Novedades
        onAbrir={(tipo, id) => {
          if (tipo === "Solicitud") onAbrirSolicitud(id);
          if (tipo === "Incidencia") onAbrirIncidencia(id);
        }}
      />

      {avisos.length === 0 ? (
        <div className="rounded-tarjeta border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-800">
          Todo al día — no hay nada que requiera tu acción ahora mismo.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {avisos.map((a) => (
            <button
              key={a.clave}
              onClick={a.onClick}
              title={a.detalle}
              className={`flex items-start gap-2.5 rounded-tarjeta border px-3 py-2.5 text-left transition hover:brightness-[0.98] ${
                a.tono === "rose" ? "border-rose-200 bg-rose-50/70" : "border-amber-200 bg-amber-50/70"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  a.tono === "rose" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
                }`}
              >
                <a.icon className="h-3.5 w-3.5" />
              </span>
              <p className="text-xs leading-snug text-slate-700">
                <span className="font-semibold text-slate-900">{a.valor}</span> {a.valor === 1 ? a.singular : a.plural}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="tarjeta p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconCalendar className="h-4 w-4 text-slate-400" /> Hoy
              </h3>
              <button onClick={() => onIrA("calendario")} className="text-xs font-medium text-brand hover:text-brand-800">
                Ver calendario
              </button>
            </div>
            {agendaHoy.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-400">No hay ninguna visita programada para hoy.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {agendaHoy.map(({ visita, servicio }) => {
                  const enCurso = !!visita.horaInicioReal && !visita.horaFinReal;
                  const retrasada = retrasadas.some((r) => r.visita.id === visita.id);
                  const solicitudId = servicio.solicitud?.id;
                  // Pasada media hora de la hora prevista sin que nadie haya
                  // fichado, esto ya no es "va con retraso": es que no se ha
                  // presentado, y hay que llamar a alguien.
                  const noPresentado =
                    retrasada && !!visita.horaInicioProg && minutosDesde(visita.horaInicioProg, ahora) > MARGEN_NO_PRESENTADO;
                  return (
                    <li key={visita.id} className="flex items-center gap-3 py-2">
                      <span className={`w-12 shrink-0 text-xs font-semibold tabular-nums ${retrasada ? "text-rose-600" : "text-slate-500"}`}>
                        {visita.horaInicioProg ?? "--:--"}
                      </span>
                      {/* Toda la fila entra en la ficha: antes solo había
                          botones de cambio de estado y no se podía mirar nada
                          antes de decidir. */}
                      <button
                        onClick={() => solicitudId && onAbrirSolicitud(solicitudId)}
                        disabled={!solicitudId}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm text-slate-800 hover:underline">
                          <IconoNecesidad codigo={servicio.solicitud?.necesidad.codigo} className="mr-1.5 inline h-4 w-4 shrink-0 align-text-bottom text-slate-400" />
                          {nombrePersona(servicio)}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {servicio.solicitud?.necesidad.nombre}
                          {visita.profesional && ` · ${visita.profesional.nombre} ${visita.profesional.apellidos}`}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {enCurso ? (
                          <Cronometro inicio={visita.horaInicioReal} fin={visita.horaFinReal} />
                        ) : visita.estado === "FINALIZADA" ? (
                          // Verificar lleva a Verificación con esta jornada
                          // delante, que es donde están las horas y las
                          // tareas para poder decidir.
                          <button
                            onClick={() => onIrA("verificacion", undefined, visita.id)}
                            className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 transition hover:bg-orange-200"
                          >
                            Verificar
                          </button>
                        ) : visita.estado === "REVISADA" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                            <IconCheck className="h-3 w-3" /> Verificada
                          </span>
                        ) : visita.estado === "FALTA_PROFESIONAL" ? (
                          <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-medium text-rose-800">No fue nadie</span>
                        ) : noPresentado ? (
                          <>
                            {/* "Nadie ha fichado" es lo que la aplicación sabe;
                                si de verdad no fue nadie, lo dice una persona
                                con el botón de al lado. */}
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">Nadie ha fichado</span>
                            <button
                              onClick={() =>
                                setFaltaProfesional({
                                  visitaId: visita.id,
                                  codigo: visita.codigo,
                                  persona: nombrePersona(servicio),
                                })
                              }
                              className="rounded-md border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              No fue nadie
                            </button>
                            <button
                              onClick={() => setIncidenciaFichaje({ visita, servicio })}
                              title="Abrir una incidencia de fichaje"
                              className="rounded-md border border-rose-200 px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                            >
                              <IconAlert className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : retrasada ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Sin empezar</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">Programada</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Jornadas que siguen abiertas. Nadie trabaja nueve horas seguidas
              sin avisar: casi siempre es el botón de "finalizar" sin pulsar.
              Si se descubre al facturar, ya se ha cobrado mal. */}
          {abiertas.length > 0 && (
            <section className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-orange-800">
                <IconClock className="h-4 w-4" aria-hidden />
                {abiertas.length === 1 ? "Una jornada sigue abierta" : `${abiertas.length} jornadas siguen abiertas`}
              </h3>
              <p className="mt-0.5 text-xs text-orange-700">
                Se fichó la entrada y nunca la salida. Llama antes de cerrarla a mano: lo que se cierre desde aquí queda marcado
                como cierre de coordinación, no como fichaje.
              </p>
              <ul className="mt-2 space-y-1.5">
                {abiertas.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700">
                        {a.persona ? `${a.persona.nombre} ${a.persona.apellidos}` : a.codigo}
                      </span>
                      {a.profesional && <span className="text-slate-500"> · {a.profesional.nombre} {a.profesional.apellidos}</span>}
                      <span className="block text-[11px] text-orange-700">
                        Abierta desde hace {Math.floor((a.minutosAbierta ?? 0) / 60)} h {(a.minutosAbierta ?? 0) % 60} min
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {a.profesional?.telefono && (
                        <a href={`tel:${a.profesional.telefono}`} className="rounded-md border border-slate-300 px-2 py-0.5 hover:bg-slate-50">
                          Llamar
                        </a>
                      )}
                      <button
                        onClick={() => setCerrando(a)}
                        className="rounded-md bg-orange-600 px-2 py-0.5 font-medium text-white hover:bg-orange-700"
                      >
                        Cerrar a mano
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Pendiente de ti. Una tabla de prioridad, asunto, persona y una
              acción por fila: es la pregunta "¿qué tengo que hacer?" y su
              respuesta, sin que haya que deducirla de cuatro bloques sueltos.
              La prioridad lleva punto y palabra, no sólo color. */}
          <section className="tarjeta">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconClipboard className="h-4 w-4 text-slate-400" /> Pendiente de ti
              </h3>
              <span className="text-xs text-slate-400">
                {pendientes.length === 0 ? "nada pendiente" : `${pendientes.length} por resolver`}
              </span>
            </div>

            {pendientes.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">No queda nada esperando una decisión tuya.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendientes.slice(0, 12).map((a) => {
                  const info = INFO_PRIORIDAD[a.prioridad];
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <span className={`flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${info.texto}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${info.punto}`} aria-hidden />
                        {info.etiqueta}
                      </span>
                      <button onClick={() => irAsunto(a)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm text-slate-800">
                          <span className="font-medium hover:underline">{a.tipo}</span>
                          <span className="text-slate-400"> · </span>
                          {a.persona}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {a.detalle}
                          {a.desde > 0 && <span className="text-slate-400"> · hace {hace(a.desde)}</span>}
                        </p>
                      </button>
                      {/* Lo crítico lleva el botón lleno y lo demás el de
                          contorno: en una lista de veinte, el ojo tiene que
                          saber por cuál empezar sin leerse las veinte. */}
                      <button
                        onClick={() => irAsunto(a)}
                        className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                          a.prioridad === "critico"
                            ? "bg-brand text-white hover:bg-brand-800"
                            : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {a.accion}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {pendientes.length > 12 && (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
                y {pendientes.length - 12} asuntos más
              </p>
            )}
          </section>

          <CargaTrabajo solicitudes={solicitudes} />
        </div>

        <div className="space-y-4">
          <section className="tarjeta p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconReceipt className="h-4 w-4 text-slate-400" /> Este mes
              </h3>
              <button onClick={() => onIrA("facturacion")} className="text-xs font-medium text-brand hover:text-brand-800">
                Facturación
              </button>
            </div>
            {/* Las horas trabajadas son la cifra del profesional, no la de
                coordinación: aquí lo que se gestiona es el margen de CUIDA,
                que es de lo que vive la intermediación. Las horas siguen
                estando debajo, como el dato del que sale. */}
            <p className="text-xs text-slate-500">Comisión de CUIDA</p>
            <p className="text-5xl font-semibold leading-tight text-slate-900">{euros(comisionMes)}</p>
            {deltaComision !== null && (
              <p className={`text-xs font-medium ${deltaComision >= 0 ? "text-brand-green-700" : "text-amber-600"}`}>
                {deltaComision >= 0 ? <IconArrowUp className="inline h-3 w-3 align-text-bottom" /> : <IconArrowDown className="inline h-3 w-3 align-text-bottom" />}{" "}
                {Math.abs(deltaComision).toFixed(0)}% respecto al mes pasado
              </p>
            )}
            <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Facturado</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{euros(totalFacturadoMes)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Pendiente de cobro</dt>
                <dd className={`font-semibold tabular-nums ${pendienteCobroMes > 0 ? "text-amber-600" : "text-slate-800"}`}>{euros(pendienteCobroMes)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Horas prestadas</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{duracion(Math.round(horasMes * 60))}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">A pagar a profesionales</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{euros(aProfesionalesMes)}</dd>
              </div>
              {facturasVencidas.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                  <dt className="text-slate-500">Atrasadas</dt>
                  <dd className="font-semibold tabular-nums text-rose-600">{facturasVencidas.length}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="tarjeta p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconUsers className="h-4 w-4 text-slate-400" /> Plantilla
              </h3>
              <button onClick={() => onIrA("profesionales")} className="text-xs font-medium text-brand hover:text-brand-800">
                Ver todo
              </button>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Activos</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{profesionalesActivos}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Con servicio asignado</dt>
                <dd className="font-semibold tabular-nums text-slate-800">{profesionalesOcupados}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Libres</dt>
                <dd className="font-semibold tabular-nums text-brand-green-700">{Math.max(0, profesionalesActivos - profesionalesOcupados)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                <dt className="text-slate-500">Por verificar</dt>
                <dd className={`font-semibold tabular-nums ${profesionalesPendientes.length > 0 ? "text-amber-600" : "text-slate-800"}`}>
                  {profesionalesPendientes.length}
                </dd>
              </div>
            </dl>
          </section>

          {distribucionNecesidad.length > 0 && (
            <section className="tarjeta p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Qué se pide más</h3>
              <div className="space-y-1.5">
                {distribucionNecesidad.map((d) => (
                  <button
                    key={d.codigo}
                    onClick={() => onIrA("solicitudes")}
                    className="block w-full rounded-md px-1 py-1 text-left text-xs hover:bg-slate-50"
                    title={`${d.nombre}: ${d.valor} solicitudes`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-600">
                        <IconoNecesidad codigo={d.codigo} className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {d.nombre}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-800">{d.valor}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-brand-green-600" style={{ width: `${(d.valor / maxDistribucion) * 100}%` }} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Nadie ha fichado y ya ha pasado la hora larga: se abre la incidencia
          con el caso redactado, para no tener que contarlo a mano cada vez. */}
      {faltaProfesional && (
        <FaltaProfesionalModal
          visitaId={faltaProfesional.visitaId}
          codigo={faltaProfesional.codigo}
          persona={faltaProfesional.persona}
          onClose={() => setFaltaProfesional(null)}
          onRegistrada={onCambiado}
        />
      )}

      {incidenciaFichaje && (
        <IncidenciaFormModal
          servicios={servicios}
          servicioPreseleccionado={incidenciaFichaje.servicio.id}
          motivoPreseleccionado="AUSENCIA"
          descripcionSugerida={`${
            incidenciaFichaje.visita.profesional
              ? `${incidenciaFichaje.visita.profesional.nombre} ${incidenciaFichaje.visita.profesional.apellidos}`
              : "El profesional"
          } no ha fichado la entrada de la jornada de hoy de ${incidenciaFichaje.visita.horaInicioProg}–${
            incidenciaFichaje.visita.horaFinProg
          } con ${nombrePersona(incidenciaFichaje.servicio)}. Localizar y confirmar si se ha presentado.`}
          onClose={() => setIncidenciaFichaje(null)}
          onCreada={onCambiado}
        />
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Actividad reciente</h3>
          <button onClick={() => onIrA("actividad")} className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-800">
            <IconClipboard className="h-3.5 w-3.5" /> Ver todo
          </button>
        </div>
        <ActividadFeed limit={6} sinTitulo />
      </section>

      {/* Cerrar a mano lo que el profesional no cerró. No se sobrescribe su
          fichaje: la hora que se ponga aquí queda registrada como corrección
          de coordinación, con quién la hizo y por qué. */}
      {cerrando && (
        <TiempoTrabajadoModal
          titulo={`Cerrar ${cerrando.codigo} a mano`}
          explicacion={`${cerrando.persona ? `${cerrando.persona.nombre} ${cerrando.persona.apellidos}` : cerrando.codigo}. La entrada se fichó a las ${cerrando.horaInicioReal ? new Date(cerrando.horaInicioReal).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—"} y nadie cerró la salida. Confirma a qué hora terminó de verdad: quedará como cierre de coordinación, no como fichaje del profesional.`}
          etiquetaConfirmar="Cerrar la jornada"
          horaInicioProg={cerrando.horaInicioReal ? new Date(cerrando.horaInicioReal).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : null}
          conObservacion
          onConfirmar={async ({ horaFin, observacion }) => {
            await api.post(
              `/visitas/${cerrando.id}/cerrar-manual`,
              { horaFin, motivo: observacion || "El profesional no fichó la salida" },
              token,
            );
            await cargarPropios();
            onCambiado?.();
          }}
          onClose={() => setCerrando(null)}
        />
      )}
    </div>
  );
}
