import { useEffect, useMemo, useState } from "react";
import { IconChevronRight } from "./icons.js";

const TAMANO_PAGINA = 10;

// Paginado sencillo en cliente: suficiente mientras el volumen por
// organización sea moderado (decenas/cientos de filas), sin necesidad de
// mover el filtrado al backend todavía.
export function usePaginacion<T>(items: T[], tamano: number = TAMANO_PAGINA) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(items.length / tamano));

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(1);
  }, [totalPaginas, pagina]);

  const paginaActual = Math.min(pagina, totalPaginas);
  const items_ = useMemo(() => items.slice((paginaActual - 1) * tamano, paginaActual * tamano), [items, paginaActual, tamano]);

  return { pagina: paginaActual, totalPaginas, setPagina, items: items_ };
}

export function Pagination({ pagina, totalPaginas, onChange, total }: { pagina: number; totalPaginas: number; onChange: (p: number) => void; total: number }) {
  if (totalPaginas <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
      <span>{total} resultado(s)</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(pagina - 1)}
          disabled={pagina <= 1}
          className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        </button>
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <button
          onClick={() => onChange(pagina + 1)}
          disabled={pagina >= totalPaginas}
          className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
