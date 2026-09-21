import { useMemo, useState } from "react";

// Selección de filas para listados (sección "en todos los listados incluye
// selección"): un Set de ids, con toggle individual y "todos"/"ninguno" —
// suficiente para marcar qué exportar sin inventar acciones masivas que
// nadie ha pedido todavía.
export function useSeleccion<T extends { id: string }>(filas: T[]) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    setIds((prev) => (prev.size === filas.length ? new Set() : new Set(filas.map((f) => f.id))));
  }

  function limpiar() {
    setIds(new Set());
  }

  const seleccionadas = useMemo(() => filas.filter((f) => ids.has(f.id)), [filas, ids]);
  const todasMarcadas = filas.length > 0 && ids.size === filas.length;

  return { ids, toggle, toggleTodos, limpiar, seleccionadas, todasMarcadas };
}
