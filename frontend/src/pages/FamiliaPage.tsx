import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { ConversacionesPanel } from "../components/ConversacionesPanel.js";
import type { Necesidad, PersonaConFamiliares, Solicitud } from "../lib/types.js";

const ICONOS: Record<string, string> = {
  compra: "🛒",
  acompanamiento: "🚶",
  compania: "💬",
  tareas_domesticas: "🧹",
  comida: "🍲",
  recados: "📦",
  paseo: "🌳",
  citas: "🩺",
  apoyo_puntual: "🤝",
};

const SERVICIO_CANCELABLE = ["PENDIENTE", "ASIGNADO", "CONFIRMADO", "EN_CURSO"];

// Interfaz CUIDA FAMILIA (sección 9): lo mismo que Persona, pero "más
// avanzado" — perfil completo de la persona a cargo y el historial íntegro
// de servicios/solicitudes en un único apartado.
export function FamiliaPage() {
  const { token } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, PersonaConFamiliares>>({});
  const [necesidadModal, setNecesidadModal] = useState<Necesidad | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [sols, necs] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Necesidad[]>("/necesidades", token),
    ]);
    setSolicitudes(sols);
    setNecesidades(necs);

    const personaIds = Array.from(new Set(sols.map((s) => s.persona.id)));
    const detalles = await Promise.all(personaIds.map((id) => api.get<PersonaConFamiliares>(`/personas/${id}`, token)));
    setPerfiles(Object.fromEntries(detalles.map((p) => [p.id, p])));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancelarServicio(servicioId: string) {
    await api.post(`/servicios/${servicioId}/solicitar-cancelacion`, {}, token);
    setMensaje("Hemos avisado a coordinación. Te confirmarán la cancelación.");
    await cargar();
  }

  const personas = Object.values(perfiles);

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Seguimiento familiar</h2>

      {mensaje && <div className="mb-4 rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">{mensaje}</div>}

      <ConversacionesPanel />

      {personas.map((p) => (
        <Card key={p.id} title={`${p.nombre} ${p.apellidos}`}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-400">Código</dt>
              <dd className="text-slate-700">{p.codigo}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Dirección</dt>
              <dd className="text-slate-700">{p.direccion || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Teléfono</dt>
              <dd className="text-slate-700">{p.telefono || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Preferencias</dt>
              <dd className="text-slate-700">{p.preferencias || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Medicación</dt>
              <dd className="text-slate-700">{p.medicacion || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Médico / centro de referencia</dt>
              <dd className="text-slate-700">{p.medico || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-400">Contactos de emergencia</dt>
              <dd className="text-slate-700">{p.contactos || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-400">Recomendaciones</dt>
              <dd className="text-slate-700">{p.recomendaciones || "—"}</dd>
            </div>
          </dl>
        </Card>
      ))}

      {personas.length > 0 && (
        <Card title="Solicitar ayuda">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {necesidades.map((n) => (
              <button
                key={n.id}
                onClick={() => setNecesidadModal(n)}
                className="flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-2 py-3 text-center hover:border-slate-400 hover:bg-slate-50"
              >
                <span className="text-2xl">{ICONOS[n.codigo] ?? "❓"}</span>
                <span className="text-sm font-medium text-slate-800">{n.nombre}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card title="Todos los servicios y solicitudes">
        {solicitudes.length === 0 && <p className="text-sm text-slate-500">Todavía no hay solicitudes.</p>}
        <ul className="divide-y divide-slate-100">
          {solicitudes.map((s) => (
            <li key={s.id} className="py-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {s.persona.nombre} · {s.necesidad.nombre}
                  </p>
                  <p className="text-xs text-slate-400">
                    {s.codigo} · {s.descripcionLibre}
                  </p>
                </div>
                <EstadoBadge estado={s.estado} />
              </div>
              {s.servicio && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-2 text-xs text-slate-500">
                  <span>Servicio {s.servicio.codigo}</span>
                  <EstadoBadge estado={s.servicio.estado} />
                  {(s.servicio.tarifaImporte != null || s.servicio.tarifaTipo) && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                      {s.servicio.tarifaTipo === "VOLUNTARIO" ? "Voluntario (sin coste)" : `${s.servicio.tarifaImporte} €`}
                    </span>
                  )}
                  {s.servicio.empresaColaboradora && <span className="text-slate-400">vía {s.servicio.empresaColaboradora.nombre}</span>}
                  {s.servicio.profesional && ["CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO"].includes(s.servicio.estado) && (
                    <span className="text-slate-600">
                      {s.servicio.profesional.nombre} {s.servicio.profesional.apellidos}
                      {s.servicio.profesional.telefono && ` · ${s.servicio.profesional.telefono}`}
                    </span>
                  )}
                  {SERVICIO_CANCELABLE.includes(s.servicio.estado) && (
                    <button onClick={() => setCancelando(s.servicio!.id)} className="ml-auto rounded-md border border-rose-200 px-2 py-0.5 text-rose-600 hover:bg-rose-50">
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {necesidadModal && (
        <SolicitudModal
          necesidad={necesidadModal}
          personas={personas}
          onClose={() => setNecesidadModal(null)}
          onCreated={() => {
            setMensaje("Solicitud enviada en nombre de la persona a tu cargo.");
            cargar();
          }}
        />
      )}

      {cancelando && (
        <ConfirmModal
          title="Cancelar servicio"
          description="Avisaremos a coordinación. Te lo confirmarán antes de cancelarlo del todo."
          confirmLabel="Sí, avisar"
          danger
          onConfirm={() => cancelarServicio(cancelando)}
          onClose={() => setCancelando(null)}
        />
      )}
    </div>
  );
}
