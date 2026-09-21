import { DIAS_SEMANA, FRANJAS_DISPONIBILIDAD, type Disponibilidad } from "../lib/disponibilidad.js";

export function DisponibilidadPicker({ value, onChange }: { value: Disponibilidad; onChange: (d: Disponibilidad) => void }) {
  function alternarDia(dia: string) {
    const dias = value.dias.includes(dia) ? value.dias.filter((d) => d !== dia) : [...value.dias, dia];
    onChange({ ...value, dias });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {DIAS_SEMANA.map((dia) => (
          <button
            key={dia}
            type="button"
            onClick={() => alternarDia(dia)}
            className={`h-7 w-7 rounded-full text-xs font-semibold ${
              value.dias.includes(dia) ? "bg-brand text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            {dia}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FRANJAS_DISPONIBILIDAD.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onChange({ ...value, franja: f })}
            className={`rounded-full px-2.5 py-1 text-xs ${value.franja === f ? "bg-brand text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

// Resumen legible para mostrar fuera del formulario (ficha de solicitud,
// listado de profesionales): "L M X J V · Mañana" en vez del JSON crudo.
export function resumenDisponibilidad(d: Disponibilidad): string {
  if (d.dias.length === 0) return "Sin definir";
  return `${d.dias.join(" ")} · ${d.franja}`;
}
