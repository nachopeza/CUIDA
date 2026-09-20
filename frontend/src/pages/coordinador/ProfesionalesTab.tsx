import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { EmpresaColaboradora, Profesional } from "../../lib/types.js";

// Por ahora CUIDA solo opera en Cantabria: se usa como zona por defecto al
// dar de alta un profesional (editable si hiciera falta un caso puntual).
const ZONA_POR_DEFECTO = "Cantabria";

const PERFIL_VACIO = {
  nombre: "",
  apellidos: "",
  telefono: "",
  zona: ZONA_POR_DEFECTO,
  dni: "",
  numeroCuenta: "",
  bizum: "",
  empresaColaboradoraId: "",
};

type Perfil = typeof PERFIL_VACIO;

function CamposPerfil({ perfil, onChange, empresas }: { perfil: Perfil; onChange: (p: Perfil) => void; empresas: EmpresaColaboradora[] }) {
  return (
    <>
      <input required placeholder="Nombre" value={perfil.nombre} onChange={(e) => onChange({ ...perfil, nombre: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input required placeholder="Apellidos" value={perfil.apellidos} onChange={(e) => onChange({ ...perfil, apellidos: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Teléfono" value={perfil.telefono} onChange={(e) => onChange({ ...perfil, telefono: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Zona" value={perfil.zona} onChange={(e) => onChange({ ...perfil, zona: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="DNI / carné" value={perfil.dni} onChange={(e) => onChange({ ...perfil, dni: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Número de cuenta (IBAN)" value={perfil.numeroCuenta} onChange={(e) => onChange({ ...perfil, numeroCuenta: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Bizum" value={perfil.bizum} onChange={(e) => onChange({ ...perfil, bizum: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <select value={perfil.empresaColaboradoraId} onChange={(e) => onChange({ ...perfil, empresaColaboradoraId: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
        <option value="">Independiente (no trabaja para ninguna empresa)</option>
        {empresas.map((emp) => (
          <option key={emp.id} value={emp.id}>
            Trabaja para: {emp.nombre}
          </option>
        ))}
      </select>
    </>
  );
}

export function ProfesionalesTab() {
  const { token } = useAuth();
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [nuevo, setNuevo] = useState<Perfil>(PERFIL_VACIO);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Perfil>(PERFIL_VACIO);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [pros, emps] = await Promise.all([
      api.get<Profesional[]>("/profesionales", token),
      api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token),
    ]);
    setProfesionales(pros);
    setEmpresas(emps);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limpiar(p: Perfil) {
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || undefined]));
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    await api.post("/profesionales", { ...limpiar(nuevo), email: email || undefined, password: password || undefined }, token);
    setNuevo(PERFIL_VACIO);
    setEmail("");
    setPassword("");
    await cargar();
  }

  function abrirEditar(p: Profesional) {
    setEditForm({
      nombre: p.nombre,
      apellidos: p.apellidos,
      telefono: p.telefono ?? "",
      zona: p.zona ?? ZONA_POR_DEFECTO,
      dni: p.dni ?? "",
      numeroCuenta: p.numeroCuenta ?? "",
      bizum: p.bizum ?? "",
      empresaColaboradoraId: p.empresaColaboradoraId ?? "",
    });
    setEditandoId(p.id);
  }

  async function guardarEdicion(id: string, e: FormEvent) {
    e.preventDefault();
    const datos = limpiar(editForm);
    await api.patch(`/profesionales/${id}`, { ...datos, empresaColaboradoraId: editForm.empresaColaboradoraId || null }, token);
    setEditandoId(null);
    setMensaje("Perfil actualizado.");
    await cargar();
  }

  return (
    <div>
      <Card title="Dar de alta un profesional">
        <form onSubmit={crear} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CamposPerfil perfil={nuevo} onChange={setNuevo} empresas={empresas} />
          <input
            type="email"
            placeholder="Email de acceso (opcional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            minLength={6}
            placeholder="Contraseña (si le das email)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 sm:col-span-2">
            Crear profesional
          </button>
        </form>
      </Card>

      {mensaje && <div className="mb-4 rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-2 text-sm text-brand-green-700">{mensaje}</div>}

      <Card title="Profesionales activos">
        {profesionales.map((p) => (
          <div key={p.id} className="border-b border-slate-100 py-2 last:border-0">
            <div className="flex items-center justify-between text-sm">
              <span>
                {p.nombre} {p.apellidos} <span className="text-xs text-slate-400">· {p.zona ?? ZONA_POR_DEFECTO}</span>{" "}
                <span className="text-xs text-slate-400">· {p.empresaColaboradora ? p.empresaColaboradora.nombre : "independiente"}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{p.codigo}</span>
                <button onClick={() => (editandoId === p.id ? setEditandoId(null) : abrirEditar(p))} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">
                  {editandoId === p.id ? "Cancelar" : "Editar"}
                </button>
              </div>
            </div>

            {editandoId === p.id && (
              <form onSubmit={(e) => guardarEdicion(p.id, e)} className="mt-2 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                <CamposPerfil perfil={editForm} onChange={setEditForm} empresas={empresas} />
                <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-800 sm:col-span-2">
                  Guardar cambios
                </button>
              </form>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
