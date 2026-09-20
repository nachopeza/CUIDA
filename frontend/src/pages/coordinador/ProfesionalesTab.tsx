import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { EmpresaColaboradora, Profesional } from "../../lib/types.js";

// Por ahora CUIDA solo opera en Cantabria: se usa como zona por defecto al
// dar de alta un profesional (editable si hiciera falta un caso puntual).
const ZONA_POR_DEFECTO = "Cantabria";

export function ProfesionalesTab() {
  const { token } = useAuth();
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [zona, setZona] = useState(ZONA_POR_DEFECTO);
  const [empresaColaboradoraId, setEmpresaColaboradoraId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

  async function crear(e: FormEvent) {
    e.preventDefault();
    await api.post(
      "/profesionales",
      {
        nombre,
        apellidos,
        telefono: telefono || undefined,
        zona: zona || undefined,
        empresaColaboradoraId: empresaColaboradoraId || undefined,
        email: email || undefined,
        password: password || undefined,
      },
      token,
    );
    setNombre("");
    setApellidos("");
    setTelefono("");
    setZona(ZONA_POR_DEFECTO);
    setEmpresaColaboradoraId("");
    setEmail("");
    setPassword("");
    await cargar();
  }

  return (
    <div>
      <Card title="Dar de alta un profesional">
        <form onSubmit={crear} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input required placeholder="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Zona" value={zona} onChange={(e) => setZona(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select value={empresaColaboradoraId} onChange={(e) => setEmpresaColaboradoraId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
            <option value="">Independiente (no trabaja para ninguna empresa)</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                Trabaja para: {emp.nombre}
              </option>
            ))}
          </select>
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

      <Card title="Profesionales activos">
        <ul className="divide-y divide-slate-100">
          {profesionales.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {p.nombre} {p.apellidos} <span className="text-xs text-slate-400">· {p.zona ?? ZONA_POR_DEFECTO}</span>{" "}
                <span className="text-xs text-slate-400">· {p.empresaColaboradora ? p.empresaColaboradora.nombre : "independiente"}</span>
              </span>
              <span className="text-xs text-slate-400">{p.codigo}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
