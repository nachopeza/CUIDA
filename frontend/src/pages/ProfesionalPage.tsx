import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import type { Visita } from "../lib/types.js";

export function ProfesionalPage() {
  const { token, usuario } = useAuth();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});

  async function cargar() {
    if (!usuario?.profesionalId) return;
    const agenda = await api.get<Visita[]>(`/profesionales/${usuario.profesionalId}/agenda`, token);
    setVisitas(agenda);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.profesionalId]);

  async function iniciar(id: string) {
    await api.post(`/visitas/${id}/iniciar`, {}, token);
    await cargar();
  }

  async function finalizar(id: string) {
    await api.post(`/visitas/${id}/finalizar`, { observacion: observaciones[id] || undefined }, token);
    setObservaciones((prev) => ({ ...prev, [id]: "" }));
    await cargar();
  }

  async function toggleTarea(visitaId: string, tareaId: string, completada: boolean) {
    await api.patch(`/visitas/${visitaId}/tareas`, { tareaId, completada }, token);
    await cargar();
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Tu agenda</h2>
      {visitas.length === 0 && <p className="text-sm text-slate-500">No tienes visitas programadas.</p>}

      {visitas.map((v) => (
        <Card key={v.id}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-medium">
                {v.servicio?.solicitud.persona.nombre} {v.servicio?.solicitud.persona.apellidos} — {v.servicio?.solicitud.necesidad.nombre}
              </p>
              <p className="text-xs text-slate-400">
                {v.codigo} · {new Date(v.fecha).toLocaleDateString("es-ES")} {v.horaInicioProg ? `· ${v.horaInicioProg}-${v.horaFinProg}` : ""}
              </p>
            </div>
            <EstadoBadge estado={v.estado} />
          </div>

          {v.tareas.length > 0 && (
            <ul className="mb-3 space-y-1">
              {v.tareas.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.completada}
                    disabled={v.estado !== "EN_CURSO"}
                    onChange={(e) => toggleTarea(v.id, t.id, e.target.checked)}
                  />
                  <span className={t.completada ? "text-slate-400 line-through" : ""}>{t.descripcion}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            {(v.estado === "PROGRAMADA" || v.estado === "CONFIRMADA") && (
              <button onClick={() => iniciar(v.id)} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
                Iniciar visita
              </button>
            )}
            {v.estado === "EN_CURSO" && (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="Observación (opcional)"
                  value={observaciones[v.id] ?? ""}
                  onChange={(e) => setObservaciones((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button onClick={() => finalizar(v.id)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                  Finalizar visita
                </button>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
