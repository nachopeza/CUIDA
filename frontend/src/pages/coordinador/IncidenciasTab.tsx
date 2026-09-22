import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { SearchBox } from "../../components/SearchBox.js";
import { ThOrdenable } from "../../components/ThOrdenable.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { Pagination, usePaginacion } from "../../components/Pagination.js";
import { IconAlert, IconBan, IconPlus } from "../../components/icons.js";
import { useOrdenacion } from "../../lib/useOrdenacion.js";
import { useSeleccion } from "../../lib/useSeleccion.js";
import { exportarCSV } from "../../lib/csv.js";
import { MOTIVOS_INCIDENCIA, infoMotivo } from "../../lib/incidencias.js";
import { IncidenciaFormModal } from "./IncidenciaFormModal.js";
import type { Incidencia, Servicio } from "../../lib/types.js";

// Pipeline del ticket. El orden importa: es lo que dibuja el progreso.
const PIPELINE = ["NUEVA", "EN_REVISION", "ASIGNADA", "EN_RESOLUCION", "RESUELTA", "CERRADA"];

const PRIORIDAD_PUNTO: Record<string, string> = { ALTA: "bg-rose-500", MEDIA: "bg-amber-400", BAJA: "bg-slate-300" };
const PRIORIDAD_ORDEN: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

// El caso cuelga del servicio o de la jornada. Mirando solo el servicio, una
// incidencia abierta por un profesional desde su jornada salía sin nombre.
function casoDe(i: Incidencia) {
  return i.servicio?.solicitud ?? i.visita?.servicio?.solicitud ?? null;
}

function personaDe(i: Incidencia) {
  const p = casoDe(i)?.persona;
  return p ? `${p.nombre} ${p.apellidos}` : "—";
}

function abierta(i: Incidencia) {
  return !["RESUELTA", "CERRADA"].includes(i.estado);
}

interface Props {
  incidencias: Incidencia[];
  servicios: Servicio[];
  onAbrirFicha: (id: string) => void;
  onConfirmarCancelacion: (servicioId: string) => Promise<void>;
  onRechazarCancelacion: (servicioId: string) => Promise<void>;
  onCambiado: () => void;
}

// Incidencias con la misma estructura que el resto de ventanas: buscador,
// columnas ordenables, filtros, selección, exportación y paginación. Antes
// era una pila de tarjetas — se veía bien con tres, pero con treinta no
// había forma de encontrar nada ni de comparar, que es justo para lo que
// sirve una bandeja de tickets.
export function IncidenciasTab({ incidencias, servicios, onAbrirFicha, onConfirmarCancelacion, onRechazarCancelacion, onCambiado }: Props) {
  const { token } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [prioridadFiltro, setPrioridadFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("abiertas");
  const [motivoFiltro, setMotivoFiltro] = useState("");
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return incidencias.filter((i) => {
      if (prioridadFiltro && i.prioridad !== prioridadFiltro) return false;
      if (motivoFiltro && (i.motivo ?? "OTRO") !== motivoFiltro) return false;
      if (estadoFiltro === "abiertas" && !abierta(i)) return false;
      if (estadoFiltro === "archivadas" && abierta(i)) return false;
      if (!q) return true;
      return [i.codigo, i.descripcion, personaDe(i), i.servicio?.codigo ?? i.visita?.servicio?.codigo ?? "", infoMotivo(i.motivo).etiqueta].join(" ").toLowerCase().includes(q);
    });
  }, [incidencias, prioridadFiltro, motivoFiltro, estadoFiltro, busqueda]);

  const orden = useOrdenacion(filtradas, {
    codigo: (i) => i.codigo,
    persona: (i) => personaDe(i),
    motivo: (i) => infoMotivo(i.motivo).etiqueta,
    // Por prioridad se ordena por urgencia real, no por alfabeto: "ALTA"
    // antes que "BAJA" es casualidad, "MEDIA" en medio ya no lo sería.
    prioridad: (i) => PRIORIDAD_ORDEN[i.prioridad] ?? 9,
    estado: (i) => PIPELINE.indexOf(i.estado),
    responsable: (i) => i.responsable?.nombre ?? i.responsable?.email ?? null,
  });
  const seleccion = useSeleccion(orden.ordenadas);
  const { items: pagina, pagina: paginaActual, totalPaginas, setPagina } = usePaginacion(orden.ordenadas);

  const abiertasCount = incidencias.filter(abierta).length;
  const archivadasCount = incidencias.length - abiertasCount;

  async function eliminarSeleccionadas() {
    const elegidas = seleccion.seleccionadas;
    if (elegidas.length === 0) return;
    if (!window.confirm(`¿Eliminar ${elegidas.length} incidencia(s)? No se puede deshacer.`)) return;

    setError(null);
    const bloqueadas: string[] = [];
    for (const i of elegidas) {
      try {
        await api.delete(`/incidencias/${i.id}`, token);
      } catch {
        bloqueadas.push(i.codigo);
      }
    }
    seleccion.limpiar();
    if (bloqueadas.length > 0) {
      setError(
        `No se han podido eliminar ${bloqueadas.length}: ${bloqueadas.join(", ")}. Las peticiones de cancelación de la familia se confirman o se rechazan, no se borran.`,
      );
    }
    onCambiado();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por código, motivo, descripción o persona…" className="flex-1 sm:max-w-xs" />
        {/* Abiertas y archivadas son dos bandejas distintas: mezclarlas hacía
            que lo cerrado tapara lo que hay que atender. */}
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
          {[
            { valor: "abiertas", etiqueta: `Abiertas (${abiertasCount})` },
            { valor: "archivadas", etiqueta: `Archivadas (${archivadasCount})` },
            { valor: "", etiqueta: "Todas" },
          ].map((o) => (
            <button
              key={o.valor}
              onClick={() => setEstadoFiltro(o.valor)}
              className={`rounded px-2.5 py-1.5 font-medium transition ${
                estadoFiltro === o.valor ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
        <select value={motivoFiltro} onChange={(e) => setMotivoFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-xs">
          <option value="">Todos los motivos</option>
          {MOTIVOS_INCIDENCIA.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.etiqueta}
            </option>
          ))}
        </select>
        <select value={prioridadFiltro} onChange={(e) => setPrioridadFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-xs">
          <option value="">Todas las prioridades</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Media</option>
          <option value="BAJA">Baja</option>
        </select>
        <button
          onClick={() => setNuevaAbierta(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800"
        >
          <IconPlus className="h-3.5 w-3.5" /> Incidencia
        </button>
      </div>

      {error && <p className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {filtradas.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center">
          <IconAlert className="mx-auto mb-2 h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">
            {incidencias.length === 0 ? "No hay ninguna incidencia abierta. Buena señal." : "Ninguna incidencia coincide con estos filtros."}
          </p>
        </div>
      ) : (
        <div>
          <ExportarBarra
            total={filtradas.length}
            seleccionadas={seleccion.seleccionadas.length}
            onExportar={() =>
              exportarCSV(
                seleccion.seleccionadas.length > 0 ? seleccion.seleccionadas : filtradas,
                [
                  { encabezado: "Código", valor: (i) => i.codigo },
                  { encabezado: "Persona", valor: (i) => personaDe(i) },
                  { encabezado: "Servicio", valor: (i) => i.servicio?.codigo ?? "" },
                  { encabezado: "Motivo", valor: (i) => infoMotivo(i.motivo).etiqueta },
                  { encabezado: "Descripción", valor: (i) => i.descripcion },
                  { encabezado: "Prioridad", valor: (i) => i.prioridad },
                  { encabezado: "Asignada a", valor: (i) => i.responsable?.nombre ?? i.responsable?.email ?? "" },
                  { encabezado: "Estado", valor: (i) => i.estado },
                ],
                "incidencias",
              )
            }
            onSeleccionarTodo={seleccion.seleccionarTodo}
            onLimpiarSeleccion={seleccion.limpiar}
            onEliminar={eliminarSeleccionadas}
            etiquetaEliminar="Eliminar incidencias"
          />

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-4 py-2.5">
                    <input type="checkbox" checked={seleccion.todasMarcadas} onChange={seleccion.toggleTodos} />
                  </th>
                  <ThOrdenable campo="prioridad" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    <span className="sr-only">Prioridad</span>
                    <span aria-hidden>!</span>
                  </ThOrdenable>
                  <ThOrdenable campo="persona" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Persona
                  </ThOrdenable>
                  <ThOrdenable campo="motivo" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Motivo
                  </ThOrdenable>
                  <th className="px-4 py-2.5">Qué pasa</th>
                  <ThOrdenable campo="responsable" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Asignada a
                  </ThOrdenable>
                  <ThOrdenable campo="estado" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Estado
                  </ThOrdenable>
                  <th className="px-4 py-2.5">Acción</th>
                  <ThOrdenable campo="codigo" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Código
                  </ThOrdenable>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagina.map((i) => {
                  const motivo = infoMotivo(i.motivo);
                  const esCancelacion = i.tipo === "SOLICITUD_CANCELACION";
                  return (
                    <tr key={i.id} onClick={() => onAbrirFicha(i.id)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={seleccion.ids.has(i.id)} onChange={() => seleccion.toggle(i.id)} />
                      </td>
                      {/* La prioridad es un punto, no una palabra: en una
                          columna de treinta filas lo que hace falta es ver
                          de un vistazo cuáles arden. */}
                      <td className="px-4 py-2.5">
                        <span
                          className={`block h-2 w-2 rounded-full ${PRIORIDAD_PUNTO[i.prioridad] ?? "bg-slate-300"}`}
                          title={`Prioridad ${i.prioridad.toLowerCase()}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">
                        {personaDe(i)}
                        {casoDe(i) && <span className="block text-xs font-normal text-slate-400">{casoDe(i)!.necesidad.nombre}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600" title={motivo.ayuda}>
                        <span className="flex items-center gap-1.5">
                          {esCancelacion ? (
                            <>
                              <IconBan className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                              Cancelación
                            </>
                          ) : (
                            <>
                              <motivo.Icono className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              {motivo.etiqueta}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-slate-500" title={i.descripcion}>
                        {i.descripcion}
                      </td>
                      {/* A quién le toca. Si no se dice, nadie la coge. */}
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                        {i.responsable ? (
                          <span className="text-slate-600">{i.responsable.nombre ?? i.responsable.email.split("@")[0]}</span>
                        ) : (
                          <span className="text-slate-300">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <EstadoBadge estado={i.estado} />
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {esCancelacion && abierta(i) && i.servicioId ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => onConfirmarCancelacion(i.servicioId as string)}
                              className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => onRechazarCancelacion(i.servicioId as string)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                            >
                              Seguir
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => onAbrirFicha(i.id)} className="text-xs font-medium text-brand hover:text-brand-800">
                            Abrir
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">{i.codigo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} total={filtradas.length} />
          </div>
        </div>
      )}

      {nuevaAbierta && <IncidenciaFormModal servicios={servicios} onClose={() => setNuevaAbierta(false)} onCreada={onCambiado} />}
    </div>
  );
}
