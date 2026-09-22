import { useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { MOTIVOS_INCIDENCIA, type MotivoIncidencia } from "../../lib/incidencias.js";
import type { Servicio } from "../../lib/types.js";

const PRIORIDADES = [
  { valor: "BAJA", etiqueta: "Baja", ayuda: "Puede esperar" },
  { valor: "MEDIA", etiqueta: "Media", ayuda: "Esta semana" },
  { valor: "ALTA", etiqueta: "Alta", ayuda: "Hoy mismo" },
] as const;

// Abrir una incidencia desde coordinación. Hasta ahora solo podían crearlas
// el profesional desde su visita o el propio sistema al pedir una
// cancelación: si te llamaba la familia por teléfono, no había dónde
// apuntarlo. Un ticket son tres cosas: a qué servicio afecta, de qué va y
// cuánto corre.
export function IncidenciaFormModal({
  servicios,
  servicioPreseleccionado,
  motivoPreseleccionado,
  descripcionSugerida,
  onClose,
  onCreada,
}: {
  servicios: Servicio[];
  servicioPreseleccionado?: string;
  motivoPreseleccionado?: MotivoIncidencia;
  // Cuando se abre desde la verificación, el texto llega redactado con el
  // descuadre concreto: se puede matizar, pero no hay que escribirlo entero.
  descripcionSugerida?: string;
  onClose: () => void;
  onCreada: () => void;
}) {
  const { token } = useAuth();
  const [servicioId, setServicioId] = useState(servicioPreseleccionado ?? "");
  const [motivo, setMotivo] = useState<MotivoIncidencia>(motivoPreseleccionado ?? "OTRO");
  const [prioridad, setPrioridad] = useState<(typeof PRIORIDADES)[number]["valor"]>("MEDIA");
  const [descripcion, setDescripcion] = useState(descripcionSugerida ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una incidencia se abre sobre un servicio vivo. Los cerrados y cancelados
  // no se ofrecen: no hay nada que resolver ahí.
  const abiertos = useMemo(
    () =>
      servicios
        .filter((s) => !["CERRADO", "CANCELADO"].includes(s.estado))
        .sort((a, b) => (a.solicitud?.persona.nombre ?? "").localeCompare(b.solicitud?.persona.nombre ?? "", "es")),
    [servicios],
  );

  async function crear() {
    if (!servicioId || !descripcion.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await api.post("/incidencias", { servicioId, motivo, prioridad, descripcion: descripcion.trim() }, token);
      onCreada();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido crear la incidencia");
      setGuardando(false);
    }
  }

  return (
    <Modal title="Nueva incidencia" onClose={onClose} size="lg">
      <div className="space-y-4">
        <label className="block text-xs font-medium text-slate-500">
          ¿A qué servicio afecta?
          <select
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
          >
            <option value="">Elige un servicio…</option>
            {abiertos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos} · {s.solicitud?.necesidad.nombre} · {s.codigo}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">¿De qué va?</p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_INCIDENCIA.map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => setMotivo(m.valor)}
                title={m.ayuda}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  motivo === m.valor ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <m.Icono className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                {m.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">¿Cuánto corre?</p>
          <div className="flex gap-1.5">
            {PRIORIDADES.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setPrioridad(p.valor)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition ${
                  prioridad === p.valor ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="block font-medium">{p.etiqueta}</span>
                <span className={`block text-[10px] ${prioridad === p.valor ? "text-white/70" : "text-slate-400"}`}>{p.ayuda}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block text-xs font-medium text-slate-500">
          ¿Qué ha pasado?
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Cuéntalo como se lo contarías a quien lo va a resolver…"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={crear}
            disabled={guardando || !servicioId || !descripcion.trim()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Abrir incidencia"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
