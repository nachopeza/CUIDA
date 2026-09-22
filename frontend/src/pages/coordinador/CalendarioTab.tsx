import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { IconChevronLeft, IconChevronRight, IconGrid, IconList, IconCalendar } from "../../components/icons.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { conMayusculaInicial, duracion, minutosEntre } from "../../lib/economia.js";
import { exportarCSV } from "../../lib/csv.js";
import type { VisitaAgenda } from "../../lib/types.js";

type Vista = "dia" | "semana" | "mes" | "escaleta";

const VISTAS: { clave: Vista; etiqueta: string; icono: typeof IconList }[] = [
  { clave: "dia", etiqueta: "Día", icono: IconList },
  { clave: "semana", etiqueta: "Semana", icono: IconCalendar },
  { clave: "mes", etiqueta: "Mes", icono: IconCalendar },
  { clave: "escaleta", etiqueta: "Escaleta", icono: IconGrid },
];

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function clave(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function sumarDias(fecha: Date, dias: number) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

// Lunes de la semana a la que pertenece la fecha.
function lunesDe(fecha: Date) {
  return sumarDias(fecha, -((fecha.getDay() + 6) % 7));
}

function nombreProfesional(v: VisitaAgenda) {
  const p = v.profesional ?? v.servicio.profesional;
  return p ? `${p.nombre} ${p.apellidos}` : "Sin asignar";
}

function nombrePersona(v: VisitaAgenda) {
  const p = v.servicio.solicitud.persona;
  return `${p.nombre} ${p.apellidos}`;
}

function minutosDe(v: VisitaAgenda) {
  return minutosEntre(v.horaInicioProg, v.horaFinProg) ?? 0;
}

// El calendario responde a una sola pregunta: qué hay ese día, esa semana o
// ese mes, y quién lo hace. No se verifica desde aquí —eso es un estado del
// trabajo y vive en Verificación—: mezclarlo convertía la agenda en una
// bandeja de tareas y dejaba de servir para planificar.
export function CalendarioTab({ onAbrirSolicitud }: { onAbrirSolicitud: (solicitudId: string) => void }) {
  const { token } = useAuth();
  const [visitas, setVisitas] = useState<VisitaAgenda[]>([]);
  const [vista, setVista] = useState<Vista>("semana");
  const [referencia, setReferencia] = useState(() => new Date());
  const [profesionalFiltro, setProfesionalFiltro] = useState("");
  const [personaFiltro, setPersonaFiltro] = useState("");

  useEffect(() => {
    api.get<VisitaAgenda[]>("/agenda", token).then(setVisitas);
  }, [token]);

  const profesionales = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of visitas) {
      const p = v.profesional ?? v.servicio.profesional;
      if (p) m.set(p.id, `${p.nombre} ${p.apellidos}`);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [visitas]);

  const personas = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of visitas) m.set(v.servicio.solicitud.persona.id, nombrePersona(v));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [visitas]);

  const filtradas = useMemo(
    () =>
      visitas.filter((v) => {
        if (profesionalFiltro && (v.profesional?.id ?? v.servicio.profesional?.id) !== profesionalFiltro) return false;
        if (personaFiltro && v.servicio.solicitud.persona.id !== personaFiltro) return false;
        return true;
      }),
    [visitas, profesionalFiltro, personaFiltro],
  );

  const porFecha = useMemo(() => {
    const m = new Map<string, VisitaAgenda[]>();
    for (const v of filtradas) {
      const k = clave(new Date(v.fecha));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(v);
    }
    for (const lista of m.values()) lista.sort((a, b) => (a.horaInicioProg ?? "").localeCompare(b.horaInicioProg ?? ""));
    return m;
  }, [filtradas]);

  // El rango que se está mirando, que es lo que mueven las flechas y lo que
  // se exporta.
  const rango = useMemo(() => {
    if (vista === "dia") return { desde: referencia, hasta: referencia };
    if (vista === "semana" || vista === "escaleta") {
      const lunes = lunesDe(referencia);
      return { desde: lunes, hasta: sumarDias(lunes, 6) };
    }
    return {
      desde: new Date(referencia.getFullYear(), referencia.getMonth(), 1),
      hasta: new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0),
    };
  }, [vista, referencia]);

  const diasDelRango = useMemo(() => {
    const dias: Date[] = [];
    for (let d = new Date(rango.desde); d <= rango.hasta; d = sumarDias(d, 1)) dias.push(new Date(d));
    return dias;
  }, [rango]);

  const delRango = useMemo(() => diasDelRango.flatMap((d) => porFecha.get(clave(d)) ?? []), [diasDelRango, porFecha]);

  function mover(sentido: 1 | -1) {
    if (vista === "dia") setReferencia((r) => sumarDias(r, sentido));
    else if (vista === "semana" || vista === "escaleta") setReferencia((r) => sumarDias(r, 7 * sentido));
    else setReferencia((r) => new Date(r.getFullYear(), r.getMonth() + sentido, 1));
  }

  const titulo =
    vista === "dia"
      ? referencia.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
      : vista === "mes"
        ? `${MESES[referencia.getMonth()]} ${referencia.getFullYear()}`
        : `${rango.desde.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${rango.hasta.toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
          })}`;

  const hoy = clave(new Date());

  // Una jornada en la agenda: pinchar abre su solicitud, que es donde está
  // todo lo demás. Antes la agenda era una lista muerta.
  function Jornada({ v, compacta }: { v: VisitaAgenda; compacta?: boolean }) {
    return (
      <button
        onClick={() => onAbrirSolicitud(v.servicio.solicitud.id)}
        title={`${v.horaInicioProg ?? ""}–${v.horaFinProg ?? ""} · ${nombrePersona(v)} · ${nombreProfesional(v)}`}
        className={`block w-full rounded-md border border-slate-200 bg-white text-left transition hover:border-brand hover:bg-brand-50 ${
          compacta ? "px-1.5 py-1" : "px-2.5 py-2"
        }`}
      >
        <p className={`flex items-center gap-1 font-medium text-slate-800 ${compacta ? "text-[10px]" : "text-sm"}`}>
          <span className="font-mono tabular-nums text-slate-500">{v.horaInicioProg ?? "--:--"}</span>
          <span className="truncate">{nombrePersona(v)}</span>
        </p>
        <p className={`flex items-center gap-1 truncate text-slate-500 ${compacta ? "text-[10px]" : "text-xs"}`}>
          <IconoNecesidad codigo={v.servicio.solicitud.necesidad.codigo} className="h-3 w-3 shrink-0 text-slate-400" />
          {compacta ? nombreProfesional(v).split(" ")[0] : nombreProfesional(v)}
        </p>
        {!compacta && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            {duracion(minutosDe(v))}
            <EstadoBadge estado={v.estado} />
          </p>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              onClick={() => setVista(v.clave)}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition ${vista === v.clave ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => mover(-1)} aria-label="Anterior" className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50">
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setReferencia(new Date())} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Hoy
          </button>
          <button onClick={() => mover(1)} aria-label="Siguiente" className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50">
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm font-semibold text-slate-700">{conMayusculaInicial(titulo)}</p>

        <select value={profesionalFiltro} onChange={(e) => setProfesionalFiltro(e.target.value)} className="ml-auto rounded-md border border-slate-300 px-2 py-1.5 text-xs">
          <option value="">Todos los profesionales</option>
          {profesionales.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
        <select value={personaFiltro} onChange={(e) => setPersonaFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs">
          <option value="">Todas las personas</option>
          {personas.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
      </div>

      <ExportarBarra
        total={delRango.length}
        seleccionadas={0}
        onExportar={() =>
          exportarCSV(
            delRango,
            [
              { encabezado: "Fecha", valor: (v) => new Date(v.fecha).toLocaleDateString("es-ES") },
              { encabezado: "Desde", valor: (v) => v.horaInicioProg ?? "" },
              { encabezado: "Hasta", valor: (v) => v.horaFinProg ?? "" },
              { encabezado: "Duración", valor: (v) => duracion(minutosDe(v)) },
              { encabezado: "Profesional", valor: (v) => nombreProfesional(v) },
              { encabezado: "Persona", valor: (v) => nombrePersona(v) },
              { encabezado: "Servicio", valor: (v) => v.servicio.solicitud.necesidad.nombre },
              { encabezado: "Estado", valor: (v) => v.estado },
            ],
            `agenda-${clave(rango.desde)}`,
          )
        }
      />

      {delRango.length === 0 && vista !== "mes" && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">No hay nada en la agenda en este periodo.</p>
      )}

      {vista === "dia" && delRango.length > 0 && (
        <ul className="space-y-1.5">
          {delRango.map((v) => (
            <li key={v.id}>
              <Jornada v={v} />
            </li>
          ))}
        </ul>
      )}

      {vista === "semana" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {diasDelRango.map((d) => {
            const k = clave(d);
            const delDia = porFecha.get(k) ?? [];
            return (
              <div key={k} className={`rounded-lg border p-1.5 ${k === hoy ? "border-brand bg-brand-50/50" : "border-slate-200 bg-slate-50/50"}`}>
                <p className={`mb-1.5 text-xs font-semibold ${k === hoy ? "text-brand-800" : "text-slate-500"}`}>
                  {d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" })}
                </p>
                <div className="space-y-1">
                  {delDia.length === 0 ? <p className="px-1 text-[10px] text-slate-300">—</p> : delDia.map((v) => <Jornada key={v.id} v={v} compacta />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {vista === "mes" && (
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: (new Date(referencia.getFullYear(), referencia.getMonth(), 1).getDay() + 6) % 7 }).map((_, i) => (
              <div key={`hueco-${i}`} className="min-h-[72px] rounded-md bg-slate-50" />
            ))}
            {diasDelRango.map((d) => {
              const k = clave(d);
              const delDia = porFecha.get(k) ?? [];
              return (
                <div key={k} className={`min-h-[72px] rounded-md border p-1 ${k === hoy ? "border-brand bg-brand-50/50" : "border-slate-200"}`}>
                  <p className={`text-xs font-semibold ${k === hoy ? "text-brand-800" : "text-slate-500"}`}>{d.getDate()}</p>
                  <div className="mt-0.5 space-y-0.5">
                    {delDia.slice(0, 2).map((v) => (
                      <Jornada key={v.id} v={v} compacta />
                    ))}
                    {delDia.length > 2 && (
                      <button onClick={() => { setVista("dia"); setReferencia(d); }} className="w-full px-1 text-left text-[10px] text-brand hover:underline">
                        +{delDia.length - 2} más
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Escaleta: la cuadrícula de quién trabaja qué días, que es lo que se
          imprime o se manda. Una fila por profesional, una columna por día. */}
      {vista === "escaleta" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold">Profesional</th>
                {diasDelRango.map((d) => (
                  <th key={clave(d)} className={`px-2 py-2 text-center font-semibold ${clave(d) === hoy ? "text-brand-800" : ""}`}>
                    <span className="block">{DIAS_SEMANA[(d.getDay() + 6) % 7]}</span>
                    <span className="block font-normal">{d.getDate()}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profesionales.length === 0 ? (
                <tr>
                  <td colSpan={diasDelRango.length + 2} className="px-3 py-6 text-center text-sm text-slate-500">
                    Todavía no hay jornadas asignadas a ningún profesional.
                  </td>
                </tr>
              ) : (
                profesionales.map(([id, nombre]) => {
                  const suyas = delRango.filter((v) => (v.profesional?.id ?? v.servicio.profesional?.id) === id);
                  const total = suyas.reduce((acc, v) => acc + minutosDe(v), 0);
                  return (
                    <tr key={id}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-800">{nombre}</td>
                      {diasDelRango.map((d) => {
                        const delDia = (porFecha.get(clave(d)) ?? []).filter((v) => (v.profesional?.id ?? v.servicio.profesional?.id) === id);
                        const minutos = delDia.reduce((acc, v) => acc + minutosDe(v), 0);
                        return (
                          <td key={clave(d)} className="px-1 py-1 text-center align-top">
                            {delDia.length === 0 ? (
                              <span className="text-slate-200">·</span>
                            ) : (
                              <button
                                onClick={() => onAbrirSolicitud(delDia[0].servicio.solicitud.id)}
                                title={delDia.map((v) => `${v.horaInicioProg}–${v.horaFinProg} ${nombrePersona(v)}`).join("\n")}
                                className="w-full rounded bg-brand-green-100 px-1 py-1 text-[10px] font-medium leading-tight text-brand-green-700 hover:bg-brand-green-200"
                              >
                                <span className="block font-mono">{delDia[0].horaInicioProg}</span>
                                <span className="block">{duracion(minutos)}</span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{duracion(total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
