import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconX } from "../../components/icons.js";
import type { Persona, Solicitud } from "../../lib/types.js";

interface Props {
  personas: Persona[];
  solicitudes: Solicitud[];
  onAbrirPersona: (id: string) => void;
  onAbrirSolicitud: (id: string) => void;
}

// Búsqueda global (sección "buscar usuarios... clasificarlos"): sobre los
// datos ya cargados en el panel, sin ida y vuelta al servidor — cruza
// usuarios y solicitudes en un único cuadro, algo que antes exigía saber
// en qué pestaña buscar.
export function GlobalSearch({ personas, solicitudes, onAbrirPersona, onAbrirSolicitud }: Props) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const { usuariosMatch, solicitudesMatch } = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return { usuariosMatch: [], solicitudesMatch: [] };
    return {
      usuariosMatch: personas.filter((p) => `${p.nombre} ${p.apellidos} ${p.codigo}`.toLowerCase().includes(query)).slice(0, 5),
      solicitudesMatch: solicitudes
        .filter((s) => `${s.codigo} ${s.descripcionLibre} ${s.persona.nombre} ${s.persona.apellidos}`.toLowerCase().includes(query))
        .slice(0, 5),
    };
  }, [q, personas, solicitudes]);

  const hayResultados = usuariosMatch.length > 0 || solicitudesMatch.length > 0;

  return (
    <div className="relative w-full max-w-sm" ref={ref}>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
        <IconSearch className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar usuarios o solicitudes…"
          className="w-full text-sm outline-none"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Limpiar búsqueda">
            <IconX className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
          </button>
        )}
      </div>

      {abierto && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-96 overflow-y-auto tarjeta shadow-lg">
          {!hayResultados && <p className="p-4 text-sm text-slate-500">Sin resultados para "{q}".</p>}

          {usuariosMatch.length > 0 && (
            <div>
              <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Usuarios</p>
              {usuariosMatch.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onAbrirPersona(p.id);
                    setAbierto(false);
                    setQ("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {p.nombre} {p.apellidos} <span className="text-xs text-slate-400">· {p.codigo}</span>
                </button>
              ))}
            </div>
          )}

          {solicitudesMatch.length > 0 && (
            <div className="border-t border-slate-100">
              <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Solicitudes</p>
              {solicitudesMatch.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onAbrirSolicitud(s.id);
                    setAbierto(false);
                    setQ("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {s.persona.nombre} {s.persona.apellidos} · {s.necesidad.nombre} <span className="text-xs text-slate-400">· {s.codigo}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
