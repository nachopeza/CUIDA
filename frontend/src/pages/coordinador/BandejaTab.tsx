import { useEffect, useMemo, useState } from "react";
import { ResolverJornadaModal } from "../../components/ResolverJornadaModal.js";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { exportarCSV } from "../../lib/csv.js";
import { INFO_PRIORIDAD, calcularPendientes, hace, type Asunto, type Prioridad } from "../../lib/pendientes.js";
import type { Ausencia, Factura, FichaProfesional, Incidencia, Persona, Servicio, Solicitud } from "../../lib/types.js";
import { SearchBox } from "../../components/SearchBox.js";
import { IconArrowRight, IconCheckCircle, IconDownload, IconRefresh } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Bandeja de trabajo
//
// El escritorio enseña los seis asuntos más urgentes, porque un escritorio con
// cuarenta filas no es un escritorio. Esta es la lista entera: todo lo que
// espera a alguien, de cualquier parte del sistema, en un solo sitio y con la
// acción al lado.
//
// Es la pregunta "¿qué me queda por hacer?" y su respuesta, sin tener que
// recorrer siete pestañas para reunirla.
// ---------------------------------------------------------------------------

interface Props {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  incidencias: Incidencia[];
  onIrA: (tab: string, filtro?: string, foco?: string) => void;
  onAbrirSolicitud: (solicitudId: string) => void;
  onAbrirIncidencia: (incidenciaId: string) => void;
  onAbrirPersona: (personaId: string) => void;
}

const PRIORIDADES: Prioridad[] = ["critico", "atencion", "informativa"];

export function BandejaTab({ solicitudes, servicios, incidencias, onIrA, onAbrirSolicitud, onAbrirIncidencia, onAbrirPersona }: Props) {
  const { token } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [plantilla, setPlantilla] = useState<FichaProfesional[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad | "">("");
  const [tipo, setTipo] = useState("");
  const [persona, setPersona] = useState("");
  const [refrescando, setRefrescando] = useState(false);
  const [fichasPersona, setFichasPersona] = useState<Persona[]>([]);
  // Los días pedidos sin contestar también esperan a alguien: si no salen
  // aquí, no salen en ningún sitio.
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);

  async function cargar() {
    const [facs, eq, pers, aus] = await Promise.all([
      api.get<Factura[]>("/facturas", token).catch(() => []),
      api.get<FichaProfesional[]>("/personal", token).catch(() => []),
      api.get<Persona[]>("/personas", token).catch(() => []),
      api.get<Ausencia[]>("/personal/ausencias", token).catch(() => []),
    ]);
    setFacturas(facs);
    setPlantilla(eq);
    setFichasPersona(pers);
    setAusencias(aus);
  }
  useEffect(() => {
    void cargar();
  }, [token]);

  const todos = useMemo(
    () => calcularPendientes({ solicitudes, servicios, incidencias, facturas, plantilla, personas: fichasPersona, ausencias }),
    [solicitudes, servicios, incidencias, facturas, plantilla, fichasPersona, ausencias],
  );

  // Los desplegables se llenan de lo que hay, no de una lista fija: un filtro
  // con opciones que nunca devuelven nada hace perder el tiempo.
  const tipos = useMemo(() => [...new Set(todos.map((a) => a.tipo))].sort(), [todos]);
  const personas = useMemo(() => [...new Set(todos.map((a) => a.persona))].sort(), [todos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return todos.filter((a) => {
      if (prioridad && a.prioridad !== prioridad) return false;
      if (tipo && a.tipo !== tipo) return false;
      if (persona && a.persona !== persona) return false;
      if (q && !`${a.tipo} ${a.persona} ${a.servicio ?? ""} ${a.detalle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [todos, busqueda, prioridad, tipo, persona]);

  const conteo = useMemo(() => {
    const c: Record<Prioridad, number> = { critico: 0, atencion: 0, informativa: 0 };
    for (const a of todos) c[a.prioridad] += 1;
    return c;
  }, [todos]);

  const [jornada, setJornada] = useState<Extract<Asunto["destino"], { tipo: "jornada" }> | null>(null);

  function abrir(a: Asunto) {
    // Una jornada atascada se resuelve aquí mismo, sin salir de la bandeja:
    // es el caso en que navegar a otra pantalla no servía de nada porque allí
    // no había ninguna acción que arreglase el problema.
    if (a.destino.tipo === "jornada") setJornada(a.destino);
    else if (a.destino.tipo === "solicitud") onAbrirSolicitud(a.destino.id);
    else if (a.destino.tipo === "incidencia") onAbrirIncidencia(a.destino.id);
    else if (a.destino.tipo === "persona") onAbrirPersona(a.destino.id);
    else onIrA(a.destino.tab, undefined, a.destino.foco);
  }

  const hayFiltro = Boolean(busqueda || prioridad || tipo || persona);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Bandeja de trabajo</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            Todo lo que espera a alguien, de toda la aplicación, con la acción al lado. El escritorio enseña lo más urgente; esto
            es la lista completa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              setRefrescando(true);
              await cargar();
              setRefrescando(false);
            }}
            disabled={refrescando}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <IconRefresh className={`mr-1 inline h-3.5 w-3.5 align-text-bottom ${refrescando ? "animate-spin" : ""}`} aria-hidden />
            Actualizar
          </button>
          <button
            onClick={() =>
              exportarCSV(
                visibles,
                [
                  { encabezado: "Prioridad", valor: (a) => INFO_PRIORIDAD[a.prioridad].etiqueta },
                  { encabezado: "Asunto", valor: (a) => a.tipo },
                  { encabezado: "Persona", valor: (a) => a.persona },
                  { encabezado: "Servicio", valor: (a) => a.servicio ?? "" },
                  { encabezado: "Hora", valor: (a) => a.cuando ?? "" },
                  { encabezado: "Detalle", valor: (a) => a.detalle },
                  { encabezado: "Esperando", valor: (a) => hace(a.desde) },
                  { encabezado: "Acción", valor: (a) => a.accion },
                ],
                "cuida-bandeja.csv",
              )
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <IconDownload className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
            CSV
          </button>
        </div>
      </header>

      {/* Casillas de conteo que además filtran. Punto y palabra, no sólo
          color: impreso en gris o para quien no distingue el ámbar del rojo,
          la etiqueta sigue diciendo lo mismo. */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setPrioridad("")}
          className={`rounded-lg border px-3 py-2 text-left text-sm ${prioridad === "" ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
        >
          <span className="block text-lg font-semibold tabular-nums text-slate-800">{todos.length}</span>
          <span className="text-xs text-slate-500">Todo</span>
        </button>
        {PRIORIDADES.map((p) => {
          const info = INFO_PRIORIDAD[p];
          return (
            <button
              key={p}
              onClick={() => setPrioridad(prioridad === p ? "" : p)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${prioridad === p ? "border-brand bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              <span className={`block text-lg font-semibold tabular-nums ${info.texto}`}>{conteo[p]}</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${info.punto}`} aria-hidden />
                {info.etiqueta}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por asunto, persona o detalle…" className="min-w-0 flex-1 sm:max-w-xs" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Todos los asuntos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Todas las personas</option>
          {personas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {hayFiltro && (
          <button
            onClick={() => {
              setBusqueda("");
              setPrioridad("");
              setTipo("");
              setPersona("");
            }}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Quitar filtros
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-brand-green-200 bg-brand-green-50 px-4 py-6 text-sm text-brand-green-700">
          <IconCheckCircle className="h-4 w-4 shrink-0" aria-hidden />
          {hayFiltro ? "Nada que hacer con estos filtros." : "No hay nada pendiente. Todo está al día."}
        </p>
      ) : (
        <div className="overflow-x-auto tarjeta">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 font-medium">Prioridad</th>
                <th className="px-3 py-2 font-medium">Asunto</th>
                <th className="px-3 py-2 font-medium">Persona / Servicio</th>
                <th className="px-3 py-2 font-medium">Qué pasa</th>
                <th className="px-3 py-2 font-medium">Hora</th>
                <th className="px-3 py-2 text-right font-medium">Esperando</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const info = INFO_PRIORIDAD[a.prioridad];
                return (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${info.texto}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${info.punto}`} aria-hidden />
                        {info.etiqueta}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{a.tipo}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="block text-slate-700">{a.persona}</span>
                      {a.servicio && <span className="block text-xs text-slate-400">{a.servicio}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{a.detalle}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-500">{a.cuando ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                      {a.desde > 0 ? hace(a.desde) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        onClick={() => abrir(a)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        {a.accion}
                        <IconArrowRight className="ml-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visibles.length > 0 && visibles.length !== todos.length && (
        <p className="text-xs text-slate-400">
          {visibles.length} de {todos.length} asuntos.
        </p>
      )}

      {/* Resolver la jornada atascada sin salir de aquí. */}
      {jornada && (
        <ResolverJornadaModal
          visitaId={jornada.visitaId}
          codigo={jornada.codigo}
          persona={todos.find((a) => a.destino.tipo === "jornada" && a.destino.visitaId === jornada.visitaId)?.persona ?? "la persona"}
          profesional={jornada.profesional}
          horaInicioProg={jornada.horaInicioProg}
          horaFinProg={jornada.horaFinProg}
          onClose={() => setJornada(null)}
          onResuelta={() => void cargar()}
        />
      )}
    </div>
  );
}
