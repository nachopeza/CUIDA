import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { ApiError } from "../lib/api.js";
import logoBlanco from "../assets/logo-cuida-blanco.svg";

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
    // La entrada es lo primero que se ve de CUIDA: el verde de la marca de
    // fondo, la tarjeta blanca encima y el lema debajo del logo.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-4 py-10">
      <svg viewBox="0 0 64 64" className="pointer-events-none absolute -left-16 -top-10 h-80 w-80 text-brand-green-400/10" aria-hidden>
        <path fill="currentColor" d="M56 8C33 8 14 18 9 38c-2 8 1 15 6 18 2-14 10-26 24-33-11 9-18 20-20 34 15 3 28-3 34-15 4-9 5-22 3-34Z" />
      </svg>
      <svg viewBox="0 0 64 64" className="pointer-events-none absolute -bottom-20 -right-12 h-96 w-96 rotate-180 text-brand-green-400/10" aria-hidden>
        <path fill="currentColor" d="M56 8C33 8 14 18 9 38c-2 8 1 15 6 18 2-14 10-26 24-33-11 9-18 20-20 34 15 3 28-3 34-15 4-9 5-22 3-34Z" />
      </svg>

      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src={logoBlanco} alt="CUIDA" className="mx-auto h-10 w-auto" />
          <p className="mt-3 text-sm text-white/70">Personas que importan. Servicios que funcionan.</p>
        </div>
        <form onSubmit={onSubmit} className="rounded-tarjeta bg-white p-6 shadow-elevada">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="campo mb-3"
            placeholder="tu@email.com"
          />
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Contraseña</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="campo mb-4" />
          {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={cargando} className="boton-principal w-full">
            {cargando ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <div className="mt-4 rounded-tarjeta border border-white/15 bg-white/10 p-4 text-xs text-white/70 backdrop-blur">
          <p className="mb-2 font-medium text-white/90">Usuarios de demo (caso Herminia) · contraseña: cuida2026</p>
          <ul className="space-y-1.5">
            {DEMO_USUARIOS.map((u) => (
              <li key={u.email}>
                <button type="button" className="text-white underline decoration-white/40 decoration-dotted underline-offset-2" onClick={() => setEmail(u.email)}>
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
