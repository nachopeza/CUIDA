import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import type { Necesidad, Solicitud } from "../lib/types.js";

export function PersonaPage() {
  const { token, usuario } = useAuth();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
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
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function solicitarAyuda(e: FormEvent) {
    e.preventDefault();
    if (!usuario?.personaId) return;
    setMensaje(null);
    await api.post(
      "/solicitudes",
      { personaId: usuario.personaId, necesidadId, descripcionLibre: descripcion },
      token,
    );
    setDescripcion("");
    setMensaje("Solicitud enviada. Te avisaremos cuando alguien la revise.");
    await cargar();
  }

  const enCurso = solicitudes.find((s) => s.servicio && s.servicio.estado !== "CERRADO");

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Hola{usuario?.email ? "" : ""}, ¿en qué necesitas ayuda?</h2>

      {enCurso?.servicio && (
        <Card title="Tu próximo servicio">
          <p className="text-sm text-slate-600">
            {enCurso.necesidad.nombre} — <EstadoBadge estado={enCurso.servicio.estado} />
          </p>
          <p className="mt-1 text-xs text-slate-400">Servicio {enCurso.servicio.codigo}</p>
        </Card>
      )}

      <Card title="Solicitar ayuda">
        <form onSubmit={solicitarAyuda} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-slate-600">¿Qué necesitas?</label>
            <select
              value={necesidadId}
              onChange={(e) => setNecesidadId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {necesidades.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Cuéntanos con tus palabras qué necesitas</label>
            <textarea
              required
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              placeholder="Ej: Necesito compañía y ayuda con la compra durante 10 días"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Enviar solicitud
          </button>
          {mensaje && <p className="text-sm text-emerald-600">{mensaje}</p>}
        </form>
      </Card>

      <Card title="Historial de solicitudes">
        {solicitudes.length === 0 && <p className="text-sm text-slate-500">Todavía no has solicitado ayuda.</p>}
        <ul className="divide-y divide-slate-100">
          {solicitudes.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium">{s.necesidad.nombre}</p>
                <p className="text-xs text-slate-400">
                  {s.codigo} · {s.descripcionLibre}
                </p>
              </div>
              <EstadoBadge estado={s.estado} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
