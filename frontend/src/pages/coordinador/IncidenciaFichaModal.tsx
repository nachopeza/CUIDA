import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import type { CuentaResumen, Incidencia } from "../../lib/types.js";
import { IconArrowRight, IconCheckCircle } from "../../components/icons.js";

// Espejo de TRANSICIONES_INCIDENCIA del backend (backend/src/services/estados.ts).
const TRANSICIONES_INCIDENCIA: Record<string, string[]> = {
  NUEVA: ["EN_REVISION"],
  EN_REVISION: ["ASIGNADA"],
  ASIGNADA: ["EN_RESOLUCION"],
  EN_RESOLUCION: ["RESUELTA"],
  RESUELTA: ["CERRADA"],
  CERRADA: [],
};

interface Props {
  incidenciaId: string;
  onClose: () => void;
  onChanged: () => void;
}

// Ficha de incidencia (sección "cuando llega una incidencia no se puede
// hacer nada, queda solamente avanzar a en revisión — se debe poder abrir
// el panel, escribir anotaciones o cambiar el estado más dinámicamente"):
// historial completo + notas libres + todas las transiciones válidas desde
// el estado actual, no solo "avanzar un paso".
export function IncidenciaFichaModal({ incidenciaId, onClose, onChanged }: Props) {
  const { token } = useAuth();
  const [i, setI] = useState<Incidencia | null>(null);
  const [nota, setNota] = useState("");
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [coordinadores, setCoordinadores] = useState<CuentaResumen[]>([]);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setI(await api.get<Incidencia>(`/incidencias/${incidenciaId}`, token));
  }

  useEffect(() => {
    cargar();
    api.get<CuentaResumen[]>("/cuenta/coordinadores", token).then(setCoordinadores).catch(() => setCoordinadores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidenciaId]);

  async function recargar() {
    await cargar();
    onChanged();
  }

  async function cambiarEstado(estado: string) {
    setError(null);
    try {
      await api.post(`/incidencias/${incidenciaId}/estado`, { estado }, token);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cambiar el estado");
    }
  }

  // Cerrar sin recorrer el pipeline entero: la mayoría se resuelven de una
  // llamada y obligar a dar cinco pasos hacía que nadie las cerrara.
  async function cerrar() {
    setCerrando(true);
    setError(null);
    try {
      await api.post(`/incidencias/${incidenciaId}/cerrar`, {}, token);
      await recargar();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cerrar");
      setCerrando(false);
    }
  }

  async function asignar(responsableUsuarioId: string) {
    setError(null);
    try {
      await api.post(`/incidencias/${incidenciaId}/asignar`, { responsableUsuarioId: responsableUsuarioId || null }, token);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido asignar");
    }
  }

  async function enviarNota() {
    if (!nota.trim()) return;
    setEnviandoNota(true);
    try {
      await api.post(`/incidencias/${incidenciaId}/nota`, { nota: nota.trim() }, token);
      setNota("");
      await recargar();
    } finally {
      setEnviandoNota(false);
    }
  }

  if (!i) {
    return (
      <Modal title="Cargando…" onClose={onClose}>
        <p className="text-sm text-slate-500">Cargando incidencia…</p>
      </Modal>
    );
  }

  const esCancelacion = i.tipo === "SOLICITUD_CANCELACION";
  const siguientes = TRANSICIONES_INCIDENCIA[i.estado] ?? [];

  return (
    <Modal title={`${i.codigo} · ${esCancelacion ? "Solicitud de cancelación" : "Incidencia"}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-700">{i.descripcion}</p>
            <p className="mt-1 text-xs text-slate-400">
              Prioridad {i.prioridad.toLowerCase()}
              {i.servicio?.solicitud && ` · ${i.servicio.solicitud.persona.nombre} · ${i.servicio.solicitud.necesidad.nombre}`}
            </p>
          </div>
          <EstadoBadge estado={i.estado} />
        </div>

        {/* El estado como desplegable, igual que en el servicio: ofrece solo
            los pasos a los que de verdad se puede ir desde donde está, en vez
            de una fila de botones que crecía con cada fase. */}
        {!esCancelacion && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Estado
              <select
                value=""
                onChange={(e) => e.target.value && cambiarEstado(e.target.value)}
                disabled={siguientes.length === 0}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm font-normal normal-case text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {i.estado.replace(/_/g, " ").toLowerCase()}
                  {siguientes.length === 0 ? " · sin más pasos" : " · pasar a…"}
                </option>
                {siguientes.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado.replace(/_/g, " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </label>

            {/* A quién le toca resolverla. Sin esto, en el listado ponía
                "sin asignar" y nadie sabía de quién era. */}
            <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Asignada a
              <select
                value={i.responsable ? coordinadores.find((c) => c.email === i.responsable?.email)?.id ?? "" : ""}
                onChange={(e) => asignar(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm font-normal normal-case text-slate-700"
              >
                <option value="">Sin asignar</option>
                {coordinadores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre ?? c.email}
                  </option>
                ))}
              </select>
            </label>

            {/* Cerrar de un tirón, sin pasar por revisión, asignación y
                resolución: va directa a archivadas. */}
            {i.estado !== "CERRADA" && (
              <button
                onClick={cerrar}
                disabled={cerrando}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <IconCheckCircle className="h-4 w-4" />
                {cerrando ? "Cerrando…" : "Cerrar incidencia y archivar"}
              </button>
            )}
          </div>
        )}

        {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Anotaciones</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escribe una anotación…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              onClick={enviarNota}
              disabled={enviandoNota || !nota.trim()}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        </div>

        {i.estadoHistorial && i.estadoHistorial.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial</p>
            <ul className="space-y-1.5 text-xs text-slate-600">
              {[...i.estadoHistorial].reverse().map((h) => (
                <li key={h.id} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <span className="text-slate-400">{new Date(h.createdAt).toLocaleString("es-ES")}</span>
                  {h.estadoAnterior !== h.estadoNuevo && (
                    <span className="ml-2 font-medium text-slate-700">
                      {h.estadoAnterior?.replace(/_/g, " ")} <IconArrowRight className="inline h-3 w-3 align-text-bottom text-slate-300" /> {h.estadoNuevo.replace(/_/g, " ")}
                    </span>
                  )}
                  {h.motivo && <p className="mt-0.5">{h.motivo}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
