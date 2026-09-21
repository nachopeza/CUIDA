import { IconSearch, IconX } from "./icons.js";

// Buscador consistente en todos los listados (sección "todas las listas
// deben tener una clasificación del tipo que te adjunto para buscarlas y
// demás"): mismo icono, mismo botón de limpiar, en vez de un <input> suelto
// distinto en cada pestaña.
export function SearchBox({ value, onChange, placeholder, className = "" }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 ${className}`}>
      <IconSearch className="h-4 w-4 shrink-0 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm outline-none" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda">
          <IconX className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
        </button>
      )}
    </div>
  );
}
