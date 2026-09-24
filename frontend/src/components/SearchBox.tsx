import { IconSearch, IconX } from "./icons.js";

// Buscador consistente en todos los listados (sección "todas las listas
// deben tener una clasificación del tipo que te adjunto para buscarlas y
// demás"): mismo icono, mismo botón de limpiar, en vez de un <input> suelto
// distinto en cada pestaña.
//
// `alPulsarEnter` es para las listas donde escribir y pulsar Enter basta para
// elegir: en el alta de una solicitud, con cuarenta fichas, obligar a soltar
// el teclado para dar un clic es lo que hace larga una tarea corta.
export function SearchBox({
  value,
  onChange,
  placeholder,
  className = "",
  autoFocus = false,
  alPulsarEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
  alPulsarEnter?: () => void;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 ${className}`}>
      <IconSearch className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter" && alPulsarEnter) {
            e.preventDefault();
            alPulsarEnter();
          }
        }}
        className="w-full text-sm outline-none"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda">
          <IconX className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
        </button>
      )}
    </div>
  );
}
