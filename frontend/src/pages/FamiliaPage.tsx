import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import type { Necesidad, Solicitud } from "../lib/types.js";

// Interfaz CUIDA FAMILIA (sección 9): personas a cargo, servicios,
// seguimiento e incidencias. Fase 1: las personas a cargo se derivan de las
// solicitudes visibles para el familiar (ya filtradas por FamiliarRelacion
// en el backend).
export function FamiliaPage() {
  const { token } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [personaId, setPersonaId] = useState("");
  const [necesidadId, setNecesidadId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [sols, necs] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Necesidad[]>("/necesidades", token),
    ]);
    setSolicitudes(sols);
    setNecesidades(necs);
    if (!necesidadId && necs[0]) setNecesidadId(necs[0].id);
    if (!personaId && sols[0]) setPersonaId(sols[0].persona.id);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const personas = Array.from(new Map(solicitudes.map((s) => [s.persona.id, s.persona])).values());

  async function solicitarAyuda(e: FormEvent) {
    e.preventDefault();
    if (!personaId) return;
    setMensaje(null);
    await api.post("/solicitudes", { personaId, necesidadId, descripcionLibre: descripcion }, token);
    setDescripcion("");
    setMensaje("Solicitud enviada en nombre de la persona a tu cargo.");
    await cargar();
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Seguimiento familiar</h2>

      <Card title="Personas a tu cargo">
        {personas.length === 0 && <p className="text-sm text-slate-500">Aún no hay personas visibles.</p>}
        <ul className="space-y-1 text-sm">
          {personas.map((p) => (
            <li key={p.id}>
              <span className="font-medium">
                {p.nombre} {p.apellidos}
              </span>{" "}
              <span className="text-xs text-slate-400">({p.codigo})</span>
            </li>
          ))}
        </ul>
      </Card>

      {personas.length > 0 && (
        <Card title="Solicitar ayuda en su nombre">
          <form onSubmit={solicitarAyuda} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Para quién</label>
              <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.apellidos}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Qué necesita</label>
              <select value={necesidadId} onChange={(e) => setNecesidadId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                {necesidades.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Descripción</label>
              <textarea required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Enviar solicitud
            </button>
            {mensaje && <p className="text-sm text-emerald-600">{mensaje}</p>}
          </form>
        </Card>
      )}

      <Card title="Servicios y seguimiento">
        <ul className="divide-y divide-slate-100">
          {solicitudes.map((s) => (
            <li key={s.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {s.persona.nombre} · {s.necesidad.nombre}
                  </p>
                  <p className="text-xs text-slate-400">{s.codigo}</p>
                </div>
                <EstadoBadge estado={s.estado} />
              </div>
              {s.servicio && (
                <div className="mt-1 flex flex-wrap items-center gap-2 pl-2 text-xs text-slate-500">
                  <span>Servicio {s.servicio.codigo}</span>
                  <EstadoBadge estado={s.servicio.estado} />
                  {/* El backend solo envía estos campos si el familiar tiene
                      puedeVerImportes; la persona atendida nunca los recibe. */}
                  {(s.servicio.tarifaImporte != null || s.servicio.tarifaTipo) && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                      {s.servicio.tarifaTipo === "VOLUNTARIO" ? "Voluntario (sin coste)" : `${s.servicio.tarifaImporte} €`}
                    </span>
                  )}
                  {s.servicio.empresaColaboradora && (
                    <span className="text-slate-400">vía {s.servicio.empresaColaboradora.nombre}</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
