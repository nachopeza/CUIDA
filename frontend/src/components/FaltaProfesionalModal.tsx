import { useState } from "react";
import { Modal } from "./Modal.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { IconAlert } from "./icons.js";

// Nadie ha ido a casa de la persona. No es una cancelación —nadie avisó— ni un
// no presentado —ahí el profesional sí se desplazó—: es lo más grave que puede
// pasar en ayuda a domicilio, porque hay alguien esperando.
//
// Registrarlo hace tres cosas a la vez: la jornada queda como no prestada y sin
// cobrar ni pagar, se abre una incidencia de prioridad alta colgando del
// servicio, y desde esa incidencia se busca el reemplazo.
const MOTIVOS = [
  { valor: "Enfermedad de la profesional", etiqueta: "Está enferma" },
  { valor: "No localizable", etiqueta: "No localizable" },
  { valor: "Problema de transporte", etiqueta: "Transporte" },
  { valor: "Error de planificación", etiqueta: "Error de planificación" },
];

export function FaltaProfesionalModal({
  visitaId,
  codigo,
  persona,
  onClose,
  onRegistrada,
}: {
  visitaId: string;
  codigo: string;
  persona: string;
  onClose: () => void;
  onRegistrada: () => void;
}) {
  const { token } = useAuth();
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const texto = [motivo, detalle.trim()].filter(Boolean).join(" · ");

  async function registrar() {
    setGuardando(true);
    setError(null);
    try {
      await api.post(`/visitas/${visitaId}/no-prestada`, { tipo: "FALTA_PROFESIONAL", motivo: texto }, token);
      onRegistrada();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido registrar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title={`No fue nadie · ${codigo}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {persona} se ha quedado sin el servicio. La jornada no se cobrará ni se pagará, y se abrirá una incidencia de
            prioridad alta para avisar a la familia y buscar reemplazo.
          </span>
        </p>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">¿Qué ha pasado?</p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.valor}
                onClick={() => setMotivo(m.valor)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  motivo === m.valor ? "bg-rose-600 text-white" : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <input
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Detalle (opcional): qué te han dicho"
          className="w-full campo"
        />

        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={registrar}
            disabled={guardando || texto.length < 3}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {guardando ? "Registrando…" : "Registrar y abrir incidencia"}
          </button>
          <button onClick={onClose} className="campo hover:bg-slate-50">
            Cancelar
          </button>
        </div>
        {texto.length < 3 && <p className="text-xs text-slate-400">Elige el motivo para poder registrarlo.</p>}
      </div>
    </Modal>
  );
}
