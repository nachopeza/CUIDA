import { useState } from "react";
import type { Solicitud } from "../../lib/types.js";

const DIAS = 14;

// Carga de trabajo de las dos últimas semanas: una sola serie (solicitudes
// creadas por día), así que no lleva leyenda — el título ya dice qué se está
// midiendo. El día de hoy va en el acento de marca y el resto en el verde
// recesivo (forma "énfasis"): el ojo va directo a hoy sin perder el contexto.
// Ambos colores están comprobados a >=3:1 de contraste contra la superficie
// blanca del panel.
export function CargaTrabajo({ solicitudes }: { solicitudes: Solicitud[] }) {
  const [activo, setActivo] = useState<number | null>(null);

  const hoy = new Date();
  const dias = Array.from({ length: DIAS }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - (DIAS - 1 - i));
    const iso = d.toISOString().slice(0, 10);
    return {
      iso,
      fecha: d,
      esHoy: i === DIAS - 1,
      total: solicitudes.filter((s) => s.createdAt.slice(0, 10) === iso).length,
    };
  });

  const max = Math.max(1, ...dias.map((d) => d.total));
  const totalPeriodo = dias.reduce((acc, d) => acc + d.total, 0);
  // Se etiqueta solo el día más alto, no todas las barras: las etiquetas
  // directas funcionan justamente porque son escasas.
  const indiceMax = dias.findIndex((d) => d.total === max && max > 0);

  function etiquetaDia(d: Date) {
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Carga de trabajo</h3>
        <p className="text-xs text-slate-400">{totalPeriodo} solicitudes en 14 días</p>
      </div>

      <div className="relative">
        {/* Tooltip por barra: el valor exacto de cada día está a un hover,
            sin tener que imprimir un número encima de cada columna. */}
        {activo !== null && (
          <div className="pointer-events-none absolute -top-1 z-10 rounded-md bg-slate-800 px-2 py-1 text-[11px] text-white shadow-sm" style={{ left: `${(activo / DIAS) * 100}%` }}>
            {etiquetaDia(dias[activo].fecha)}: {dias[activo].total}
          </div>
        )}

        <div className="flex h-24 items-end gap-[2px]" onMouseLeave={() => setActivo(null)}>
          {dias.map((d, i) => (
            <button
              key={d.iso}
              type="button"
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              aria-label={`${etiquetaDia(d.fecha)}: ${d.total} solicitudes`}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              {i === indiceMax && <span className="mb-0.5 text-center text-[10px] font-medium text-slate-500">{d.total}</span>}
              {d.total > 0 && (
                <span
                  className={`w-full max-w-[24px] self-center rounded-t ${d.esHoy ? "bg-brand" : "bg-brand-green-600"} ${activo === i ? "opacity-100" : "opacity-90"}`}
                  style={{ height: `${Math.max(6, (d.total / max) * 100)}%` }}
                />
              )}
            </button>
          ))}
        </div>
        {/* Línea base y solo los extremos del eje: el resto lo cuenta el
            tooltip, la rejilla completa sería ruido en un panel de este tamaño. */}
        <div className="mt-1 border-t border-slate-200 pt-1">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{etiquetaDia(dias[0].fecha)}</span>
            <span>Hoy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
