import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import type { Incidencia } from "../../lib/types.js";

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

  async function cargar() {
    setI(await api.get<Incidencia>(`/incidencias/${incidenciaId}`, token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidenciaId]);

  async function recargar() {
    await cargar();
    onChanged();
  }

  async function cambiarEstado(estado: string) {
    await api.post(`/incidencias/${incidenciaId}/estado`, { estado }, token);
    await recargar();
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

        {!esCancelacion && siguientes.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Cambiar estado</p>
            <div className="flex flex-wrap gap-2">
              {siguientes.map((estado) => (
                <button key={estado} onClick={() => cambiarEstado(estado)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
                  → {estado.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
        )}

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
                      {h.estadoAnterior?.replace(/_/g, " ")} → {h.estadoNuevo.replace(/_/g, " ")}
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
