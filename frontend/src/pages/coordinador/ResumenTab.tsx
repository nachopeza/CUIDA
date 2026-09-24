import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Cronometro } from "../../components/Cronometro.js";
import { Avatar } from "../../components/Avatar.js";
import { infoMotivo } from "../../lib/incidencias.js";
import { INFO_PRIORIDAD, calcularPendientes, type Asunto } from "../../lib/pendientes.js";
import { duracion, euros, minutosEntre, conMayusculaInicial } from "../../lib/economia.js";
import { IconAlert, IconArrowDown, IconArrowUp, IconBriefcase, IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconClipboard, IconClock, IconPin, IconReceipt, IconRefresh, IconShield, IconUsers } from "../../components/icons.js";
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

// La casilla de la cabecera, tal como está en la maqueta: el icono en su
// círculo y el número A SU LADO, en la misma línea; debajo, lo que cuenta —en
// el color de la casilla, no en gris— y el enlace a donde se resuelve.
//
// Los cuatro tintes están muestreados de la propia imagen, y el fondo es un
// degradado de la esquina de arriba al blanco, no un color plano.
const TINTES = {
  rose: {
    caja: "from-[#fff1f1] to-white",
    icono: "bg-[#ffdfe1] text-[#d4415a]",
    numero: "text-[#ac2633]",
    etiqueta: "text-[#86181b]",
  },
  amber: {
    caja: "from-[#fff6e6] to-white",
    icono: "bg-[#ffeed2] text-[#e1820e]",
    numero: "text-[#e1820e]",
    etiqueta: "text-[#653b15]",
  },
  verde: {
    caja: "from-[#eafaf4] to-white",
    icono: "bg-[#dbf3eb] text-[#0b5f55]",
    numero: "text-[#0b5f55]",
    etiqueta: "text-[#0b3338]",
  },
  azul: {
    caja: "from-[#e9f4fd] to-white",
    icono: "bg-[#dceefc] text-[#0c5770]",
    numero: "text-[#0c5770]",
    etiqueta: "text-[#002033]",
  },
} as const;

// Los puntos de "Servicios por tipo". Se reparten por orden, no por tipo:
// el color aquí sólo separa una fila de la siguiente.
const COLORES_TIPO = ["bg-brand-600", "bg-rose-500", "bg-rose-300", "bg-brand-green-500", "bg-rose-200"] as const;

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
    <button
      onClick={onClick}
      className={`flex h-full flex-col rounded-tarjeta bg-gradient-to-br p-4 text-left transition hover:brightness-[0.98] ${t.caja}`}
    >
      <span className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${t.icono}`}>
          <Icono className="h-5 w-5" />
        </span>
        <span className={`text-[2rem] font-bold leading-none tabular-nums ${t.numero}`}>{valor}</span>
      </span>
      <span className={`mt-3 text-sm font-semibold leading-snug ${t.etiqueta}`}>{titulo}</span>
      {/* El enlace no va en el color de la casilla: es el mismo gris azulado
          en las cuatro, para que no compita con la cifra. */}
      <span className="mt-auto pt-2 text-xs font-medium text-[#396377]">{enlace} →</span>
    </button>
  );
}

// Una cifra del resumen económico, con su tinte y su flecha de tendencia.
//
// `subirEsBueno` no es un detalle de color: que suba lo facturado es una buena
// noticia y que suba lo pendiente de cobro es la contraria. Pintar las dos de
// verde porque las dos suben sería mentir con un icono.
function Cifra({
  etiqueta,
  valor,
  tono,
  delta,
  subirEsBueno = true,
}: {
  etiqueta: string;
  valor: string;
  tono: keyof typeof TINTES;
  delta?: number | null;
  subirEsBueno?: boolean;
}) {
  const t = TINTES[tono];
  const bien = delta == null ? true : delta >= 0 === subirEsBueno;
  return (
    <div className={`rounded-lg bg-gradient-to-br p-2 ${t.caja}`}>
      <p className={`text-[10px] font-medium leading-tight ${t.numero}`}>{etiqueta}</p>
      <p className="mt-1 truncate text-[13px] font-bold tabular-nums text-brand-900">{valor}</p>
      {delta != null && (
        <p className={`mt-0.5 flex items-center gap-0.5 text-[11px] font-medium ${bien ? "text-brand-green-600" : "text-rose-500"}`}>
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
    <div className="relative h-[5.5rem] w-[5.5rem] shrink-0">
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

// Cuándo pasó algo, dicho como se dice en voz alta: "Hoy · 09:00", "Ayer ·
// 11:30" y, más atrás, la fecha corta. "hace 19 h" obliga a hacer la cuenta.
function cuandoPaso(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hhmm = d.toTimeString().slice(0, 5);
  const hoy = new Date();
  const clave = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const desplazado = (delta: number) => clave(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + delta));
  if (clave(d) === desplazado(0)) return `Hoy · ${hhmm}`;
  if (clave(d) === desplazado(-1)) return `Ayer · ${hhmm}`;
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${hhmm}`;
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
  // Qué día enseña la agenda. Arranca en hoy —es lo que se mira el 95 % de
  // las veces— pero las flechas dejan asomarse a mañana sin salir de aquí,
  // que es justo lo que se hace a media mañana para ver si el día siguiente
  // está cubierto.
  const [diaAgenda, setDiaAgenda] = useState(() => iso(new Date()));
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

  // La agenda de hoy manda en los contadores —lo urgente es de hoy—; esta
  // otra es sólo la lista que se está mirando.
  const agendaDelDia = useMemo(
    () =>
      todasLasVisitas
        .filter(({ visita }) => visita.fecha.slice(0, 10) === diaAgenda)
        .sort((a, b) => (a.visita.horaInicioProg ?? "99:99").localeCompare(b.visita.horaInicioProg ?? "99:99")),
    [todasLasVisitas, diaAgenda],
  );
  const esHoy = diaAgenda === hoyISO;

  function moverDia(delta: number) {
    const [a, m, d] = diaAgenda.split("-").map(Number);
    setDiaAgenda(iso(new Date(a, m - 1, d + delta)));
  }

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

  const visitasPorVerificar = useMemo(
    () => todasLasVisitas.filter(({ visita }) => visita.estado === "FINALIZADA"),
    [todasLasVisitas],
  );


  const cancelacionesPendientes = incidencias.filter((i) => i.tipo === "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));
  const incidenciasAbiertas = incidencias.filter((i) => i.tipo !== "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));


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

  // Las tres cifras del mes pasado, para poder decir si esto sube o baja. Un
  // importe sin con qué compararlo no informa de nada.
  const mesPasado = useMemo(() => {
    const previas = facturas.filter((f) => f.mes === mesAnterior);
    const facturado = previas.reduce((acc, f) => acc + Number(f.totalConIva ?? f.importeTotal), 0);
    const pendiente = previas.filter((f) => f.estado !== "PAGADA").reduce((acc, f) => acc + Number(f.totalConIva ?? f.importeTotal), 0);
    return { facturado, pendiente, cobrado: facturado - pendiente };
  }, [facturas, mesAnterior]);
  const variacion = (ahoraV: number, antes: number) => (antes > 0 ? ((ahoraV - antes) / antes) * 100 : null);
  const deltaFacturado = variacion(totalFacturadoMes, mesPasado.facturado);
  const deltaCobrado = variacion(totalFacturadoMes - pendienteCobroMes, mesPasado.cobrado);
  const deltaPendiente = variacion(pendienteCobroMes, mesPasado.pendiente);

  const profesionalesActivos = profesionales.filter((p) => p.estado === "ACTIVO").length;
  const profesionalesOcupados = useMemo(
    () => new Set(servicios.filter((s) => ["CONFIRMADO", "EN_CURSO"].includes(s.estado) && s.profesionalId).map((s) => s.profesionalId as string)).size,
    [servicios],
  );

  // Qué se hace hoy, por tipo. Cuenta las jornadas del día, no el histórico
  // de solicitudes: es la cifra que tiene que cuadrar con "visitas hoy".
  const distribucionNecesidad = useMemo(() => {
    const conteo = new Map<string, { nombre: string; codigo: string; valor: number }>();
    for (const { servicio } of agendaHoy) {
      const n = servicio.solicitud?.necesidad;
      if (!n) continue;
      const actual = conteo.get(n.id) ?? { nombre: n.nombre, codigo: n.codigo, valor: 0 };
      actual.valor += 1;
      conteo.set(n.id, actual);
    }
    return Array.from(conteo.values())
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  }, [agendaHoy]);

  // Todo lo que requiere una decisión, con un único criterio de prioridad.
  // Antes cada bloque del escritorio decidía por su cuenta qué era urgente y
  // no había forma de saber por dónde empezar.
  const pendientes = useMemo(
    () => calcularPendientes({ solicitudes, servicios, incidencias, facturas, plantilla, personas, ausencias }),
    [solicitudes, servicios, incidencias, facturas, plantilla, personas, ausencias],
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22.5rem]">
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
                <table className="w-full min-w-[38rem] table-fixed text-sm">
                  <thead className="bg-[#f1f7fa] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {/* Anchos fijos: si una descripción larga empuja la
                        columna de la acción fuera de la tarjeta, el botón que
                        resuelve el asunto deja de verse. */}
                    <tr>
                      <th className="w-28 px-4 py-2.5">Prioridad</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5">Persona / Servicio</th>
                      <th className="w-24 px-4 py-2.5">Hora</th>
                      <th className="w-36 px-4 py-2.5 text-right">Acción</th>
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
                            <button onClick={() => irAsunto(a)} className="block w-full min-w-0 text-left">
                              <span className="block font-medium text-slate-800 hover:underline">{a.tipo}</span>
                              <span className="block truncate text-xs text-slate-400">{a.detalle}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {/* La persona y, debajo, de qué servicio se
                                trata: el nombre solo no distingue dos
                                servicios de la misma persona. */}
                            <span className="block truncate font-medium text-slate-800">{a.persona}</span>
                            {a.servicio && <span className="block truncate text-xs text-slate-400">{a.servicio}</span>}
                          </td>
                          {/* La hora a la que hay que estar, no cuánto lleva
                              esperando: eso ya lo dice el orden de la lista.
                              Lo crítico la lleva en rojo. */}
                          <td className={`whitespace-nowrap px-4 py-3 text-xs tabular-nums ${a.prioridad === "critico" ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                            {a.cuando ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {/* Lo crítico lleva el botón lleno y lo demás el
                                de contorno: en una lista de veinte, el ojo
                                tiene que saber por cuál empezar. */}
                            <button onClick={() => irAsunto(a)} className={`w-full justify-center ${a.prioridad === "critico" ? "boton-principal-sm" : "boton-secundario-sm"}`}>
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
                <h3 className="text-base font-semibold text-brand-900">
                  {esHoy ? "Agenda de hoy" : `Agenda del ${conMayusculaInicial(new Date(diaAgenda + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }))}`}
                </h3>
              </div>
              {/* "Hoy" y las dos flechas: asomarse a mañana y volver, sin
                  abandonar el escritorio. */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setDiaAgenda(hoyISO)}
                  disabled={esHoy}
                  className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Hoy
                </button>
                <button
                  onClick={() => moverDia(-1)}
                  aria-label="Día anterior"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <IconChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => moverDia(1)}
                  aria-label="Día siguiente"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <IconChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Por qué mirar la agenda, en un mando de pestañas: "Día" es lo
                que cabe aquí y las demás llevan al calendario con esa vista
                puesta. */}
            <div className="px-4 pb-3">
              <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-[#f1f7fa] p-1">
                <span className="shrink-0 rounded-full bg-brand-green-500 px-5 py-1.5 text-xs font-semibold text-white">Día</span>
                {["Semana", "Profesional", "Persona", "Zona"].map((v) => (
                  <button
                    key={v}
                    onClick={() => onIrA("calendario")}
                    className="shrink-0 border-l border-slate-200 px-5 py-1.5 text-xs font-medium text-slate-500 transition first:border-l-0 hover:text-slate-700"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {agendaDelDia.length === 0 ? (
              <p className="px-4 pb-6 text-center text-sm text-slate-400">
                {esHoy ? "No hay ninguna visita programada para hoy." : "Ese día no hay ninguna visita programada."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {agendaDelDia.map(({ visita, servicio }) => {
                  const enCurso = !!visita.horaInicioReal && !visita.horaFinReal;
                  const retrasada = retrasadas.some((r) => r.visita.id === visita.id);
                  const solicitudId = servicio.solicitud?.id;
                  const noPresentado = retrasada && !!visita.horaInicioProg && minutosDesde(visita.horaInicioProg, ahora) > MARGEN_NO_PRESENTADO;
                  const minutos = minutosEntre(visita.horaInicioProg, visita.horaFinProg);
                  const direccion = servicio.solicitud?.persona.direccion;
                  const quien = visita.profesional ?? servicio.profesional;
                  return (
                    <li
                      key={visita.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 lg:grid lg:grid-cols-[2.75rem_1.25rem_minmax(10rem,1fr)_8rem_minmax(6rem,auto)_10.5rem] lg:gap-x-3"
                    >
                      <span className={`w-11 shrink-0 text-xs font-semibold tabular-nums ${retrasada ? "text-rose-600" : "text-slate-500"}`}>
                        {visita.horaInicioProg ?? "--:--"}
                      </span>
                      {/* El punto de estado y, detrás, el carril del día: la
                          raya que separa la hora de lo que pasa a esa hora,
                          como en una escaleta. */}
                      <span className="flex shrink-0 items-center gap-3">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            enCurso ? "bg-brand-green-500" : retrasada ? "bg-rose-500" : visita.estado === "REVISADA" ? "bg-slate-300" : "bg-brand-300"
                          }`}
                          aria-hidden
                        />
                        <span className="hidden h-9 w-px shrink-0 bg-slate-100 sm:block" aria-hidden />
                      </span>

                      <button onClick={() => solicitudId && onAbrirSolicitud(solicitudId)} disabled={!solicitudId} className="min-w-[8rem] flex-1 text-left">
                        <p className="truncate text-sm font-medium text-slate-800 hover:underline">{nombrePersona(servicio)}</p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-400">
                          <IconoNecesidad codigo={servicio.solicitud?.necesidad.codigo} className="h-3.5 w-3.5 shrink-0" />
                          {servicio.solicitud?.necesidad.nombre}
                          {minutos != null && ` · ${duracion(minutos)}`}
                        </p>
                      </button>

                      {/* Dónde hay que ir. Sin la dirección, la agenda dice a
                          qué hora pero no adónde, y es la mitad del dato. */}
                      <span className="hidden min-w-0 items-center gap-1.5 text-xs text-slate-400 lg:flex">
                        <IconPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{direccion || "Sin dirección"}</span>
                      </span>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
                          <span className="pastilla bg-brand-50 text-brand-700">Programada</span>
                        )}
                      </div>

                      {/* Quién va. Si todavía no va nadie, se dice: un hueco
                          en blanco se lee como "ya está resuelto". */}
                      <span className="hidden min-w-0 shrink-0 items-center gap-2 sm:flex">
                        {quien ? (
                          <>
                            <Avatar foto={quien.foto} nombre={quien.nombre} apellidos={quien.apellidos} className="h-8 w-8" />
                            <span className="min-w-0 leading-tight">
                              <span className="block truncate text-xs font-medium text-slate-700">
                                {quien.nombre} {quien.apellidos}
                              </span>
                              <span className="block text-[11px] text-slate-400">Profesional</span>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400" aria-hidden>
                              <IconUsers className="h-4 w-4" />
                            </span>
                            <span className="leading-tight">
                              <span className="block text-xs font-medium text-slate-500">Pendiente</span>
                              <span className="block text-[11px] text-slate-400">Asignación</span>
                            </span>
                          </>
                        )}
                      </span>
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
              <div className="flex items-center gap-3">
                <Rosquilla porcentaje={coberturaHoy.porcentaje} />
                <p className="min-w-0 text-sm leading-snug text-slate-500">
                  <span className="font-semibold text-slate-800">
                    {coberturaHoy.cubiertos} / {coberturaHoy.total}
                  </span>{" "}
                  servicios
                  <br />
                  cubiertos
                </p>
              </div>
              {/* El desglose, en su recuadro: la rosquilla dice cuánto y esto
                  dice de qué. */}
              <ul className="mt-3 space-y-1.5 rounded-lg border border-slate-100 p-2.5 text-xs">
                <li className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-green-500" aria-hidden /> Cubiertos
                  <span className="ml-auto font-semibold tabular-nums text-slate-700">{coberturaHoy.cubiertos}</span>
                </li>
                <li className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden /> Pendientes
                  <span className="ml-auto font-semibold tabular-nums text-slate-700">{coberturaHoy.sinConfirmar}</span>
                </li>
                <li className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden /> Sin cubrir
                  <span className="ml-auto font-semibold tabular-nums text-slate-700">{coberturaHoy.sinCubrir}</span>
                </li>
              </ul>
              <button onClick={() => onIrA("cobertura")} className="mt-3 block w-full text-right text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver detalle →
              </button>
            </section>

            <section className="tarjeta p-4">
              <h3 className="mb-3 text-sm font-semibold text-brand-900">
                Servicios por tipo <span className="font-normal text-slate-400">(hoy)</span>
              </h3>
              {distribucionNecesidad.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">Hoy no hay ninguna visita programada.</p>
              ) : (
                <ul className="space-y-2.5">
                  {distribucionNecesidad.map((d, i) => (
                    <li key={d.codigo}>
                      <button onClick={() => onIrA("calendario")} className="flex w-full items-center gap-2.5 text-left text-xs">
                        {/* Un punto por tipo. La barra sobraba: al lado de la
                            cifra no añadía nada que la cifra no dijera. */}
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COLORES_TIPO[i % COLORES_TIPO.length]}`} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-slate-600">{d.nombre}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">{d.valor}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tarjeta p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                <IconClipboard className="h-4 w-4 text-slate-400" /> Estado de servicios
              </h3>
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
              <button onClick={() => onIrA("solicitudes")} className="mt-3 block w-full text-right text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver todos →
              </button>
            </section>
          </div>

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
                  <IconReceipt className="h-4 w-4 shrink-0 text-slate-400" /> Resumen económico{" "}
                  <span className="font-normal text-slate-400">(este mes)</span>
                </h3>
              </div>
              <button onClick={() => onIrA("facturacion")} className="shrink-0 text-xs font-medium text-brand-green-600 transition hover:text-brand-green-700">
                Ver detalle →
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <Cifra etiqueta="Facturado" valor={euros(totalFacturadoMes)} tono="azul" delta={deltaFacturado} />
              <Cifra etiqueta="Cobrado" valor={euros(totalFacturadoMes - pendienteCobroMes)} tono="azul" delta={deltaCobrado} />
              <Cifra
                etiqueta="Pendiente"
                valor={euros(pendienteCobroMes)}
                tono="amber"
                delta={deltaPendiente}
                subirEsBueno={false}
              />
              <Cifra etiqueta="Comisión CUIDA" valor={euros(comisionMes)} tono="azul" delta={deltaComision} />
            </div>
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
                      {/* El título en el color de su prioridad: en una lista
                          de cuatro, es lo que dice cuál se mira primero. */}
                      <span
                        className={`block truncate text-sm font-medium hover:underline ${
                          i.prioridad === "ALTA" ? "text-rose-600" : i.prioridad === "MEDIA" ? "text-amber-600" : "text-slate-700"
                        }`}
                      >
                        {infoMotivo(i.motivo).etiqueta}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{nombreDeIncidencia(i)}</span>
                      <span className="block text-[11px] tabular-nums text-slate-400">{cuandoPaso(i.createdAt)}</span>
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
                          {a.accion}{" "}
                          <span className="font-normal text-slate-400">
                            — {a.persona}
                            {a.servicio ? ` (${a.servicio})` : ""}
                          </span>
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">{a.cuando ?? a.detalle}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
