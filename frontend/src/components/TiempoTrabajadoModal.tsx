import { useMemo, useState } from "react";
import { Modal } from "./Modal.js";

function aHora(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function duracion(horaInicio: string, horaFin: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(horaInicio) || !/^\d{2}:\d{2}$/.test(horaFin)) return null;
  if (horaInicio === horaFin) return null;
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);
  let minutos = hf * 60 + mf - (hi * 60 + mi);
  // Turno de noche: la hora de fin cae al día siguiente.
  if (minutos < 0) minutos += 24 * 60;
  return minutos / 60;
}

export function formatearDuracion(horas: number): string {
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

interface Props {
  titulo: string;
  // Qué pasa cuando se confirma, en una frase: "se cerrará la tarea y pasará
  // a coordinación", "se verificará y quedará lista para facturar".
  explicacion: string;
  etiquetaConfirmar: string;
  // El cronómetro y el horario previsto solo proponen: quien cierra decide.
  inicioSugerido?: string | null;
  finSugerido?: string | null;
  horaInicioProg?: string | null;
  horaFinProg?: string | null;
  conObservacion?: boolean;
  onConfirmar: (datos: { horaInicio: string; horaFin: string; observacion?: string }) => Promise<void>;
  onClose: () => void;
}

// El tiempo trabajado es la base de la factura, así que nadie cierra ni
// verifica una jornada sin decir cuánto ha durado. Antes salía del cronómetro
// y, si el profesional se olvidaba de pulsarlo, la jornada llegaba a
// facturación con cero horas sin que saltara nada.
export function TiempoTrabajadoModal({
  titulo,
  explicacion,
  etiquetaConfirmar,
  inicioSugerido,
  finSugerido,
  horaInicioProg,
  horaFinProg,
  conObservacion = false,
  onConfirmar,
  onClose,
}: Props) {
  const inicioInicial = aHora(inicioSugerido) || horaInicioProg || "";
  const [horaInicio, setHoraInicio] = useState(inicioInicial);
  const [horaFin, setHoraFin] = useState(() => {
    const propuesta = aHora(finSugerido) || horaFinProg || "";
    // La propuesta solo sirve si cae después de la entrada. No es el caso
    // cuando el cronómetro se acaba de arrancar (entrada y "ahora" son la
    // misma hora) ni cuando la jornada empezó más tarde de lo previsto (el
    // fin previsto ya ha pasado). En ambos casos se propone lo que se sabe
    // de verdad: la duración prevista, contada desde la entrada real.
    const valida = propuesta && inicioInicial && duracion(inicioInicial, propuesta) !== null && propuesta > inicioInicial;
    if (valida) return propuesta;

    const previstas = horaInicioProg && horaFinProg ? duracion(horaInicioProg, horaFinProg) : null;
    if (!previstas || !inicioInicial) return "";
    const [h, m] = inicioInicial.split(":").map(Number);
    const total = (h * 60 + m + Math.round(previstas * 60)) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
  const [observacion, setObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horas = useMemo(() => duracion(horaInicio, horaFin), [horaInicio, horaFin]);
  const vieneDelCronometro = !!inicioSugerido;

  async function confirmar() {
    if (horas === null) {
      setError("Indica a qué hora empezó y a qué hora terminó. No pueden ser la misma hora.");
      return;
    }
    if (horas > 16) {
      setError(`Son ${formatearDuracion(horas)} seguidas. Revisa las horas: si de verdad fue así, pártelo en dos jornadas.`);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onConfirmar({ horaInicio, horaFin, observacion: observacion.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
      setGuardando(false);
    }
  }

  return (
    <Modal title={titulo} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{explicacion}</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-500">
            Empezó a las
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-800"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Terminó a las
            <input
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-800"
            />
          </label>
        </div>

        {/* La duración se recalcula a cada tecla: es la cifra que se factura,
            así que se ve antes de confirmar, no después. */}
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
          {horas === null ? (
            <p className="text-sm text-slate-400">Indica las dos horas para ver la duración</p>
          ) : (
            <>
              <p className="text-2xl font-semibold text-slate-900">{formatearDuracion(horas)}</p>
              <p className="text-xs text-slate-500">es el tiempo que se factura</p>
            </>
          )}
        </div>

        {vieneDelCronometro && (
          <p className="text-xs text-slate-400">
            La hora de entrada viene del cronómetro; la de salida es solo una propuesta. Corrige lo que no cuadre con la realidad.
          </p>
        )}
        {!vieneDelCronometro && (horaInicioProg || horaFinProg) && (
          <p className="text-xs text-amber-600">
            No hay cronómetro para esta jornada: las horas propuestas son las previstas ({horaInicioProg}–{horaFinProg}). Confirma o corrige lo que
            duró de verdad.
          </p>
        )}

        {conObservacion && (
          <label className="block text-xs font-medium text-slate-500">
            Observación (opcional)
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={2}
              placeholder="Qué tal ha ido, algo que deba saber coordinación…"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        )}

        {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={guardando || horas === null}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : etiquetaConfirmar}
          </button>
        </div>
      </div>
    </Modal>
  );
}
