import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { SearchBox } from "../../components/SearchBox.js";
import { IconAlert, IconCheck, IconCheckCircle, IconClock, IconEuro, IconUsers } from "../../components/icons.js";
import { DesgloseVisitaModal } from "../../components/DesgloseVisitaModal.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { calcularReparto, compararConAcordado, duracion, euros, horaDe, minutosFichados } from "../../lib/economia.js";
import { IncidenciaFormModal } from "./IncidenciaFormModal.js";
import { exportarCSV } from "../../lib/csv.js";
import type { Profesional, Servicio, Solicitud, Visita } from "../../lib/types.js";

interface Fila {
  visita: Visita;
  servicio: Servicio;
  solicitud: Solicitud;
  fichados: number | null;
  acordados: number | null;
  // Quién la hizo. La jornada guarda un sello con el profesional del momento
  // —para que reasignar el servicio no reescriba el pasado—, pero las
  // anteriores a ese sello no lo tienen y salían sin nombre: entonces no
  // aparecían al filtrar por profesional. Cuando falta, vale el del servicio.
  profesional: Pick<Profesional, "id" | "codigo" | "nombre" | "apellidos" | "foto"> | null;
}

// Los importes de una jornada. Los pone el motor de tiempo al cerrarla y ya
// están escritos; esta pantalla solo los lee. Rehacer la cuenta aquí era lo
// que hacía que Verificación dijera un importe y el desglose otro.
function importesDe(f: { visita: Visita; servicio: Servicio; fichados: number | null }) {
  if (f.visita.importeCliente != null) {
    const base = Number(f.visita.importeCliente);
    const iva = Number(f.servicio.ivaPorcentaje ?? 0);
    return {
      profesional: Number(f.visita.importeProfesional ?? 0),
      cuida: Number(f.visita.importeCuida ?? 0),
      familia: Math.round(base * (1 + iva / 100) * 100) / 100,
      delMotor: true,
    };
  }
  // Jornadas anteriores al motor: se calcula como antes para no dejarlas en
  // blanco, y se marca que es una estimación.
  const precioHora = Number(f.servicio.precioHora ?? 0);
  if (f.fichados == null || precioHora <= 0) return null;
  const r = calcularReparto({
    minutos: f.fichados,
    precioHora,
    comisionPorcentaje: Number(f.servicio.comisionPorcentaje ?? 15),
    ivaPorcentaje: Number(f.servicio.ivaPorcentaje ?? 0),
  });
  return { profesional: r.importeProfesional, cuida: r.comision, familia: r.totalConIva, delMotor: false };
}

const TONO_DESVIO = {
  exacto: { fondo: "bg-brand-green-50", borde: "border-brand-green-200", texto: "text-brand-green-700", etiqueta: "Cuadra" },
  de_mas: { fondo: "bg-amber-50", borde: "border-amber-200", texto: "text-amber-700", etiqueta: "De más" },
  de_menos: { fondo: "bg-rose-50", borde: "border-rose-200", texto: "text-rose-700", etiqueta: "De menos" },
} as const;

function nombreDeMes(mes: string) {
  const [anio, m] = mes.split("-");
  const texto = new Date(Number(anio), Number(m) - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Un desplegable de filtro. Se repite cuatro veces y todos se comportan
// igual: la opción vacía no filtra.
function Filtro({
  valor,
  onChange,
  vacio,
  opciones,
}: {
  valor: string;
  onChange: (v: string) => void;
  vacio: string;
  opciones: [string, string][];
}) {
  if (opciones.length === 0) return null;
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border px-2 py-2 text-xs ${valor ? "border-brand bg-brand-50 text-brand-800" : "border-slate-300 bg-white text-slate-600"}`}
    >
      <option value="">{vacio}</option>
      {opciones.map(([id, etiqueta]) => (
        <option key={id} value={id}>
          {etiqueta}
        </option>
      ))}
    </select>
  );
}

interface Props {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  onAbrirSolicitud: (id: string) => void;
  onCambiado: () => void;
}

// Verificación: el paso en el que coordinación comprueba que lo fichado
// cuadra con lo acordado antes de que se convierta en dinero. Las horas no se
// tocan desde aquí —las pone quien trabaja, al empezar y al cerrar—: si algo
// no cuadra, se abre una incidencia y se habla. Verificar cierra la jornada y
// la manda a la vez a pagar a la profesional y a facturar a la familia.
export function VerificacionTab({ solicitudes, servicios, onAbrirSolicitud, onCambiado }: Props) {
  const { token } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [soloDescuadres, setSoloDescuadres] = useState(false);
  // Pendientes por defecto: es lo que hay que resolver. Las otras dos vistas
  // son para consultar.
  const [pestana, setPestana] = useState<"pendientes" | "verificadas" | "todas">("pendientes");
  const [persona, setPersona] = useState("");
  const [profesional, setProfesional] = useState("");
  const [tarea, setTarea] = useState("");
  const [mes, setMes] = useState("");
  const [verificando, setVerificando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incidenciaPara, setIncidenciaPara] = useState<Fila | null>(null);
  const [desgloseDe, setDesgloseDe] = useState<string | null>(null);

  const filas = useMemo<Fila[]>(() => {
    const porServicio = new Map(solicitudes.filter((s) => s.servicio).map((s) => [s.servicio!.id, s]));
    return servicios
      .flatMap((servicio) =>
        (servicio.visitas ?? [])
          // Las ya verificadas también: esta pestaña enseñaba sólo lo
          // pendiente, así que no había forma de volver a mirar una jornada
          // cerrada ni de ver lo verificado de un mes.
          .filter((visita) => visita.estado === "FINALIZADA" || visita.estado === "REVISADA")
          .map((visita) => {
            const solicitud = porServicio.get(servicio.id);
            if (!solicitud) return null;
            return {
              visita,
              servicio,
              solicitud,
              fichados: minutosFichados(visita.horaInicioReal, visita.horaFinReal),
              acordados: servicio.minutosPrevistos ?? null,
              profesional: visita.profesional ?? servicio.profesional ?? null,
            } satisfies Fila;
          })
          .filter((f): f is Fila => f !== null),
      )
      .sort((a, b) => a.visita.fecha.localeCompare(b.visita.fecha));
  }, [servicios, solicitudes]);

  // Las opciones de cada desplegable salen de lo que de verdad hay, no de un
  // catálogo: un filtro que ofrece un profesional sin jornadas no sirve.
  const opciones = useMemo(() => {
    const personas = new Map<string, string>();
    const profesionales = new Map<string, string>();
    const tareas = new Map<string, string>();
    const meses = new Set<string>();
    for (const f of filas) {
      personas.set(f.solicitud.persona.id, `${f.solicitud.persona.nombre} ${f.solicitud.persona.apellidos}`);
      if (f.profesional) profesionales.set(f.profesional.id, `${f.profesional.nombre} ${f.profesional.apellidos}`);
      tareas.set(f.solicitud.necesidad.id, f.solicitud.necesidad.nombre);
      meses.add(f.visita.fecha.slice(0, 7));
    }
    const ordenadas = (m: Map<string, string>) => Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
    return { personas: ordenadas(personas), profesionales: ordenadas(profesionales), tareas: ordenadas(tareas), meses: Array.from(meses).sort().reverse() };
  }, [filas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (pestana === "pendientes" && f.visita.estado !== "FINALIZADA") return false;
      if (pestana === "verificadas" && f.visita.estado !== "REVISADA") return false;
      if (persona && f.solicitud.persona.id !== persona) return false;
      if (profesional && f.profesional?.id !== profesional) return false;
      if (tarea && f.solicitud.necesidad.id !== tarea) return false;
      if (mes && f.visita.fecha.slice(0, 7) !== mes) return false;
      if (soloDescuadres) {
        if (f.fichados == null || f.acordados == null) return true;
        if (compararConAcordado(f.fichados, f.acordados).desvio === "exacto") return false;
      }
      if (!q) return true;
      const nombrePersona = `${f.solicitud.persona.nombre} ${f.solicitud.persona.apellidos}`;
      const pro = f.profesional ? `${f.profesional.nombre} ${f.profesional.apellidos}` : "";
      return [nombrePersona, pro, f.solicitud.necesidad.nombre, f.visita.codigo, f.solicitud.codigo].join(" ").toLowerCase().includes(q);
    });
  }, [filas, busqueda, soloDescuadres, pestana, persona, profesional, tarea, mes]);

  const conteo = useMemo(
    () => ({
      pendientes: filas.filter((f) => f.visita.estado === "FINALIZADA").length,
      verificadas: filas.filter((f) => f.visita.estado === "REVISADA").length,
      todas: filas.length,
    }),
    [filas],
  );

  const hayFiltro = Boolean(persona || profesional || tarea || mes || busqueda.trim() || soloDescuadres);
  function limpiarFiltros() {
    setPersona("");
    setProfesional("");
    setTarea("");
    setMes("");
    setBusqueda("");
    setSoloDescuadres(false);
  }

  // Lo que hay pendiente de verificar, en horas y en dinero: es la foto de
  // cuánto trabajo cerrado está esperando a que alguien le dé el visto bueno.
  const totales = useMemo(() => {
    let minutos = 0;
    let aProfesionales = 0;
    let aFacturar = 0;
    for (const f of visibles) {
      if (f.fichados == null) continue;
      minutos += f.fichados;
      const i = importesDe(f);
      if (i) {
        aProfesionales += i.profesional;
        aFacturar += i.familia;
      }
    }
    return { minutos, aProfesionales, aFacturar };
  }, [visibles]);

  async function verificar(fila: Fila) {
    setVerificando(fila.visita.id);
    setError(null);
    try {
      await api.post(`/visitas/${fila.visita.id}/revisar`, {}, token);
      onCambiado();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido verificar");
    } finally {
      setVerificando(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Pendientes / verificadas / todas: antes sólo existía lo pendiente y
          no había manera de repasar lo ya cerrado. */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["pendientes", "Pendientes", conteo.pendientes],
          ["verificadas", "Verificadas", conteo.verificadas],
          ["todas", "Todas", conteo.todas],
        ] as const).map(([clave, etiqueta, valor]) => (
          <button
            key={clave}
            onClick={() => setPestana(clave)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              pestana === clave ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {etiqueta} ({valor})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por persona, profesional o servicio…" className="flex-1 sm:max-w-xs" />
        {/* Los cuatro cortes con los que de verdad se mira esto: de quién,
            quién lo hizo, qué se hizo y en qué mes. */}
        <Filtro valor={persona} onChange={setPersona} vacio="Toda persona" opciones={opciones.personas} />
        <Filtro valor={profesional} onChange={setProfesional} vacio="Todo profesional" opciones={opciones.profesionales} />
        <Filtro valor={tarea} onChange={setTarea} vacio="Toda tarea" opciones={opciones.tareas} />
        <Filtro valor={mes} onChange={setMes} vacio="Todo el histórico" opciones={opciones.meses.map((m) => [m, nombreDeMes(m)] as [string, string])} />
        <button
          onClick={() => setSoloDescuadres((v) => !v)}
          className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
            soloDescuadres ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <IconAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
          Solo las que no cuadran
        </button>
        {hayFiltro && (
          <button onClick={limpiarFiltros} className="text-xs font-medium text-brand hover:text-brand-800">
            Quitar filtros
          </button>
        )}
        {visibles.length > 0 && (
          <button
            onClick={() =>
              exportarCSV(
                visibles,
                [
                  { encabezado: "Jornada", valor: (f) => f.visita.codigo },
                  { encabezado: "Fecha", valor: (f) => new Date(f.visita.fecha).toLocaleDateString("es-ES") },
                  { encabezado: "Persona", valor: (f) => `${f.solicitud.persona.nombre} ${f.solicitud.persona.apellidos}` },
                  { encabezado: "Profesional", valor: (f) => (f.profesional ? `${f.profesional.nombre} ${f.profesional.apellidos}` : "") },
                  { encabezado: "Tarea", valor: (f) => f.solicitud.necesidad.nombre },
                  { encabezado: "Fichado", valor: (f) => (f.fichados != null ? duracion(f.fichados) : "sin fichaje") },
                  { encabezado: "Acordado", valor: (f) => (f.acordados != null ? duracion(f.acordados) : "") },
                  { encabezado: "Estado", valor: (f) => (f.visita.estado === "REVISADA" ? "Verificada" : "Pendiente") },
                ],
                "verificacion",
              )
            }
            className="ml-auto text-xs font-medium text-brand hover:text-brand-800"
          >
            Exportar CSV ({visibles.length})
          </button>
        )}
      </div>

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-8 text-center">
          <IconCheckCircle className="mx-auto mb-2 h-6 w-6 text-brand-green-600" />
          <p className="text-sm text-brand-green-700">
            {filas.length === 0
              ? "Todavía no hay ninguna jornada cerrada."
              : hayFiltro || pestana !== "todas"
                ? "Ninguna jornada coincide con lo que estás filtrando."
                : "No hay ninguna jornada esperando verificación."}
          </p>
        </div>
      ) : (
        <>
          {/* Lo que está en juego ahora mismo: tiempo cerrado sin verificar y
              el dinero que sale de él en cuanto se dé el visto bueno. */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">{pestana === "verificadas" ? "Tiempo verificado" : "Tiempo por verificar"}</p>
              <p className="text-lg font-semibold text-slate-900">{duracion(totales.minutos)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">{pestana === "verificadas" ? "Pagado a profesionales" : "A pagar a profesionales"}</p>
              <p className="text-lg font-semibold text-slate-900">{euros(totales.aProfesionales)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">{pestana === "verificadas" ? "Facturado" : "A facturar"}</p>
              <p className="text-lg font-semibold text-slate-900">{euros(totales.aFacturar)}</p>
            </div>
          </div>

          <ul className="space-y-2">
            {visibles.map((f) => {
              const comparacion = f.fichados != null && f.acordados != null ? compararConAcordado(f.fichados, f.acordados) : null;
              const tono = comparacion ? TONO_DESVIO[comparacion.desvio] : null;
              const importes = importesDe(f);
              const tareas = f.visita.tareas ?? [];
              const hechas = tareas.filter((t) => t.completada).length;
              const verificada = f.visita.estado === "REVISADA";

              return (
                <li key={f.visita.id} className={`rounded-lg border bg-white p-3 ${tono ? tono.borde : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button onClick={() => onAbrirSolicitud(f.solicitud.id)} className="text-left">
                        <p className="flex items-center gap-1.5 font-medium text-slate-800 hover:underline">
                          <IconoNecesidad codigo={f.solicitud.necesidad.codigo} className="h-4 w-4 shrink-0 text-slate-400" />
                          {f.solicitud.persona.nombre} {f.solicitud.persona.apellidos}
                        </p>
                      </button>
                      <p className="text-xs text-slate-500">
                        {f.solicitud.necesidad.nombre} ·{" "}
                        {new Date(f.visita.fecha).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                        {" · "}
                        <span className="text-slate-400">{f.visita.codigo}</span>
                      </p>
                      {f.profesional && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <IconUsers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          {f.profesional.nombre} {f.profesional.apellidos}
                        </p>
                      )}
                      {/* Tiempo por encima de lo acordado que nadie ha
                          decidido todavía: esta jornada no se puede facturar
                          ni liquidar hasta resolverlo, y se ve aquí para que
                          no aparezca como sorpresa a fin de mes. */}
                      {f.visita.ajusteEstado === "PENDIENTE" && (
                        <button
                          onClick={() => setDesgloseDe(f.visita.id)}
                          className="mt-1 flex items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 hover:bg-orange-200"
                        >
                          <IconAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Tiempo de más sin decidir · no se facturará
                        </button>
                      )}
                    </div>

                    {/* Una jornada ya verificada se consulta, no se vuelve a
                        verificar: sólo queda el sello y la posibilidad de
                        abrir una incidencia si aparece algo después. */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {/* La cuenta de esta jornada, entera. Verificar es dar
                          por bueno un importe, así que se tiene que poder ver
                          de dónde sale antes de firmarlo. */}
                      <button
                        onClick={() => setDesgloseDe(f.visita.id)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <IconEuro className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                        Desglose
                      </button>
                      <button
                        onClick={() => setIncidenciaPara(f)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <IconAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                        No cuadra
                      </button>
                      {verificada ? (
                        <span className="flex items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white">
                          <IconCheck className="h-3.5 w-3.5" /> Verificada
                        </span>
                      ) : (
                        <button
                          onClick={() => verificar(f)}
                          disabled={verificando === f.visita.id}
                          className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                        >
                          <IconCheck className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                          {verificando === f.visita.id ? "Verificando…" : "Verificar"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* El fichaje, tal y como lo dejó la profesional. Es el
                      registro: se lee, no se edita. */}
                  <div className={`mt-2.5 grid grid-cols-2 gap-2 rounded-md px-3 py-2 sm:grid-cols-4 ${tono ? tono.fondo : "bg-slate-50"}`}>
                    <div>
                      <p className="text-[11px] text-slate-500">Fichado</p>
                      <p className="font-mono text-sm font-medium text-slate-800">
                        {horaDe(f.visita.horaInicioReal)}–{horaDe(f.visita.horaFinReal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Trabajado</p>
                      <p className="text-sm font-semibold text-slate-900">{f.fichados != null ? duracion(f.fichados) : "sin fichaje"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Acordado</p>
                      <p className="text-sm text-slate-700">{f.acordados != null ? duracion(f.acordados) : "sin fijar"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Diferencia</p>
                      {comparacion && tono ? (
                        <p className={`text-sm font-semibold ${tono.texto}`}>
                          {comparacion.desvio === "exacto" ? tono.etiqueta : `${comparacion.diferencia > 0 ? "+" : ""}${duracion(comparacion.diferencia)}`}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-400">—</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    {tareas.length > 0 ? (
                      <p className="text-slate-500" title={tareas.map((t) => `${t.completada ? "hecha" : "sin hacer"}: ${t.descripcion}`).join("\n")}>
                        <IconCheck className={`mr-1 inline h-3.5 w-3.5 align-text-bottom ${hechas === tareas.length ? "text-brand-green-600" : "text-slate-400"}`} />
                        {hechas} de {tareas.length} tareas marcadas
                      </p>
                    ) : (
                      <span />
                    )}
                    {/* Las tres cifras que dejó el motor al cerrar la jornada:
                        las mismas que se verán en el desglose, en la factura y
                        en la liquidación. Son las que se están dando por
                        buenas al verificar. */}
                    {importes && (
                      <p className="text-slate-500">
                        <IconEuro className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                        Profesional <strong className="text-slate-700">{euros(importes.profesional)}</strong> · CUIDA{" "}
                        <strong className="text-slate-700">{euros(importes.cuida)}</strong> · Familia{" "}
                        <strong className="text-slate-700">{euros(importes.familia)}</strong>
                        {!importes.delMotor && <span className="text-slate-400"> · estimado</span>}
                      </p>
                    )}
                  </div>

                  {f.visita.actuaciones && f.visita.actuaciones.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
                      {f.visita.actuaciones.map((a) => (
                        <li key={a.id} className="text-xs text-slate-500">
                          {a.descripcion}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Abrir una incidencia desde aquí llega con el servicio ya elegido y
          el motivo puesto en "las horas no cuadran": es el único caso en el
          que coordinación discute un fichaje. */}
      {incidenciaPara && (
        <IncidenciaFormModal
          servicios={servicios}
          servicioPreseleccionado={incidenciaPara.servicio.id}
          visitaPreseleccionada={incidenciaPara.visita.id}
          motivoPreseleccionado="HORAS"
          descripcionSugerida={(() => {
            const f = incidenciaPara;
            if (f.fichados == null || f.acordados == null) return "";
            const c = compararConAcordado(f.fichados, f.acordados);
            if (c.desvio === "exacto") return "";
            const sentido = c.desvio === "de_mas" ? "más" : "menos";
            return `La jornada del ${new Date(f.visita.fecha).toLocaleDateString("es-ES")} se ha fichado con ${duracion(
              Math.abs(c.diferencia),
            )} de ${sentido} de lo acordado (${duracion(f.fichados)} frente a ${duracion(f.acordados)}). Confirmar antes de verificar.`;
          })()}
          onClose={() => setIncidenciaPara(null)}
          onCreada={onCambiado}
        />
      )}

      {desgloseDe && <DesgloseVisitaModal visitaId={desgloseDe} onClose={() => setDesgloseDe(null)} onCambio={onCambiado} />}
    </div>
  );
}
