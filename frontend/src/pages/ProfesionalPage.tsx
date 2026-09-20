import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import type { Servicio, Visita } from "../lib/types.js";

export function ProfesionalPage() {
  const { token, usuario } = useAuth();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [propuestas, setPropuestas] = useState<Servicio[]>([]);
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});
  const [perfilAbierto, setPerfilAbierto] = useState<string | null>(null);

  async function cargar() {
    if (!usuario?.profesionalId) return;
    const [agenda, servicios] = await Promise.all([
      api.get<Visita[]>(`/profesionales/${usuario.profesionalId}/agenda`, token),
      api.get<Servicio[]>("/servicios", token),
    ]);
    setVisitas(agenda);
    setPropuestas(servicios.filter((s) => s.estado === "ASIGNADO"));
  }

  async function aceptar(servicioId: string) {
    await api.post(`/servicios/${servicioId}/aceptar`, {}, token);
    await cargar();
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

      {propuestas.length > 0 && (
        <Card title="Te han propuesto estos servicios">
          <ul className="space-y-2">
            {propuestas.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <span>
                  {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos} · {s.solicitud?.necesidad.nombre}
                </span>
                <button onClick={() => aceptar(s.id)} className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-800">
                  Aceptar
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {visitas.length === 0 && <p className="text-sm text-slate-500">No tienes visitas programadas.</p>}

      {visitas.map((v) => {
        const persona = v.servicio?.solicitud.persona;
        return (
          <Card key={v.id}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {persona?.nombre} {persona?.apellidos} — {v.servicio?.solicitud.necesidad.nombre}
                </p>
                <p className="text-xs text-slate-400">
                  {v.codigo} · {new Date(v.fecha).toLocaleDateString("es-ES")} {v.horaInicioProg ? `· ${v.horaInicioProg}-${v.horaFinProg}` : ""}
                </p>
                {persona?.direccion && <p className="mt-0.5 text-xs text-slate-500">📍 {persona.direccion}</p>}
              </div>
              <EstadoBadge estado={v.estado} />
            </div>

            {persona && (
              <button
                onClick={() => setPerfilAbierto(perfilAbierto === v.id ? null : v.id)}
                className="mb-2 text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700"
              >
                {perfilAbierto === v.id ? "Ocultar perfil" : "Ver perfil completo"}
              </button>
            )}

            {perfilAbierto === v.id && persona && (
              <dl className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <dt className="text-slate-400">Teléfono</dt>
                  <dd>{persona.telefono || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Preferencias</dt>
                  <dd>{persona.preferencias || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Medicación</dt>
                  <dd>{persona.medicacion || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Médico / centro de referencia</dt>
                  <dd>{persona.medico || "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-slate-400">Contactos de emergencia</dt>
                  <dd>{persona.contactos || "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-slate-400">Recomendaciones</dt>
                  <dd>{persona.recomendaciones || "—"}</dd>
                </div>
              </dl>
            )}

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
                <button onClick={() => iniciar(v.id)} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">
                  He llegado
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
                  <button onClick={() => finalizar(v.id)} className="rounded-md bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-green-800">
                    Cerrar tarea
                  </button>
                </div>
              )}
              {v.estado === "FINALIZADA" && <span className="text-xs text-slate-400">Enviada a coordinación para verificar</span>}
              {v.estado === "REVISADA" && <span className="text-xs text-brand-green-600">Verificada y archivada</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
