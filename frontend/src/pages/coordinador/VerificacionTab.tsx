import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { SearchBox } from "../../components/SearchBox.js";
import { IconAlert, IconCheck, IconCheckCircle, IconClock, IconEuro, IconUsers } from "../../components/icons.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { calcularReparto, compararConAcordado, duracion, euros, horaDe, minutosFichados } from "../../lib/economia.js";
import { IncidenciaFormModal } from "./IncidenciaFormModal.js";
import type { Servicio, Solicitud, Visita } from "../../lib/types.js";

interface Fila {
  visita: Visita;
  servicio: Servicio;
  solicitud: Solicitud;
  fichados: number | null;
  acordados: number | null;
}

const TONO_DESVIO = {
  exacto: { fondo: "bg-brand-green-50", borde: "border-brand-green-200", texto: "text-brand-green-700", etiqueta: "Cuadra" },
  de_mas: { fondo: "bg-amber-50", borde: "border-amber-200", texto: "text-amber-700", etiqueta: "De más" },
  de_menos: { fondo: "bg-rose-50", borde: "border-rose-200", texto: "text-rose-700", etiqueta: "De menos" },
} as const;

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
  const [verificando, setVerificando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incidenciaPara, setIncidenciaPara] = useState<Fila | null>(null);

  const filas = useMemo<Fila[]>(() => {
    const porServicio = new Map(solicitudes.filter((s) => s.servicio).map((s) => [s.servicio!.id, s]));
    return servicios
      .flatMap((servicio) =>
        (servicio.visitas ?? [])
          .filter((visita) => visita.estado === "FINALIZADA")
          .map((visita) => {
            const solicitud = porServicio.get(servicio.id);
            if (!solicitud) return null;
            return {
              visita,
              servicio,
              solicitud,
              fichados: minutosFichados(visita.horaInicioReal, visita.horaFinReal),
              acordados: servicio.minutosPrevistos ?? null,
            } satisfies Fila;
          })
          .filter((f): f is Fila => f !== null),
      )
      .sort((a, b) => a.visita.fecha.localeCompare(b.visita.fecha));
  }, [servicios, solicitudes]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (soloDescuadres) {
        if (f.fichados == null || f.acordados == null) return true;
        if (compararConAcordado(f.fichados, f.acordados).desvio === "exacto") return false;
      }
      if (!q) return true;
      const persona = `${f.solicitud.persona.nombre} ${f.solicitud.persona.apellidos}`;
      const pro = f.visita.profesional ? `${f.visita.profesional.nombre} ${f.visita.profesional.apellidos}` : "";
      return [persona, pro, f.solicitud.necesidad.nombre, f.visita.codigo, f.solicitud.codigo].join(" ").toLowerCase().includes(q);
    });
  }, [filas, busqueda, soloDescuadres]);

  // Lo que hay pendiente de verificar, en horas y en dinero: es la foto de
  // cuánto trabajo cerrado está esperando a que alguien le dé el visto bueno.
  const totales = useMemo(() => {
    let minutos = 0;
    let aProfesionales = 0;
    let aFacturar = 0;
    for (const f of visibles) {
      if (f.fichados == null) continue;
      minutos += f.fichados;
      const precioHora = Number(f.servicio.precioHora ?? 0);
      if (precioHora > 0) {
        const r = calcularReparto({
          minutos: f.fichados,
          precioHora,
          comisionPorcentaje: Number(f.servicio.comisionPorcentaje ?? 15),
          ivaPorcentaje: Number(f.servicio.ivaPorcentaje ?? 0),
        });
        aProfesionales += r.importeProfesional;
        aFacturar += r.totalConIva;
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
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por persona, profesional o servicio…" className="flex-1 sm:max-w-xs" />
        <button
          onClick={() => setSoloDescuadres((v) => !v)}
          className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
            soloDescuadres ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <IconAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
          Solo las que no cuadran
        </button>
      </div>

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-8 text-center">
          <IconCheckCircle className="mx-auto mb-2 h-6 w-6 text-brand-green-600" />
          <p className="text-sm text-brand-green-700">
            {filas.length === 0 ? "No hay ninguna jornada esperando verificación." : "Ninguna jornada coincide con el filtro."}
          </p>
        </div>
      ) : (
        <>
          {/* Lo que está en juego ahora mismo: tiempo cerrado sin verificar y
              el dinero que sale de él en cuanto se dé el visto bueno. */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">Tiempo por verificar</p>
              <p className="text-lg font-semibold text-slate-900">{duracion(totales.minutos)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">A pagar a profesionales</p>
              <p className="text-lg font-semibold text-slate-900">{euros(totales.aProfesionales)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">A facturar</p>
              <p className="text-lg font-semibold text-slate-900">{euros(totales.aFacturar)}</p>
            </div>
          </div>

          <ul className="space-y-2">
            {visibles.map((f) => {
              const comparacion = f.fichados != null && f.acordados != null ? compararConAcordado(f.fichados, f.acordados) : null;
              const tono = comparacion ? TONO_DESVIO[comparacion.desvio] : null;
              const precioHora = Number(f.servicio.precioHora ?? 0);
              const reparto =
                f.fichados != null && precioHora > 0
                  ? calcularReparto({
                      minutos: f.fichados,
                      precioHora,
                      comisionPorcentaje: Number(f.servicio.comisionPorcentaje ?? 15),
                      ivaPorcentaje: Number(f.servicio.ivaPorcentaje ?? 0),
                    })
                  : null;
              const tareas = f.visita.tareas ?? [];
              const hechas = tareas.filter((t) => t.completada).length;

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
                      </p>
                      {f.visita.profesional && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <IconUsers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          {f.visita.profesional.nombre} {f.visita.profesional.apellidos}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        onClick={() => setIncidenciaPara(f)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <IconAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                        No cuadra
                      </button>
                      <button
                        onClick={() => verificar(f)}
                        disabled={verificando === f.visita.id}
                        className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                      >
                        <IconCheck className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                        {verificando === f.visita.id ? "Verificando…" : "Verificar"}
                      </button>
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
                    {/* Lo que se paga y lo que se cobra sale de lo fichado,
                        no de lo previsto: si se trabajó de más, se paga de
                        más. Por eso importa verificar antes. */}
                    {reparto && (
                      <p className="text-slate-500">
                        <IconEuro className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                        Profesional <strong className="text-slate-700">{euros(reparto.importeProfesional)}</strong> · CUIDA{" "}
                        <strong className="text-slate-700">{euros(reparto.comision)}</strong> · Familia{" "}
                        <strong className="text-slate-700">{euros(reparto.totalConIva)}</strong>
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
    </div>
  );
}
