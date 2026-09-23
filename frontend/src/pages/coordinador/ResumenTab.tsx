import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { ActividadFeed } from "./ActividadTab.js";
import { CargaTrabajo } from "./CargaTrabajo.js";
import { Cronometro, horasTrabajadas } from "../../components/Cronometro.js";
import { Novedades } from "../../components/Novedades.js";
import { Avatar } from "../../components/Avatar.js";
import { infoMotivo } from "../../lib/incidencias.js";
import { IconActivity as IconActividad } from "../../components/icons.js";
import { INFO_PRIORIDAD, calcularPendientes, hace, type Asunto } from "../../lib/pendientes.js";
import { compararConAcordado, duracion, euros, minutosEntre, minutosFichados, conMayusculaInicial } from "../../lib/economia.js";
import { IconAlert, IconArrowDown, IconArrowUp, IconBriefcase, IconCalendar, IconCheck, IconClipboard, IconClock, IconReceipt, IconRefresh, IconShield, IconUsers } from "../../components/icons.js";
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
// La hoja de la marca, en la esquina y apenas insinuada: identidad sin
// quitarle sitio a ningún dato.
function Hojas() {
  return (
    <svg viewBox="0 0 120 80" className="pointer-events-none absolute -right-4 -top-6 h-28 w-auto opacity-[0.13] sm:h-40" aria-hidden>
      <path fill="#1b8b7a" d="M58 6C34 6 14 20 10 42c-2 11 3 21 11 26 0-18 10-34 28-44-14 12-22 27-23 46 18 2 33-7 38-22 4-13 4-29-6-42Z" />
      <path fill="#5bceaa" d="M96 20c-18 0-32 10-35 26-2 8 2 15 8 19 0-13 8-25 21-32-11 9-17 20-17 34 13 2 24-5 28-16 3-9 3-21-5-31Z" />
    </svg>
  );
}

// El sol del saludo de la maqueta. Va como icono y no como emoji: un emoji
// se ve de una forma en cada sistema y aquí tiene que verse igual siempre.
function IconSol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

// La casilla de la cabecera: el icono en su círculo, el número grande, lo que
// cuenta y el enlace a donde se resuelve. Los cuatro tintes son los de la
// maqueta y siempre el mismo tinte para el mismo tipo de cifra.
const TINTES = {
  rose: { caja: "bg-rose-50/70 border-rose-100", icono: "bg-rose-100 text-rose-500", numero: "text-rose-600" },
  amber: { caja: "bg-amber-50/70 border-amber-100", icono: "bg-amber-100 text-amber-600", numero: "text-amber-600" },
  verde: { caja: "bg-brand-green-50 border-brand-green-100", icono: "bg-brand-green-100 text-brand-green-600", numero: "text-brand-green-700" },
  azul: { caja: "bg-brand-50 border-brand-100", icono: "bg-brand-100 text-brand-600", numero: "text-brand-800" },
} as const;

function Casilla({
  tono,
  valor,
  titulo,
  enlace,
  Icono,
  onClick,
}: {
  tono: keyof typeof TINTES;
  valor: number;
  titulo: string;
  enlace: string;
  Icono: (p: { className?: string }) => JSX.Element;
  onClick: () => void;
}) {
  const t = TINTES[tono];
  return (
    <button onClick={onClick} className={`rounded-tarjeta border p-3 text-left transition hover:brightness-[0.98] sm:p-3.5 ${t.caja}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full sm:h-9 sm:w-9 ${t.icono}`}>
        <Icono className="h-4 w-4" />
      </span>
      <p className={`mt-2 text-2xl font-semibold leading-none tabular-nums sm:mt-2.5 sm:text-3xl ${t.numero}`}>{valor}</p>
      <p className="mt-1 text-xs font-medium leading-snug text-slate-600 sm:mt-1.5">{titulo}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-400">{enlace} →</p>
    </button>
  );
}

// Una cifra del resumen económico, con su tinte y su flecha de tendencia.
function Cifra({ etiqueta, valor, tono, delta }: { etiqueta: string; valor: string; tono: keyof typeof TINTES; delta?: number | null }) {
  const t = TINTES[tono];
  return (
    <div className={`rounded-lg border p-2.5 ${t.caja}`}>
      <p className="truncate text-[11px] text-slate-500">{etiqueta}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800">{valor}</p>
      {delta != null && (
        <p className={`mt-0.5 flex items-center gap-0.5 text-[11px] font-medium ${delta >= 0 ? "text-brand-green-600" : "text-amber-600"}`}>
          {delta >= 0 ? <IconArrowUp className="h-3 w-3" /> : <IconArrowDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(0)}%
        </p>
      )}
    </div>
  );
}

// La rosquilla de cobertura. Es un círculo con el trazo recortado: no hace
// falta una librería de gráficos para una cifra.
function Rosquilla({ porcentaje }: { porcentaje: number }) {
  const radio = 30;
  const vuelta = 2 * Math.PI * radio;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={radio} fill="none" stroke="#e2e8f0" strokeWidth="9" />
        <circle
          cx="40"
          cy="40"
          r={radio}
          fill="none"
          stroke="#1b8b7a"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(porcentaje / 100) * vuelta} ${vuelta}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-brand-900">{porcentaje}%</span>
    </div>
  );
}

// El cuadradito con la marca de visto de "Próximas acciones".
function IconCheckCuadro({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

// Cómo se llama el caso de una incidencia: la persona a la que se atiende, que
// es por quien se pregunta, no el código del ticket.
function nombreDeIncidencia(i: Incidencia): string {
  const s = i.servicio ?? i.visita?.servicio;
  const p = s?.solicitud?.persona;
  return p ? `${p.nombre} ${p.apellidos}` : i.codigo;
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


  // Las jornadas de hoy que están en marcha o a punto: es lo que la maqueta
  // llama "servicios en curso" y responde a "¿qué está pasando ahora mismo?".
  const porEmpezarHoy = agendaHoy.filter(({ visita }) => !visita.horaInicioReal && !["REVISADA", "FINALIZADA", "CANCELADA", "NO_PRESENTADO", "FALTA_PROFESIONAL"].includes(visita.estado));
  const enCursoAhora = [...enMarcha, ...porEmpezarHoy];

  // Cobertura de hoy: de las jornadas del día, cuántas tienen a alguien que
  // ya ha confirmado, cuántas están asignadas sin confirmar y cuántas no
  // tienen a nadie.
  const coberturaHoy = useMemo(() => {
    let cubiertos = 0;
    let sinConfirmar = 0;
    let sinCubrir = 0;
    for (const { visita, servicio } of agendaHoy) {
      const quien = visita.profesionalId ?? servicio.profesionalId;
      if (!quien) sinCubrir += 1;
      else if (servicio.estado === "ASIGNADO") sinConfirmar += 1;
      else cubiertos += 1;
    }
    const total = agendaHoy.length;
    return { cubiertos, sinConfirmar, sinCubrir, total, porcentaje: total === 0 ? 100 : Math.round((cubiertos / total) * 100) };
  }, [agendaHoy]);

  // En qué punto están los servicios vivos. Cada fila lleva al listado ya
  // filtrado: la cifra no se queda en cifra.
  const estadoServicios = useMemo(() => {
    const cuenta = (estados: string[]) => servicios.filter((s) => estados.includes(s.estado)).length;
    return [
      { clave: "en_curso", etiqueta: "En curso", valor: cuenta(["EN_CURSO"]), punto: "bg-brand-green-500", filtro: "en_curso" },
      { clave: "confirmados", etiqueta: "Programados", valor: cuenta(["CONFIRMADO"]), punto: "bg-brand-400", filtro: "en_curso" },
      { clave: "pendientes", etiqueta: "Buscando profesional", valor: cuenta(["PENDIENTE", "ASIGNADO"]), punto: "bg-amber-400", filtro: "buscando" },
      { clave: "por_verificar", etiqueta: "Por verificar", valor: visitasPorVerificar.length, punto: "bg-orange-400", filtro: "por_verificar" },
      { clave: "finalizados", etiqueta: "Finalizados", valor: cuenta(["FINALIZADO", "VALIDADO", "CERRADO"]), punto: "bg-slate-300", filtro: "finalizada" },
    ];
  }, [servicios, visitasPorVerificar]);

  // Lo que queda por hacer después de lo que ya sale en la bandeja: la lista
  // corta de "y luego esto".
  const proximasAcciones = pendientes.slice(6, 11);

  function irAsunto(a: Asunto) {
    if (a.destino.tipo === "solicitud") onAbrirSolicitud(a.destino.id);
    else if (a.destino.tipo === "incidencia") onAbrirIncidencia(a.destino.id);
    else if (a.destino.tipo === "persona") onAbrirPersona(a.destino.id);
    else onIrA(a.destino.tab, undefined, a.destino.foco);
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {/* Dos columnas: a la izquierda lo que se hace, a la derecha cómo va.
          Es la distribución de la maqueta y la que sigue el día: se trabaja
          en la columna ancha y se comprueba en la estrecha. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-4">
          {/* ---------------------------------------------------------------
              Mi día
              --------------------------------------------------------------- */}
          <section className="tarjeta relative overflow-hidden p-4 sm:p-5">
            <Hojas />
            <header className="relative flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-900 sm:text-2xl">
                  {saludo()}
                  {nombre ? `, ${conMayusculaInicial(nombre.split(" ")[0])}` : ""}
                  <IconSol className="h-6 w-6 text-amber-400" aria-hidden />
                </h2>
                <p className="mt-1 text-sm leading-snug text-slate-500">Aquí tienes un resumen de lo más importante de hoy.</p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="text-sm text-slate-500">
                  {conMayusculaInicial(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium tabular-nums text-slate-700 sm:justify-end">
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

            <div className="relative mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Casilla tono="rose" valor={criticos.length} titulo={criticos.length === 1 ? "Asunto urgente" : "Asuntos urgentes"} Icono={IconAlert} enlace="Ver detalles" onClick={() => onIrA("bandeja")} />
              <Casilla tono="amber" valor={pendientes.length} titulo={pendientes.length === 1 ? "Pendiente" : "Pendientes"} Icono={IconClipboard} enlace="Ver detalles" onClick={() => onIrA("bandeja")} />
              <Casilla tono="verde" valor={agendaHoy.length} titulo={agendaHoy.length === 1 ? "Visita hoy" : "Visitas hoy"} Icono={IconCalendar} enlace="Ver calendario" onClick={() => onIrA("calendario")} />
              <Casilla tono="azul" valor={profesionalesActivos} titulo={profesionalesActivos === 1 ? "Profesional activo" : "Profesionales activos"} Icono={IconUsers} enlace="Ver listado" onClick={() => onIrA("profesionales")} />
            </div>
          </section>

          {/* Lo que la aplicación ha detectado y todavía no es una tarea con
              nombre: va en una fila de chips, no en cuatro tarjetas. */}
          {avisos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {avisos.map((a) => (
                <button
                  key={a.clave}
                  onClick={a.onClick}
                  title={a.detalle}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:brightness-[0.97] ${
                    a.tono === "rose" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  <a.icon className={`h-3.5 w-3.5 shrink-0 ${a.tono === "rose" ? "text-rose-500" : "text-amber-500"}`} />
                  <span>
                    <span className="font-semibold">{a.valor}</span> {a.valor === 1 ? a.singular : a.plural}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Jornadas que siguen abiertas: se fichó la entrada y nunca la
              salida. Si se descubre al facturar, ya se ha cobrado mal. */}
          {abiertas.length > 0 && (
            <section className="rounded-tarjeta border border-orange-200 bg-orange-50 p-3">
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
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700">{a.persona ? `${a.persona.nombre} ${a.persona.apellidos}` : a.codigo}</span>
                      {a.profesional && <span className="text-slate-500"> · {a.profesional.nombre} {a.profesional.apellidos}</span>}
                      <span className="block text-[11px] text-orange-700">
                        Abierta desde hace {Math.floor((a.minutosAbierta ?? 0) / 60)} h {(a.minutosAbierta ?? 0) % 60} min
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {a.profesional?.telefono && (
                        <a href={`tel:${a.profesional.telefono}`} className="boton-secundario-sm">
                          Llamar
                        </a>
                      )}
                      <button onClick={() => setCerrando(a)} className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-orange-700">
                        Cerrar a mano
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---------------------------------------------------------------
              Bandeja de trabajo. Una tabla de prioridad, asunto, persona,
              cuándo y una acción por fila: es la pregunta "¿qué tengo que
              hacer?" y su respuesta, sin deducirla de cuatro bloques sueltos.
              --------------------------------------------------------------- */}
          <section className="tarjeta overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <IconClipboard className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-brand-900">Bandeja de trabajo</h3>
                  <p className="text-xs text-slate-500">Tareas que requieren tu atención hoy.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{pendientes.length === 0 ? "nada pendiente" : `${pendientes.length} pendientes`}</span>
                <button onClick={() => onIrA("bandeja")} className="boton-verde px-3.5 py-2 text-xs">
                  Ver todas
                </button>
              </div>
            </div>

            {pendientes.length === 0 ? (
              <p className="px-4 pb-6 text-center text-sm text-slate-400">No queda nada esperando una decisión tuya.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Prioridad</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5">Persona / Servicio</th>
                      <th className="px-4 py-2.5">Cuándo</th>
                      <th className="px-4 py-2.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendientes.slice(0, 6).map((a) => {
                      const info = INFO_PRIORIDAD[a.prioridad];
                      return (
                        <tr key={a.id} className="transition hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <span className={`pastilla ${info.fondo} ${info.texto}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${info.punto}`} aria-hidden />
                              {info.etiqueta}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => irAsunto(a)} className="text-left">
                              <span className="block font-medium text-slate-800 hover:underline">{a.tipo}</span>
                              <span className="block max-w-[16rem] truncate text-xs text-slate-400">{a.detalle}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className="block text-slate-700">{a.persona}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{a.desde > 0 ? `hace ${hace(a.desde)}` : "—"}</td>
                          <td className="px-4 py-3 text-right">
                            {/* Lo crítico lleva el botón lleno y lo demás el
                                de contorno: en una lista de veinte, el ojo
                                tiene que saber por cuál empezar. */}
                            <button onClick={() => irAsunto(a)} className={a.prioridad === "critico" ? "boton-principal-sm" : "boton-secundario-sm"}>
                              {a.accion}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---------------------------------------------------------------
              Agenda de hoy
              --------------------------------------------------------------- */}
          <section className="tarjeta overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <IconCalendar className="h-4 w-4" />
                </span>
                <h3 className="text-base font-semibold text-brand-900">Agenda de hoy</h3>
              </div>
              <button onClick={() => onIrA("calendario")} className="boton-secundario-sm">
                Ver calendario
              </button>
            </div>

            {/* Por qué mirar la agenda. Cada pestaña lleva al calendario con
                esa vista puesta: aquí sólo cabe el día. */}
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              <span className="rounded-full bg-brand-green-500 px-3.5 py-1.5 text-xs font-semibold text-white">Día</span>
              {["Semana", "Profesional", "Persona", "Zona"].map((v) => (
                <button
                  key={v}
                  onClick={() => onIrA("calendario")}
                  className="rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  {v}
                </button>
              ))}
            </div>

            {agendaHoy.length === 0 ? (
              <p className="px-4 pb-6 text-center text-sm text-slate-400">No hay ninguna visita programada para hoy.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {agendaHoy.map(({ visita, servicio }) => {
                  const enCurso = !!visita.horaInicioReal && !visita.horaFinReal;
                  const retrasada = retrasadas.some((r) => r.visita.id === visita.id);
                  const solicitudId = servicio.solicitud?.id;
                  const noPresentado = retrasada && !!visita.horaInicioProg && minutosDesde(visita.horaInicioProg, ahora) > MARGEN_NO_PRESENTADO;
                  const minutos = minutosEntre(visita.horaInicioProg, visita.horaFinProg);
                  return (
                    <li key={visita.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                      <span className={`w-11 shrink-0 text-xs font-semibold tabular-nums ${retrasada ? "text-rose-600" : "text-slate-500"}`}>
                        {visita.horaInicioProg ?? "--:--"}
                      </span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          enCurso ? "bg-brand-green-500" : retrasada ? "bg-rose-500" : visita.estado === "REVISADA" ? "bg-slate-300" : "bg-brand-300"
                        }`}
                        aria-hidden
                      />
                      <button onClick={() => solicitudId && onAbrirSolicitud(solicitudId)} disabled={!solicitudId} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-slate-800 hover:underline">{nombrePersona(servicio)}</p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-400">
                          <IconoNecesidad codigo={servicio.solicitud?.necesidad.codigo} className="h-3.5 w-3.5 shrink-0" />
                          {servicio.solicitud?.necesidad.nombre}
                          {minutos != null && ` · ${duracion(minutos)}`}
                        </p>
                      </button>

                      {/* Quién va. En la maqueta es la cara; aquí, la cara si
                          la hay y las iniciales si no. */}
                      {visita.profesional && (
                        <span className="hidden shrink-0 items-center gap-2 sm:flex">
                          <Avatar foto={visita.profesional.foto} nombre={visita.profesional.nombre} apellidos={visita.profesional.apellidos} className="h-8 w-8" />
                          <span className="leading-tight">
                            <span className="block text-xs font-medium text-slate-700">
                              {visita.profesional.nombre} {visita.profesional.apellidos}
                            </span>
                            <span className="block text-[11px] text-slate-400">Profesional</span>
                          </span>
                        </span>
                      )}

                      <div className="flex shrink-0 items-center gap-1.5">
                        {enCurso ? (
                          <Cronometro inicio={visita.horaInicioReal} fin={visita.horaFinReal} />
                        ) : visita.estado === "FINALIZADA" ? (
                          <button onClick={() => onIrA("verificacion", undefined, visita.id)} className="pastilla bg-orange-100 text-orange-700 transition hover:bg-orange-200">
                            Verificar
                          </button>
                        ) : visita.estado === "REVISADA" ? (
                          <span className="pastilla bg-brand-green-50 text-brand-green-700">
                            <IconCheck className="h-3 w-3" /> Verificada
                          </span>
                        ) : visita.estado === "FALTA_PROFESIONAL" ? (
                          <span className="pastilla bg-rose-200 text-rose-800">No fue nadie</span>
                        ) : noPresentado ? (
                          <>
                            <span className="pastilla bg-rose-100 text-rose-700">Nadie ha fichado</span>
                            <button
                              onClick={() => setFaltaProfesional({ visitaId: visita.id, codigo: visita.codigo, persona: nombrePersona(servicio) })}
                              className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                            >
                              No fue nadie
                            </button>
                            <button
                              onClick={() => setIncidenciaFichaje({ visita, servicio })}
                              title="Abrir una incidencia de fichaje"
                              className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                            >
                              <IconAlert className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : retrasada ? (
                          <span className="pastilla bg-amber-100 text-amber-700">Sin empezar</span>
                        ) : (
                          <span className="pastilla bg-slate-100 text-slate-500">Programada</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------------------------------------------------------------
              El trío de abajo: cobertura, qué se pide y en qué estado está
              --------------------------------------------------------------- */}
          <div className="grid gap-4 md:grid-cols-3">
            <section className="tarjeta p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                <IconShield className="h-4 w-4 text-slate-400" /> Cobertura de hoy
              </h3>
              <div className="flex items-center gap-4">
                <Rosquilla porcentaje={coberturaHoy.porcentaje} />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-800">
                    {coberturaHoy.cubiertos} / {coberturaHoy.total} servicios
                  </p>
                  <p className="text-xs text-slate-500">cubiertos</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li className="flex items-center gap-1.5 text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-green-500" aria-hidden /> Cubiertos
                      <span className="ml-auto font-semibold tabular-nums text-slate-700">{coberturaHoy.cubiertos}</span>
                    </li>
                    <li className="flex items-center gap-1.5 text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden /> Sin confirmar
                      <span className="ml-auto font-semibold tabular-nums text-slate-700">{coberturaHoy.sinConfirmar}</span>
                    </li>
                    <li className="flex items-center gap-1.5 text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden /> Sin cubrir
                      <span className="ml-auto font-semibold tabular-nums text-slate-700">{coberturaHoy.sinCubrir}</span>
                    </li>
                  </ul>
                </div>
              </div>
              <button onClick={() => onIrA("cobertura")} className="mt-3 text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver detalle →
              </button>
            </section>

            <section className="tarjeta p-4">
              <h3 className="mb-3 text-sm font-semibold text-brand-900">
                Servicios por tipo <span className="font-normal text-slate-400">(todos)</span>
              </h3>
              {distribucionNecesidad.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">Todavía no hay solicitudes.</p>
              ) : (
                <ul className="space-y-2">
                  {distribucionNecesidad.map((d) => (
                    <li key={d.codigo}>
                      <button onClick={() => onIrA("solicitudes")} className="flex w-full items-center gap-2 text-left text-xs">
                        <IconoNecesidad codigo={d.codigo} className="h-3.5 w-3.5 shrink-0 text-brand-green-500" />
                        <span className="min-w-0 flex-1 truncate text-slate-600">{d.nombre}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">{d.valor}</span>
                      </button>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-brand-green-400" style={{ width: `${(d.valor / maxDistribucion) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tarjeta p-4">
              <h3 className="mb-3 text-sm font-semibold text-brand-900">Estado de servicios</h3>
              <ul className="space-y-2 text-xs">
                {estadoServicios.map((e) => (
                  <li key={e.clave}>
                    <button onClick={() => onIrA("solicitudes", e.filtro)} className="flex w-full items-center gap-2 text-left">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${e.punto}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-slate-600">{e.etiqueta}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-800">{e.valor}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={() => onIrA("solicitudes")} className="mt-3 text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver todos →
              </button>
            </section>
          </div>

          <CargaTrabajo solicitudes={solicitudes} />

          <section className="tarjeta p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                <IconActividad className="h-4 w-4 text-slate-400" /> Actividad reciente
              </h3>
              <button onClick={() => onIrA("actividad")} className="shrink-0 text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver todo →
              </button>
            </div>
            <ActividadFeed limit={6} sinTitulo />
          </section>
        </div>

        {/* -------------------------------------------------------------------
            La columna de la derecha: cómo va todo mientras se trabaja
            ------------------------------------------------------------------- */}
        <div className="min-w-0 space-y-4">
          <section className="tarjeta overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                <IconBriefcase className="h-4 w-4 text-slate-400" /> Servicios en curso
              </h3>
              <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-brand-green-50 px-1.5 text-xs font-semibold text-brand-green-700">
                {enMarcha.length + porEmpezarHoy.length}
              </span>
            </div>
            {enCursoAhora.length === 0 ? (
              <p className="px-4 pb-5 text-center text-xs text-slate-400">Ahora mismo no hay ninguna jornada en marcha.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {enCursoAhora.slice(0, 4).map(({ visita, servicio }) => (
                  <li key={visita.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar
                      foto={visita.profesional?.foto}
                      nombre={servicio.solicitud?.persona.nombre ?? "?"}
                      apellidos={servicio.solicitud?.persona.apellidos}
                      className="h-9 w-9"
                    />
                    <button
                      onClick={() => servicio.solicitud?.id && onAbrirSolicitud(servicio.solicitud.id)}
                      className="min-w-0 flex-1 text-left leading-tight"
                    >
                      <span className="block truncate text-sm font-medium text-slate-800 hover:underline">{nombrePersona(servicio)}</span>
                      <span className="block truncate text-xs text-slate-400">{servicio.solicitud?.necesidad.nombre}</span>
                      <span className="block text-xs tabular-nums text-slate-400">
                        {visita.horaInicioProg ?? "--:--"} – {visita.horaFinProg ?? "--:--"}
                      </span>
                    </button>
                    <span className="pastilla shrink-0 bg-brand-green-50 text-brand-green-700">
                      {visita.horaInicioReal && !visita.horaFinReal ? "En curso" : "Hoy"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => onIrA("calendario")} className="block w-full px-4 pb-3 pt-1 text-left text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
              Ver todos →
            </button>
          </section>

          <section className="tarjeta p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                  <IconReceipt className="h-4 w-4 shrink-0 text-slate-400" /> Resumen económico
                </h3>
                <p className="ml-[22px] text-[11px] text-slate-400">este mes</p>
              </div>
              <button onClick={() => onIrA("facturacion")} className="shrink-0 text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver detalle →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Cifra etiqueta="Facturado" valor={euros(totalFacturadoMes)} tono="azul" />
              <Cifra etiqueta="Cobrado" valor={euros(totalFacturadoMes - pendienteCobroMes)} tono="verde" />
              <Cifra etiqueta="Pendiente" valor={euros(pendienteCobroMes)} tono={pendienteCobroMes > 0 ? "rose" : "azul"} />
              <Cifra etiqueta="Comisión CUIDA" valor={euros(comisionMes)} tono="azul" delta={deltaComision} />
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5 text-xs">
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

          <section className="tarjeta overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                <IconAlert className="h-4 w-4 text-slate-400" /> Incidencias
                {incidenciasAbiertas.length > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700">
                    {incidenciasAbiertas.length}
                  </span>
                )}
              </h3>
              <button onClick={() => onIrA("incidencias")} className="shrink-0 text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver todas →
              </button>
            </div>
            {incidenciasAbiertas.length === 0 ? (
              <p className="px-4 pb-5 text-center text-xs text-slate-400">Ninguna incidencia abierta.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {incidenciasAbiertas.slice(0, 4).map((i) => (
                  <li key={i.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.prioridad === "ALTA" ? "bg-rose-500" : i.prioridad === "MEDIA" ? "bg-amber-400" : "bg-slate-300"}`} aria-hidden />
                    <button onClick={() => onAbrirIncidencia(i.id)} className="min-w-0 flex-1 text-left leading-tight">
                      <span className="block truncate text-sm font-medium text-slate-800 hover:underline">{infoMotivo(i.motivo).etiqueta}</span>
                      <span className="block truncate text-xs text-slate-500">{nombreDeIncidencia(i)}</span>
                      <span className="block text-[11px] text-slate-400">{i.createdAt ? `hace ${hace(Math.round((ahora - new Date(i.createdAt).getTime()) / 60000))}` : ""}</span>
                    </button>
                    <span
                      className={`pastilla shrink-0 ${
                        i.prioridad === "ALTA" ? "bg-rose-100 text-rose-700" : i.prioridad === "MEDIA" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {conMayusculaInicial(i.prioridad.toLowerCase())}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* El recordatorio de para qué es todo esto. No es relleno: al lado
              de las cifras del mes, es lo que las cifras significan. */}
          <section className="relative overflow-hidden rounded-tarjeta bg-gradient-to-br from-brand-green-50 to-brand-50 p-5">
            <Hojas />
            <h3 className="relative text-xl font-semibold leading-tight text-brand-900">
              Cada visita
              <br />
              cuenta
            </h3>
            <p className="relative mt-1.5 text-sm text-slate-600">El bienestar de cada persona está en tus manos.</p>
            <button onClick={() => onIrA("calendario")} className="boton-verde relative mt-3 px-4 py-2 text-xs">
              Ver calendario
            </button>
          </section>

          <section className="tarjeta overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                <IconCheckCuadro className="h-4 w-4 text-slate-400" /> Próximas acciones
                {proximasAcciones.length > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
                    {proximasAcciones.length}
                  </span>
                )}
              </h3>
              <button onClick={() => onIrA("bandeja")} className="shrink-0 text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver todas →
              </button>
            </div>
            {proximasAcciones.length === 0 ? (
              <p className="px-4 pb-5 text-center text-xs text-slate-400">Nada más en la lista.</p>
            ) : (
              <ul className="space-y-0.5 px-2 pb-3">
                {proximasAcciones.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => irAsunto(a)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50">
                      <IconCheckCuadro className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-400" aria-hidden />
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-xs font-medium text-slate-700">
                          {a.accion} <span className="font-normal text-slate-400">— {a.persona}</span>
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">{a.detalle}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Novedades
            onAbrir={(tipo, id) => {
              if (tipo === "Solicitud") onAbrirSolicitud(id);
              if (tipo === "Incidencia") onAbrirIncidencia(id);
            }}
          />
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
