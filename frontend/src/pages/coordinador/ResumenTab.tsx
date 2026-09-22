import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { ActividadFeed } from "./ActividadTab.js";
import { CargaTrabajo } from "./CargaTrabajo.js";
import { Cronometro, horasTrabajadas } from "../../components/Cronometro.js";
import { Novedades } from "../../components/Novedades.js";
import { compararConAcordado, duracion, euros, minutosFichados } from "../../lib/economia.js";
import { IconAlert, IconArrowDown, IconArrowUp, IconBriefcase, IconCalendar, IconCheck, IconClipboard, IconReceipt, IconRefresh, IconUsers } from "../../components/icons.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { IncidenciaFormModal } from "./IncidenciaFormModal.js";
import type { Factura, Incidencia, Profesional, Servicio, Solicitud, Visita, Ausencia, MiembroEquipo } from "../../lib/types.js";

interface Props {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  incidencias: Incidencia[];
  onIrA: (tab: string, filtro?: string) => void;
  onAbrirSolicitud: (solicitudId: string) => void;
  // Abrir la incidencia en su ficha. Antes el aviso solo llevaba a la
  // pestaña de incidencias y había que volver a buscarla en el listado.
  onAbrirIncidencia: (incidenciaId: string) => void;
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
export function ResumenTab({ solicitudes, servicios, incidencias, onIrA, onAbrirSolicitud, onAbrirIncidencia, onCambiado }: Props) {
  const { token } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);
  const [ultimaCarga, setUltimaCarga] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  const [refrescando, setRefrescando] = useState(false);
  const [verificando, setVerificando] = useState<string | null>(null);
  const [incidenciaFichaje, setIncidenciaFichaje] = useState<FilaAgenda | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarPropios = useCallback(async () => {
    const [facs, pros, me, eq, aus] = await Promise.all([
      api.get<Factura[]>("/facturas", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<{ nombre: string | null }>("/cuenta/me", token),
      api.get<MiembroEquipo[]>("/equipo", token).catch(() => []),
      api.get<Ausencia[]>("/equipo/ausencias", token).catch(() => []),
    ]);
    setFacturas(facs);
    setProfesionales(pros);
    setNombre(me.nombre);
    setEquipo(eq);
    setAusencias(aus);
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
      valor: equipo.filter((m) => m.bloqueado).length,
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

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            {saludo()}
            {nombre ? `, ${nombre.split(" ")[0]}` : ""}
          </h2>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
            {agendaHoy.length === 0 ? "sin visitas hoy" : `${agendaHoy.length} ${agendaHoy.length === 1 ? "visita" : "visitas"} hoy`}
            {enMarcha.length > 0 && <span className="font-medium text-brand-green-700"> · {enMarcha.length} en marcha ahora</span>}
          </p>
        </div>
        <button
          onClick={refrescar}
          disabled={refrescando}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60"
          title="Volver a cargar los datos del escritorio"
        >
          <IconRefresh className={`h-3.5 w-3.5 ${refrescando ? "animate-spin" : ""}`} />
          {refrescando ? "Actualizando…" : `Actualizado ${haceCuanto(ultimaCarga, ahora)}`}
        </button>
      </header>

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {/* Lo que ha cambiado desde la última vez. Antes sólo estaba en la
          campana, y la campana hay que abrirla para enterarse. */}
      <Novedades
        onAbrir={(tipo, id) => {
          if (tipo === "Solicitud") onAbrirSolicitud(id);
          if (tipo === "Incidencia") onAbrirIncidencia(id);
        }}
      />

      {avisos.length === 0 ? (
        <div className="rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">
          Todo al día — no hay nada que requiera tu acción ahora mismo.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {avisos.map((a) => (
            <button
              key={a.clave}
              onClick={a.onClick}
              title={a.detalle}
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition hover:brightness-[0.98] ${
                a.tono === "rose" ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60"
              }`}
            >
              <a.icon className={`mt-0.5 h-4 w-4 shrink-0 ${a.tono === "rose" ? "text-rose-600" : "text-amber-600"}`} />
              <p className="text-xs leading-snug text-slate-700">
                <span className="font-semibold text-slate-900">{a.valor}</span> {a.valor === 1 ? a.singular : a.plural}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-3">
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
                            onClick={() => onIrA("verificacion")}
                            className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 transition hover:bg-orange-200"
                          >
                            Verificar
                          </button>
                        ) : visita.estado === "REVISADA" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                            <IconCheck className="h-3 w-3" /> Verificada
                          </span>
                        ) : noPresentado ? (
                          <>
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">No presentado</span>
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

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconClipboard className="h-4 w-4 text-slate-400" /> Pendiente de ti
              </h3>
              <span className="text-xs text-slate-400">{totalBandeja === 0 ? "bandeja vacía" : `${totalBandeja} por resolver`}</span>
            </div>
            {totalBandeja === 0 ? (
              <p className="py-3 text-center text-xs text-slate-400">No queda nada esperando una decisión tuya.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {nuevas.slice(0, 4).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">Nueva</span>
                    {/* El nombre y el código también entran: el aviso se leía
                        pero no se podía pinchar para mirarlo antes de decidir. */}
                    <button onClick={() => onAbrirSolicitud(s.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm text-slate-800 hover:underline">
                        {s.persona.nombre} {s.persona.apellidos} · {s.necesidad.nombre}
                      </p>
                      <p className="text-xs text-slate-400">
                        {s.codigo} · recibida el {new Date(s.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                      </p>
                    </button>
                    <button
                      onClick={() => onAbrirSolicitud(s.id)}
                      className="shrink-0 rounded-md border border-brand px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand hover:text-white"
                    >
                      Revisar
                    </button>
                  </li>
                ))}

                {cancelacionesPendientes.slice(0, 3).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2">
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">Cancelar</span>
                    <button onClick={() => onAbrirIncidencia(i.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm text-slate-800 hover:underline">
                        {i.servicio?.solicitud ? `${i.servicio.solicitud.persona.nombre} ${i.servicio.solicitud.persona.apellidos}` : i.codigo}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {i.codigo} · {i.descripcion}
                      </p>
                    </button>
                    <button
                      onClick={() => onAbrirIncidencia(i.id)}
                      className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Corroborar
                    </button>
                  </li>
                ))}

                {visitasPorVerificar.slice(0, 4).map(({ visita, servicio }) => {
                  const fichados = minutosFichados(visita.horaInicioReal, visita.horaFinReal);
                  const acordados = servicio.minutosPrevistos ?? null;
                  const comparacion = fichados != null && acordados != null ? compararConAcordado(fichados, acordados) : null;
                  const solicitudId = servicio.solicitud?.id;
                  return (
                    <li key={visita.id} className="flex items-center gap-3 py-2">
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">Verificar</span>
                      {/* Toda la fila entra en la solicitud: antes solo había
                          un botón de verificar y no se podía mirar nada antes
                          de decidir. */}
                      <button
                        onClick={() => solicitudId && onAbrirSolicitud(solicitudId)}
                        disabled={!solicitudId}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm text-slate-800 hover:underline">{nombrePersona(servicio)}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(visita.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} ·{" "}
                          {fichados != null ? (
                            <>
                              {duracion(fichados)} fichados
                              {comparacion && comparacion.desvio !== "exacto" && (
                                <span className={comparacion.desvio === "de_mas" ? "text-amber-600" : "text-rose-600"}>
                                  {" "}
                                  ({comparacion.diferencia > 0 ? "+" : ""}
                                  {duracion(comparacion.diferencia)})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="font-medium text-amber-600">sin fichaje</span>
                          )}
                        </p>
                      </button>
                      <button
                        onClick={() => verificar({ visita, servicio })}
                        disabled={verificando === visita.id}
                        className="shrink-0 rounded-md border border-brand px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand hover:text-white disabled:opacity-60"
                      >
                        {verificando === visita.id ? "…" : "Verificar"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <CargaTrabajo solicitudes={solicitudes} />
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-3">
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

          <section className="rounded-lg border border-slate-200 bg-white p-3">
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
            <section className="rounded-lg border border-slate-200 bg-white p-3">
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
    </div>
  );
}
