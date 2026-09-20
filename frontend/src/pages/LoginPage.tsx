import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { ApiError } from "../lib/api.js";

const DEMO_USUARIOS = [
  { email: "herminia@cuida.demo", rol: "Persona (Herminia)" },
  { email: "hija.herminia@cuida.demo", rol: "Familiar" },
  { email: "carmen.profesional@cuida.demo", rol: "Profesional" },
  { email: "coordinadora@cuida.demo", rol: "Coordinadora" },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("cuida2026");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? "Email o contraseña incorrectos" : "Error de conexión con el servidor");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">CUIDA</h1>
          <p className="mt-1 text-sm text-slate-500">Coordinación de ayuda y cuidados a domicilio</p>
        </div>
        <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="tu@email.com"
          />
          <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {cargando ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">
          <p className="mb-2 font-medium text-slate-600">Usuarios de demo (caso Herminia) · contraseña: cuida2026</p>
          <ul className="space-y-1">
            {DEMO_USUARIOS.map((u) => (
              <li key={u.email}>
                <button type="button" className="text-slate-700 underline decoration-dotted" onClick={() => setEmail(u.email)}>
                  {u.email}
                </button>{" "}
                — {u.rol}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
