import { useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Modal } from "./Modal.js";
import type { Necesidad, Persona } from "../lib/types.js";

const FRANJAS = ["Mañana", "Tarde", "Todo el día"];

interface Props {
  necesidad?: Necesidad;
  necesidades?: Necesidad[];
  personaId?: string;
  personas?: Persona[];
  onClose: () => void;
  onCreated: () => void;
}

// Ventana dinámica y sencilla: "¿cuándo? ¿cuántos días?" — sin selects
// complicados ni texto obligatorio (principio UX del masterplan: la persona
// no debería tener que conocer el nombre técnico del servicio que necesita).
export function SolicitudModal({ necesidad, necesidades, personaId, personas, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const [personaSel, setPersonaSel] = useState(personaId ?? personas?.[0]?.id ?? "");
  const [necesidadSel, setNecesidadSel] = useState(necesidad?.id ?? necesidades?.[0]?.id ?? "");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [dias, setDias] = useState(1);
  const [franja, setFranja] = useState("Mañana");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  const necesidadNombre = necesidad?.nombre ?? necesidades?.find((n) => n.id === necesidadSel)?.nombre ?? "";

  async function confirmar() {
    setEnviando(true);
    try {
      await api.post(
        "/solicitudes",
        {
          personaId: personaSel,
          necesidadId: necesidadSel,
          descripcionLibre: nota ? `Necesito ayuda: ${necesidadNombre}. ${nota}` : `Necesito ayuda: ${necesidadNombre}`,
          fechaInicio: new Date(fecha).toISOString(),
          dias,
          franjaHoraria: franja,
        },
        token,
      );
      onCreated();
      onClose();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title={necesidad ? necesidad.nombre : "Nueva solicitud"} onClose={onClose}>
      <div className="space-y-4">
        {personas && (
          <div>
            <label className="mb-1 block text-sm text-slate-600">Para quién</label>
            <select value={personaSel} onChange={(e) => setPersonaSel(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos}
                </option>
              ))}
            </select>
          </div>
        )}

        {necesidades && (
          <div>
            <label className="mb-1 block text-sm text-slate-600">Qué necesita</label>
            <select value={necesidadSel} onChange={(e) => setNecesidadSel(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {necesidades.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-base text-slate-700">¿Cuándo empieza?</label>
          <input
            type="date"
            value={fecha}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base"
          />
        </div>

        <div>
          <label className="mb-1 block text-base text-slate-700">¿Cuántos días?</label>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setDias((d) => Math.max(1, d - 1))}
              className="h-11 w-11 rounded-full border-2 border-slate-300 text-xl font-semibold text-slate-600 hover:bg-slate-100"
              aria-label="Menos días"
            >
              −
            </button>
            <span className="w-12 text-center text-2xl font-semibold text-slate-800">{dias}</span>
            <button
              type="button"
              onClick={() => setDias((d) => Math.min(90, d + 1))}
              className="h-11 w-11 rounded-full border-2 border-slate-300 text-xl font-semibold text-slate-600 hover:bg-slate-100"
              aria-label="Más días"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-base text-slate-700">¿Mañana o tarde?</label>
          <div className="flex gap-2">
            {FRANJAS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFranja(f)}
                className={`flex-1 rounded-lg border-2 px-2 py-2 text-sm font-medium ${
                  franja === f ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-500">¿Algo más que quieras contarnos? (opcional)</label>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <button
          onClick={confirmar}
          disabled={enviando || !personaSel || !necesidadSel}
          className="w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}
