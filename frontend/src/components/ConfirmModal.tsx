import { useState } from "react";
import { Modal } from "./Modal.js";

interface Props {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmModal({ title, description, confirmLabel, danger, onConfirm, onClose }: Props) {
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-4 text-base text-slate-600">{description}</p>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-600 hover:bg-slate-50">
          Volver
        </button>
        <button
          onClick={confirmar}
          disabled={enviando}
          className={`flex-1 rounded-lg px-4 py-2.5 text-base font-semibold text-white disabled:opacity-50 ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-800"}`}
        >
          {enviando ? "Enviando…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
