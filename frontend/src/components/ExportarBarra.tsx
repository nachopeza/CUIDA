import { IconDownload, IconTrash } from "./icons.js";

// Barra de acciones sobre la selección de una tabla (secciones "en todos los
// listados incluye selección y edición y descarga para exportación" y "si
// selecciono todas las solicitudes pueda eliminarlo"): exporta la selección
// si hay alguna marcada, o todo lo filtrado si no; y ofrece eliminar en
// bloque cuando la lista lo permite.
export function ExportarBarra({
  total,
  seleccionadas,
  onExportar,
  onSeleccionarTodo,
  onLimpiarSeleccion,
  onEliminar,
  etiquetaEliminar = "Eliminar",
}: {
  total: number;
  seleccionadas: number;
  onExportar: () => void;
  onSeleccionarTodo?: () => void;
  onLimpiarSeleccion?: () => void;
  onEliminar?: () => void;
  etiquetaEliminar?: string;
}) {
  if (total === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {seleccionadas > 0 ? (
        <>
          <span className="font-medium text-slate-600">{seleccionadas} seleccionado(s)</span>
          {onSeleccionarTodo && seleccionadas < total && (
            <button onClick={onSeleccionarTodo} className="underline decoration-dotted hover:text-slate-700">
              Seleccionar los {total}
            </button>
          )}
          {onLimpiarSeleccion && (
            <button onClick={onLimpiarSeleccion} className="underline decoration-dotted hover:text-slate-700">
              Quitar selección
            </button>
          )}
        </>
      ) : (
        onSeleccionarTodo && (
          <button onClick={onSeleccionarTodo} className="underline decoration-dotted hover:text-slate-700">
            Seleccionar todo ({total})
          </button>
        )
      )}

      <div className="ml-auto flex items-center gap-2">
        {onEliminar && seleccionadas > 0 && (
          <button onClick={onEliminar} className="boton-peligro-suave-sm">
            <IconTrash className="h-3.5 w-3.5" /> {etiquetaEliminar} ({seleccionadas})
          </button>
        )}
        <button onClick={onExportar} className="boton-secundario-sm">
          <IconDownload className="h-3.5 w-3.5" /> Exportar CSV{seleccionadas > 0 ? ` (${seleccionadas})` : ` (${total})`}
        </button>
      </div>
    </div>
  );
}
