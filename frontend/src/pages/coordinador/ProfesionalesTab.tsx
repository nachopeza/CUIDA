import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { Profesional } from "../../lib/types.js";

export function ProfesionalesTab() {
  const { token } = useAuth();
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [zona, setZona] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function cargar() {
    setProfesionales(await api.get<Profesional[]>("/profesionales", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    await api.post(
      "/profesionales",
      { nombre, apellidos, zona: zona || undefined, email: email || undefined, password: password || undefined },
      token,
    );
    setNombre("");
    setApellidos("");
    setZona("");
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
          <input placeholder="Zona (opcional)" value={zona} onChange={(e) => setZona(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
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
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:col-span-2">
            Crear profesional
          </button>
        </form>
      </Card>

      <Card title="Profesionales activos">
        <ul className="divide-y divide-slate-100">
          {profesionales.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {p.nombre} {p.apellidos} {p.zona && <span className="text-xs text-slate-400">· {p.zona}</span>}
              </span>
              <span className="text-xs text-slate-400">{p.codigo}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
