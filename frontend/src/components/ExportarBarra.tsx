// Barra compacta reutilizable para "exportar a CSV" en cualquier tabla
// (sección "en todos los listados incluye... descarga para exportación"):
// exporta la selección si hay alguna marcada, o todo lo filtrado si no.
export function ExportarBarra({ total, seleccionadas, onExportar }: { total: number; seleccionadas: number; onExportar: () => void }) {
  if (total === 0) return null;
  return (
    <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
      {seleccionadas > 0 && <span>{seleccionadas} seleccionado(s)</span>}
      <button onClick={onExportar} className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 font-medium hover:bg-slate-100">
        ⬇ Exportar CSV{seleccionadas > 0 ? ` (${seleccionadas})` : ` (${total})`}
      </button>
    </div>
  );
}
