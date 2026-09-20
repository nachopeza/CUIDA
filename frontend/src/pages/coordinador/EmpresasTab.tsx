import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { EmpresaColaboradora } from "../../lib/types.js";

export function EmpresasTab() {
  const { token } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");

  async function cargar() {
    setEmpresas(await api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    await api.post("/empresas-colaboradoras", { nombre, contacto: contacto || undefined }, token);
    setNombre("");
    setContacto("");
    await cargar();
  }

  return (
    <div>
      <Card title="Dar de alta una empresa colaboradora">
        <form onSubmit={crear} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input required placeholder="Nombre de la empresa" value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Contacto (opcional)" value={contacto} onChange={(e) => setContacto(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-2">
            Crear empresa colaboradora
          </button>
        </form>
      </Card>

      <Card title="Empresas colaboradoras">
        {empresas.length === 0 && <p className="text-sm text-slate-500">Todavía no hay empresas colaboradoras dadas de alta.</p>}
        <ul className="divide-y divide-slate-100">
          {empresas.map((emp) => (
            <li key={emp.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {emp.nombre} {emp.contacto && <span className="text-xs text-slate-400">· {emp.contacto}</span>}
              </span>
              <span className="text-xs text-slate-400">{emp.codigo}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
