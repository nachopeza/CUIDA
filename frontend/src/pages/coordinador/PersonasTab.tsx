import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { Persona } from "../../lib/types.js";

// Portal de usuarios (sección "el portal de usuarios es muy importante.
// Buscar usuarios, saber qué servicios han solicitado"): buscador + ficha
// unificada por usuario en vez de formularios sueltos de alta/edición
// repartidos por la pantalla. El alta ("+ Nuevo usuario") y la ficha
// (PersonaDetalleModal) las controla el panel de coordinación, para que
// también funcionen desde la búsqueda global sin depender de esta pestaña;
// `refreshKey` cambia cuando se crea un usuario desde ahí, para recargar
// esta lista aunque el alta no haya pasado por este componente.
export function PersonasTab({ onAbrirFicha, refreshKey }: { onAbrirFicha: (id: string) => void; refreshKey: number }) {
  const { token } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    api.get<Persona[]>("/personas", token).then(setPersonas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const filtradas = personas.filter((p) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${p.nombre} ${p.apellidos} ${p.codigo}`.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
      </div>

      <Card>
        {filtradas.length === 0 && <p className="text-sm text-slate-500">Sin usuarios que mostrar.</p>}
        <ul className="divide-y divide-slate-100">
          {filtradas.map((p) => (
            <li key={p.id}>
              <button onClick={() => onAbrirFicha(p.id)} className="flex w-full items-center justify-between py-3 text-left text-sm hover:bg-slate-50">
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
    </div>
  );
}
