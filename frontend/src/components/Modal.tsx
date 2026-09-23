import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// "doc" es el ancho de un folio A4 más el respiro del modal: cualquier cosa
// más estrecha obligaría a encoger la factura justo cuando se revisa.
const ANCHOS = { sm: "max-w-sm", lg: "max-w-2xl", doc: "max-w-[calc(210mm+2.5rem)]" };

export function Modal({
  title,
  onClose,
  children,
  size = "sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "lg" | "doc";
}) {
  // El modal se monta colgando de <body> y no dentro de la página. Así, al
  // imprimir un documento, la hoja no arrastra consigo la aplicación entera:
  // basta con esconder la app y dejar el modal (ver index.css). Los eventos
  // siguen subiendo por el árbol de React, así que nada más cambia.
  return createPortal(
    <div className="modal-fondo fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className={`modal-caja max-h-[90vh] w-full ${ANCHOS[size]} overflow-y-auto rounded-2xl bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between print:hidden">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
