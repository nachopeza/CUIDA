import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { ChatPanel } from "../components/ChatPanel.js";
import { cuentaAtras } from "../lib/fechas.js";
import type { Necesidad, Solicitud } from "../lib/types.js";

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

// Interfaz CUIDA PERSONAS (sección 9): "la persona no debería tener que
// conocer el nombre técnico del servicio que necesita" (sección 2). Un
// toque sobre un botón grande abre una ventana sencilla de cuándo/cuántos
// días; sin formularios largos.
export function PersonaPage() {
  const { token, usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
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

  const enCurso = solicitudes.find((s) => s.servicio && !["CERRADO", "CANCELADO"].includes(s.servicio.estado));
  const hoyISO = new Date().toISOString().slice(0, 10);
  const proximaVisita = enCurso?.servicio?.visitas?.find((v) => v.fecha.slice(0, 10) >= hoyISO && v.estado !== "REVISADA");

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">¿En qué necesitas ayuda?</h2>

      {enCurso?.servicio && (
        <Card title="Tu próximo servicio">
          {proximaVisita && (
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-brand-green-50 px-4 py-3">
              <span className="text-3xl font-bold text-brand-green-700">{cuentaAtras(proximaVisita.fecha)}</span>
              {proximaVisita.horaInicioProg && <span className="text-base text-brand-green-700">a las {proximaVisita.horaInicioProg}</span>}
            </div>
          )}
          <p className="text-base text-slate-700">
            {enCurso.necesidad.nombre} — <EstadoBadge estado={enCurso.servicio.estado} />
          </p>
          {enCurso.servicio.profesional && enCurso.servicio.estado !== "PENDIENTE" && enCurso.servicio.estado !== "ASIGNADO" && (
            <p className="mt-1 text-sm text-slate-500">
              {enCurso.servicio.profesional.nombre} {enCurso.servicio.profesional.apellidos}
              {enCurso.servicio.profesional.telefono && ` · ${enCurso.servicio.profesional.telefono}`}
            </p>
          )}
          {SERVICIO_CANCELABLE.includes(enCurso.servicio.estado) && (
            <button
              onClick={() => setCancelando(enCurso.servicio!.id)}
              className="mt-3 rounded-lg border-2 border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Ya no lo necesito, cancelar
            </button>
          )}
        </Card>
      )}

      {enCurso?.servicio?.profesionalId && (
        <div className="mb-4">
          <ChatPanel servicioId={enCurso.servicio.id} titulo={`Chat con ${enCurso.servicio.profesional?.nombre ?? "tu profesional"}`} />
        </div>
      )}

      {mensaje && (
        <div className="mb-4 rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-base text-brand-green-700">{mensaje}</div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {necesidades.map((n) => (
          <button
            key={n.id}
            onClick={() => setNecesidadModal(n)}
            className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 py-4 text-center shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
          >
            <span className="text-3xl">{ICONOS[n.codigo] ?? "❓"}</span>
            <span className="text-base font-medium leading-tight text-slate-800">{n.nombre}</span>
          </button>
        ))}
      </div>

      <Card title="Lo que has pedido antes">
        {solicitudes.length === 0 && <p className="text-base text-slate-500">Todavía no has pedido ayuda.</p>}
        <ul className="divide-y divide-slate-100">
          {solicitudes.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3 text-base">
              <span className="flex items-center gap-2 font-medium text-slate-800">
                <span className="text-xl">{ICONOS[s.necesidad.codigo] ?? "❓"}</span>
                {s.necesidad.nombre}
              </span>
              <EstadoBadge estado={s.estado} />
            </li>
          ))}
        </ul>
      </Card>

      {necesidadModal && (
        <SolicitudModal
          necesidad={necesidadModal}
          personaId={usuario!.personaId!}
          onClose={() => setNecesidadModal(null)}
          onCreated={() => setMensaje(`Hecho. Hemos avisado de que necesitas: ${necesidadModal.nombre.toLowerCase()}.`)}
        />
      )}

      {cancelando && (
        <ConfirmModal
          title="Cancelar servicio"
          description="Avisaremos a coordinación de que ya no necesitas este servicio. Te lo confirmarán antes de cancelarlo del todo."
          confirmLabel="Sí, avisar"
          danger
          onConfirm={() => cancelarServicio(cancelando)}
          onClose={() => setCancelando(null)}
        />
      )}
    </div>
  );
}
