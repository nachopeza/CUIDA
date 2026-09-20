import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import type { VisitaAgenda } from "../../lib/types.js";

function claveDia(fechaISO: string) {
  return new Date(fechaISO).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

// Escaleta de coordinación (sección 9): qué profesional tiene qué servicio
// qué día, de un vistazo, sin necesidad de entrar visita por visita.
export function CalendarioTab() {
  const { token } = useAuth();
  const [visitas, setVisitas] = useState<VisitaAgenda[]>([]);

  useEffect(() => {
    api.get<VisitaAgenda[]>("/agenda", token).then(setVisitas);
  }, [token]);

  const porDia = new Map<string, VisitaAgenda[]>();
  for (const v of visitas) {
    const clave = claveDia(v.fecha);
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave)!.push(v);
  }

  return (
    <div>
      {visitas.length === 0 && <p className="text-sm text-slate-500">Todavía no hay visitas programadas.</p>}

      {Array.from(porDia.entries()).map(([dia, visitasDelDia]) => (
        <Card key={dia} title={dia.charAt(0).toUpperCase() + dia.slice(1)}>
          <ul className="divide-y divide-slate-100">
            {visitasDelDia.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-xs text-slate-500">{v.horaInicioProg ?? "--:--"}</span>
                  <div>
                    <p className="font-medium">
                      {v.servicio.profesional ? `${v.servicio.profesional.nombre} ${v.servicio.profesional.apellidos}` : "Sin profesional asignado"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {v.servicio.solicitud.persona.nombre} {v.servicio.solicitud.persona.apellidos} · {v.servicio.solicitud.necesidad.nombre}
                    </p>
                  </div>
                </div>
                <EstadoBadge estado={v.estado} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
