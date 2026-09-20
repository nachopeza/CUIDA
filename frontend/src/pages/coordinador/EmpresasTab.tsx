import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { EmpresaColaboradora } from "../../lib/types.js";

const PERFIL_VACIO = { nombre: "", contacto: "", cif: "", direccion: "", numeroCuenta: "" };
type Perfil = typeof PERFIL_VACIO;

function CamposPerfil({ perfil, onChange }: { perfil: Perfil; onChange: (p: Perfil) => void }) {
  return (
    <>
      <input required placeholder="Nombre de la empresa" value={perfil.nombre} onChange={(e) => onChange({ ...perfil, nombre: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Contacto (opcional)" value={perfil.contacto} onChange={(e) => onChange({ ...perfil, contacto: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="CIF" value={perfil.cif} onChange={(e) => onChange({ ...perfil, cif: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Dirección" value={perfil.direccion} onChange={(e) => onChange({ ...perfil, direccion: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Número de cuenta (IBAN)" value={perfil.numeroCuenta} onChange={(e) => onChange({ ...perfil, numeroCuenta: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
    </>
  );
}

export function EmpresasTab() {
  const { token } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [nuevo, setNuevo] = useState<Perfil>(PERFIL_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Perfil>(PERFIL_VACIO);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setEmpresas(await api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token));
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
    await api.post("/empresas-colaboradoras", limpiar(nuevo), token);
    setNuevo(PERFIL_VACIO);
    await cargar();
  }

  function abrirEditar(emp: EmpresaColaboradora) {
    setEditForm({
      nombre: emp.nombre,
      contacto: emp.contacto ?? "",
      cif: emp.cif ?? "",
      direccion: emp.direccion ?? "",
      numeroCuenta: emp.numeroCuenta ?? "",
    });
    setEditandoId(emp.id);
  }

  async function guardarEdicion(id: string, e: FormEvent) {
    e.preventDefault();
    await api.patch(`/empresas-colaboradoras/${id}`, limpiar(editForm), token);
    setEditandoId(null);
    setMensaje("Empresa actualizada.");
    await cargar();
  }

  return (
    <div>
      <Card title="Dar de alta una empresa colaboradora">
        <form onSubmit={crear} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CamposPerfil perfil={nuevo} onChange={setNuevo} />
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 sm:col-span-2">
            Crear empresa colaboradora
          </button>
        </form>
      </Card>

      {mensaje && <div className="mb-4 rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-2 text-sm text-brand-green-700">{mensaje}</div>}

      <Card title="Empresas colaboradoras">
        {empresas.length === 0 && <p className="text-sm text-slate-500">Todavía no hay empresas colaboradoras dadas de alta.</p>}
        {empresas.map((emp) => (
          <div key={emp.id} className="border-b border-slate-100 py-2 last:border-0">
            <div className="flex items-center justify-between text-sm">
              <span>
                {emp.nombre} {emp.contacto && <span className="text-xs text-slate-400">· {emp.contacto}</span>}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{emp.codigo}</span>
                <button onClick={() => (editandoId === emp.id ? setEditandoId(null) : abrirEditar(emp))} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">
                  {editandoId === emp.id ? "Cancelar" : "Editar"}
                </button>
              </div>
            </div>

            {editandoId === emp.id && (
              <form onSubmit={(e) => guardarEdicion(emp.id, e)} className="mt-2 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                <CamposPerfil perfil={editForm} onChange={setEditForm} />
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
