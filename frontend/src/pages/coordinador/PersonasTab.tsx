import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { NuevoUsuarioModal } from "./NuevoUsuarioModal.js";
import { PersonaDetalleModal } from "./PersonaDetalleModal.js";
import type { Persona } from "../../lib/types.js";

// Portal de usuarios (sección "el portal de usuarios es muy importante.
// Buscar usuarios, saber qué servicios han solicitado"): buscador + alta en
// un único botón dinámico + ficha unificada por usuario en vez de
// formularios sueltos de alta/edición/vinculación repartidos por la pantalla.
export function PersonasTab({ onCambiado }: { onCambiado: () => void }) {
  const { token } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  async function cargar() {
    setPersonas(await api.get<Persona[]>("/personas", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refrescarTodo() {
    await cargar();
    onCambiado();
  }

  const filtradas = personas.filter((p) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${p.nombre} ${p.apellidos} ${p.codigo}`.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <button onClick={() => setNuevoAbierto(true)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
          + Nuevo usuario
        </button>
      </div>

      <Card>
        {filtradas.length === 0 && <p className="text-sm text-slate-500">Sin usuarios que mostrar.</p>}
        <ul className="divide-y divide-slate-100">
          {filtradas.map((p) => (
            <li key={p.id}>
              <button onClick={() => setDetalleId(p.id)} className="flex w-full items-center justify-between py-3 text-left text-sm hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-800">
                    {p.nombre} {p.apellidos}
                  </p>
                  <p className="text-xs text-slate-400">
                    {p.codigo} {p.usuario ? `· ${p.usuario.email}` : "· sin acceso todavía"}
                  </p>
                </div>
                <span className="text-xs text-slate-400">Ver ficha →</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {nuevoAbierto && (
        <NuevoUsuarioModal
          onClose={() => setNuevoAbierto(false)}
          onCreated={refrescarTodo}
        />
      )}

      {detalleId && <PersonaDetalleModal personaId={detalleId} onClose={() => setDetalleId(null)} onCambiado={refrescarTodo} />}
    </div>
  );
}
