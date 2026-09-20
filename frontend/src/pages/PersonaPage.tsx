import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
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

// Interfaz CUIDA PERSONAS (sección 9): "la persona no debería tener que
// conocer el nombre técnico del servicio que necesita" (sección 2). Un
// solo toque sobre un botón grande crea la solicitud; sin formularios,
// sin selects, sin texto obligatorio.
export function PersonaPage() {
  const { token, usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

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

  async function pedirAyuda(necesidad: Necesidad) {
    if (!usuario?.personaId) return;
    setEnviando(necesidad.id);
    setMensaje(null);
    try {
      await api.post(
        "/solicitudes",
        { personaId: usuario.personaId, necesidadId: necesidad.id, descripcionLibre: `Necesito ayuda: ${necesidad.nombre}` },
        token,
      );
      setMensaje(`Hecho. Hemos avisado de que necesitas: ${necesidad.nombre.toLowerCase()}.`);
      await cargar();
    } finally {
      setEnviando(null);
    }
  }

  const enCurso = solicitudes.find((s) => s.servicio && s.servicio.estado !== "CERRADO");

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">¿En qué necesitas ayuda?</h2>

      {enCurso?.servicio && (
        <Card title="Tu próximo servicio">
          <p className="text-base text-slate-700">
            {enCurso.necesidad.nombre} — <EstadoBadge estado={enCurso.servicio.estado} />
          </p>
        </Card>
      )}

      {mensaje && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-700">{mensaje}</div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {necesidades.map((n) => (
          <button
            key={n.id}
            onClick={() => pedirAyuda(n)}
            disabled={enviando !== null}
            className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 py-4 text-center shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="text-3xl">{ICONOS[n.codigo] ?? "❓"}</span>
            <span className="text-base font-medium leading-tight text-slate-800">
              {enviando === n.id ? "Enviando…" : n.nombre}
            </span>
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
    </div>
  );
}
