import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { IconCalendar } from "./icons.js";

interface Proxima {
  fecha: string;
  horaInicio: string | null;
  horaFin: string | null;
  estado: string;
  prevista: boolean;
  codigo: string | null;
}

// Lo que viene de un servicio: las jornadas que ya están en la agenda y, detrás,
// las que el plan dice que tocarán.
//
// Un servicio indefinido no tiene una lista de jornadas que enseñar: se van
// generando a medida que se cierran las anteriores. Con sólo lo ya creado, la
// ficha de un servicio diario parecía no tener nada previsto, cuando lo que pasa
// es que "todos los días" no cabe en una lista. Así se ve qué hay firme y qué es
// lo que toca después.
export function ProximasJornadas({ servicioId, recarga }: { servicioId: string; recarga?: unknown }) {
  const { token } = useAuth();
  const [datos, setDatos] = useState<{ indefinido: boolean; recurrencia: string | null; proximas: Proxima[] } | null>(null);

  useEffect(() => {
    api
      .get<{ indefinido: boolean; recurrencia: string | null; proximas: Proxima[] }>(`/servicios/${servicioId}/proximas`, token)
      .then(setDatos)
      .catch(() => setDatos(null));
  }, [servicioId, token, recarga]);

  if (!datos) return null;

  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <IconCalendar className="h-3.5 w-3.5" /> Próximas jornadas
        {datos.indefinido && <span className="font-normal normal-case text-slate-400">· indefinido{datos.recurrencia ? `, ${datos.recurrencia.toLowerCase()}` : ""}</span>}
      </p>
      {datos.proximas.length === 0 ? (
        <p className="text-xs text-slate-400">No hay ninguna por delante.</p>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {datos.proximas.map((p) => (
            <li key={`${p.fecha}-${p.codigo ?? "prevista"}`} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
              <span className="text-slate-700">
                {new Date(p.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                {p.horaInicio && p.horaFin ? ` · ${p.horaInicio}–${p.horaFin}` : ""}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.prevista ? "bg-white text-slate-400 ring-1 ring-slate-200" : "bg-brand-green-50 text-brand-green-700"}`}>
                {p.prevista ? "Prevista" : "En agenda"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
