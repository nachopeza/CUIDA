import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { Persona } from "../../lib/types.js";

const CAMPOS_FAMILIAR_VACIOS = {
  email: "",
  password: "",
  parentesco: "",
  esRepresentante: true,
  puedeSolicitar: true,
  puedeVerHistorial: true,
  puedeVerImportes: true,
};

export function PersonasTab() {
  const { token } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [direccion, setDireccion] = useState("");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [familiarForm, setFamiliarForm] = useState(CAMPOS_FAMILIAR_VACIOS);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setPersonas(await api.get<Persona[]>("/personas", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crearPersona(e: FormEvent) {
    e.preventDefault();
    await api.post("/personas", { nombre, apellidos, direccion: direccion || undefined }, token);
    setNombre("");
    setApellidos("");
    setDireccion("");
    await cargar();
  }

  async function vincularFamiliar(personaId: string, e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    await api.post(`/personas/${personaId}/familiares`, familiarForm, token);
    setFamiliarForm(CAMPOS_FAMILIAR_VACIOS);
    setExpandida(null);
    setMensaje("Familiar vinculado correctamente.");
  }

  return (
    <div>
      <Card title="Dar de alta una persona">
        <form onSubmit={crearPersona} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input required placeholder="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Dirección (opcional)" value={direccion} onChange={(e) => setDireccion(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-3">
            Crear persona
          </button>
        </form>
      </Card>

      {mensaje && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{mensaje}</div>}

      {personas.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {p.nombre} {p.apellidos}
              </p>
              <p className="text-xs text-slate-400">{p.codigo}</p>
            </div>
            <button
              onClick={() => setExpandida(expandida === p.id ? null : p.id)}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
            >
              {expandida === p.id ? "Cancelar" : "Vincular familiar"}
            </button>
          </div>

          {expandida === p.id && (
            <form onSubmit={(e) => vincularFamiliar(p.id, e)} className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
              <input
                required
                placeholder="Parentesco (ej. Hija)"
                value={familiarForm.parentesco}
                onChange={(e) => setFamiliarForm((f) => ({ ...f, parentesco: e.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
              <input
                required
                type="email"
                placeholder="Email del familiar"
                value={familiarForm.email}
                onChange={(e) => setFamiliarForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
              <input
                required
                type="password"
                minLength={6}
                placeholder="Contraseña (mín. 6 caracteres)"
                value={familiarForm.password}
                onChange={(e) => setFamiliarForm((f) => ({ ...f, password: e.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 sm:col-span-2"
              />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={familiarForm.esRepresentante} onChange={(e) => setFamiliarForm((f) => ({ ...f, esRepresentante: e.target.checked }))} />
                Es representante
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={familiarForm.puedeVerImportes} onChange={(e) => setFamiliarForm((f) => ({ ...f, puedeVerImportes: e.target.checked }))} />
                Puede ver importes/tarifas
              </label>
              <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 sm:col-span-2">
                Vincular
              </button>
            </form>
          )}
        </Card>
      ))}
    </div>
  );
}
