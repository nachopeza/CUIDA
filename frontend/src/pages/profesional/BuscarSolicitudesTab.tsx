import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { Servicio } from "../../lib/types.js";

// "Debe tener un apartado donde pueda buscar solicitudes de su estilo o
// propuestas" (sección Profesional): servicios sin profesional asignado
// todavía, para proponerse en vez de esperar a que coordinación le asigne.
export function BuscarSolicitudesTab() {
  const { token } = useAuth();
  const [disponibles, setDisponibles] = useState<Servicio[]>([]);
  const [interesados, setInteresados] = useState<Set<string>>(new Set());

  async function cargar() {
    setDisponibles(await api.get<Servicio[]>("/servicios/disponibles", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function proponerse(servicioId: string) {
    await api.post(`/servicios/${servicioId}/interes`, {}, token);
    setInteresados((prev) => new Set(prev).add(servicioId));
  }

  return (
    <Card title="Solicitudes disponibles">
      {disponibles.length === 0 && <p className="text-sm text-slate-500">Ahora mismo no hay solicitudes sin cubrir.</p>}
      <ul className="divide-y divide-slate-100">
        {disponibles.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-3 text-sm">
            <div>
              <p className="font-medium">
                {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos} · {s.solicitud?.necesidad.nombre}
              </p>
              <p className="text-xs text-slate-400">
                {s.codigo} · {s.solicitud?.plan ? new Date(s.solicitud.plan.fechaInicio).toLocaleDateString("es-ES") : "Sin fecha definida todavía"}
              </p>
            </div>
            {interesados.has(s.id) ? (
              <span className="rounded-full bg-brand-green-50 px-3 py-1 text-xs font-medium text-brand-green-700">Avisado a coordinación</span>
            ) : (
              <button onClick={() => proponerse(s.id)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">
                Me interesa
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
