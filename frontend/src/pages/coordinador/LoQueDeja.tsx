import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import type { ImpactoAusencia } from "../../lib/types.js";

// Lo que se va a quedar sin cubrir si se aprueba. Antes se aprobaba a ciegas:
// se pulsaba Aprobar y sólo entonces salían las incidencias diciendo que tres
// servicios estaban descubiertos y que no había nadie para cubrirlos. Con diez
// días de vacaciones eso es justo lo que hay que saber antes de contestar,
// porque a lo mejor la respuesta es "sí, pero moviendo dos días".
export function LoQueDeja({ ausenciaId, token }: { ausenciaId: string; token: string | null }) {
  const [imp, setImp] = useState<ImpactoAusencia | null>(null);

  useEffect(() => {
    api
      .get<ImpactoAusencia>(`/personal/ausencias/${ausenciaId}/impacto`, token)
      .then(setImp)
      .catch(() => setImp(null));
  }, [ausenciaId, token]);

  if (!imp) return null;
  if (imp.jornadas === 0) {
    return (
      <p className="mt-2 rounded-lg bg-brand-green-50 px-2.5 py-1.5 text-xs text-brand-green-700">
        No deja ninguna jornada sin cubrir: se puede aprobar sin mover nada.
      </p>
    );
  }

  // Si alguien se queda sin nadie, el aviso es rojo: aprobarlo tal cual deja a
  // una persona esperando en su casa.
  const grave = imp.sinCubrir.length > 0;
  return (
    <div className={`mt-2 rounded-lg px-2.5 py-2 text-xs ${grave ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>
      <p className="font-medium">
        Deja {imp.jornadas} jornada{imp.jornadas === 1 ? "" : "s"} sin cubrir
        {grave ? ` · nadie puede cubrir a ${imp.sinCubrir.join(" ni a ")}` : ""}
      </p>
      <ul className="mt-1 space-y-0.5">
        {imp.servicios.map((s) => (
          <li key={s.id}>
            <span className="font-medium">{s.persona}</span> · {s.necesidad} ({s.dias.join(", ")}) —{" "}
            {s.puedenCubrirlo.length > 0 ? (
              <span>pueden cubrirlo {s.puedenCubrirlo.join(" o ")}</span>
            ) : (
              <span className="font-medium">
                nadie puede
                {s.noPueden.length > 0 && `: ${s.noPueden.map((n) => `${n.quien} (${n.motivo.toLowerCase()})`).join(", ")}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
