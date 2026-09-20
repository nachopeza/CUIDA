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

const PERFIL_VACIO = {
  nombre: "",
  apellidos: "",
  telefono: "",
  direccion: "",
  medicacion: "",
  medico: "",
  recomendaciones: "",
  contactos: "",
};

type Perfil = typeof PERFIL_VACIO;

function CamposPerfil({ perfil, onChange }: { perfil: Perfil; onChange: (p: Perfil) => void }) {
  return (
    <>
      <input required placeholder="Nombre" value={perfil.nombre} onChange={(e) => onChange({ ...perfil, nombre: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input required placeholder="Apellidos" value={perfil.apellidos} onChange={(e) => onChange({ ...perfil, apellidos: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Teléfono" value={perfil.telefono} onChange={(e) => onChange({ ...perfil, telefono: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Dirección" value={perfil.direccion} onChange={(e) => onChange({ ...perfil, direccion: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
      <input placeholder="Medicación" value={perfil.medicacion} onChange={(e) => onChange({ ...perfil, medicacion: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
      <input placeholder="Médico / centro de referencia" value={perfil.medico} onChange={(e) => onChange({ ...perfil, medico: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
      <input placeholder="Contactos de emergencia" value={perfil.contactos} onChange={(e) => onChange({ ...perfil, contactos: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
      <textarea placeholder="Recomendaciones" value={perfil.recomendaciones} onChange={(e) => onChange({ ...perfil, recomendaciones: e.target.value })} rows={2} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
    </>
  );
}

export function PersonasTab() {
  const { token } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [nuevo, setNuevo] = useState<Perfil>(PERFIL_VACIO);
  const [abierta, setAbierta] = useState<{ id: string; modo: "familiar" | "editar" } | null>(null);
  const [editForm, setEditForm] = useState<Perfil>(PERFIL_VACIO);
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
    await api.post("/personas", limpiar(nuevo), token);
    setNuevo(PERFIL_VACIO);
    await cargar();
  }

  function limpiar(p: Perfil) {
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || undefined]));
  }

  function abrirEditar(p: Persona) {
    setEditForm({
      nombre: p.nombre,
      apellidos: p.apellidos,
      telefono: p.telefono ?? "",
      direccion: p.direccion ?? "",
      medicacion: p.medicacion ?? "",
      medico: p.medico ?? "",
      recomendaciones: p.recomendaciones ?? "",
      contactos: p.contactos ?? "",
    });
    setAbierta({ id: p.id, modo: "editar" });
  }

  async function guardarEdicion(personaId: string, e: FormEvent) {
    e.preventDefault();
    await api.patch(`/personas/${personaId}`, limpiar(editForm), token);
    setAbierta(null);
    setMensaje("Perfil actualizado.");
    await cargar();
  }

  async function vincularFamiliar(personaId: string, e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    await api.post(`/personas/${personaId}/familiares`, familiarForm, token);
    setFamiliarForm(CAMPOS_FAMILIAR_VACIOS);
    setAbierta(null);
    setMensaje("Familiar vinculado correctamente.");
  }

  return (
    <div>
      <Card title="Dar de alta un usuario">
        <form onSubmit={crearPersona} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <CamposPerfil perfil={nuevo} onChange={setNuevo} />
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-3">
            Crear usuario
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
            <div className="flex gap-2">
              <button onClick={() => abrirEditar(p)} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">
                Editar perfil
              </button>
              <button
                onClick={() => setAbierta(abierta?.id === p.id && abierta.modo === "familiar" ? null : { id: p.id, modo: "familiar" })}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
              >
                Vincular familiar
              </button>
            </div>
          </div>

          {(p.medicacion || p.medico || p.contactos || p.direccion) && (
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-slate-500 sm:grid-cols-2">
              {p.direccion && <div>📍 {p.direccion}</div>}
              {p.telefono && <div>📞 {p.telefono}</div>}
              {p.medicacion && <div>💊 {p.medicacion}</div>}
              {p.medico && <div>🩺 {p.medico}</div>}
            </dl>
          )}

          {abierta?.id === p.id && abierta.modo === "editar" && (
            <form onSubmit={(e) => guardarEdicion(p.id, e)} className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-3">
              <CamposPerfil perfil={editForm} onChange={setEditForm} />
              <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 sm:col-span-3">
                Guardar cambios
              </button>
            </form>
          )}

          {abierta?.id === p.id && abierta.modo === "familiar" && (
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
