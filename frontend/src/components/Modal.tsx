import type { ReactNode } from "react";

const ANCHOS = { sm: "max-w-sm", lg: "max-w-2xl" };

export function Modal({
  title,
  onClose,
  children,
  size = "sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "lg";
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full ${ANCHOS[size]} overflow-y-auto rounded-2xl bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
