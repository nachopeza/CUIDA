import type { Direccion } from "../lib/useOrdenacion.js";
import { IconArrowDown, IconArrowUp, IconArrowsVertical } from "./icons.js";

// Cabecera de columna ordenable: misma flecha y mismo comportamiento en
// todas las tablas del panel.
export function ThOrdenable({
  campo,
  children,
  campoActivo,
  direccion,
  onOrdenar,
  className = "",
}: {
  campo: string;
  children: React.ReactNode;
  campoActivo: string | null;
  direccion: Direccion;
  onOrdenar: (campo: string) => void;
  className?: string;
}) {
  const activo = campoActivo === campo;
  return (
    <th className={`px-4 py-2.5 ${className}`}>
      <button onClick={() => onOrdenar(campo)} className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-700">
        {children}
        <span className={activo ? "text-slate-600" : "text-slate-300"}>
        {activo ? (
          direccion === "asc" ? <IconArrowUp className="h-3 w-3" /> : <IconArrowDown className="h-3 w-3" />
        ) : (
          <IconArrowsVertical className="h-3 w-3" />
        )}
      </span>
      </button>
    </th>
  );
}
