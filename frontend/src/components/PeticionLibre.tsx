import { useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { IconNote, IconPencil } from "./icons.js";

// Lo que la familia o la persona escribió al pedir el servicio, con sus
// palabras.
//
// Ese texto era lo más importante de la solicitud —es lo único que no sale de un
// desplegable— y estaba en una línea gris minúscula, dentro de un bloque plegado
// que sólo se abría a propósito. Aquí se ve nada más abrir la ficha, y se puede
// corregir o completar: coordinación suele afinarlo tras hablar por teléfono.
export function PeticionLibre({ solicitudId, texto, editable, onGuardado }: {
  solicitudId: string;
  texto: string;
  editable: boolean;
  onGuardado: () => void | Promise<void>;
}) {
  const { token } = useAuth();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(texto);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!valor.trim()) return setError("El texto no puede quedarse vacío.");
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/solicitudes/${solicitudId}`, { descripcionLibre: valor.trim() }, token);
      setEditando(false);
      await onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <IconNote className="h-3.5 w-3.5" /> Lo que pidió
        </p>
        {editable && !editando && (
          <button
            onClick={() => {
              setValor(texto);
              setEditando(true);
            }}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700"
          >
            <IconPencil className="h-3 w-3" /> Editar
          </button>
        )}
      </div>

      {editando ? (
        <div className="space-y-2">
          <textarea autoFocus value={valor} onChange={(e) => setValor(e.target.value)} rows={3} className="campo w-full" />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => void guardar()} disabled={guardando} className="boton-principal-sm">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setEditando(false)} className="boton-secundario-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line text-sm text-slate-700">{texto || <span className="text-slate-400">No escribió nada.</span>}</p>
      )}
    </section>
  );
}
