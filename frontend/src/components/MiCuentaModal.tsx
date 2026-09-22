import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Modal } from "./Modal.js";

interface Cuenta {
  id: string;
  nombre: string | null;
  email: string;
  rol: string;
  activo: boolean;
  createdAt?: string;
}

const ROL_LABEL: Record<string, string> = {
  COORDINADOR: "Coordinador",
  ORGANIZACION: "Organización",
  ADMIN: "Administrador",
};

const NUEVO_VACIO = { nombre: "", email: "", password: "" };

// Mi cuenta (sección "poder gestionar el perfil de coordinación y crear
// otros perfiles de coordinación y demás"): datos propios y contraseña
// arriba; debajo, y solo para gestores, el resto de cuentas de coordinación
// de la organización.
export function MiCuentaModal({ onClose }: { onClose: () => void }) {
  const { token, usuario } = useAuth();
  const esGestor = ["COORDINADOR", "ORGANIZACION", "ADMIN"].includes(usuario?.rol ?? "");

  const [yo, setYo] = useState<Cuenta | null>(null);
  const [form, setForm] = useState({ nombre: "", email: "" });
  const [passwords, setPasswords] = useState({ actual: "", nueva: "" });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [coordinadores, setCoordinadores] = useState<Cuenta[]>([]);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState(NUEVO_VACIO);
  const [passwordReseteada, setPasswordReseteada] = useState<{ id: string; password: string } | null>(null);

  async function cargar() {
    const me = await api.get<Cuenta>("/cuenta/me", token);
    setYo(me);
    setForm({ nombre: me.nombre ?? "", email: me.email });
    if (esGestor) setCoordinadores(await api.get<Cuenta[]>("/cuenta/coordinadores", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    setGuardando(true);
    try {
      await api.patch(
        "/cuenta/me",
        {
          nombre: form.nombre || undefined,
          email: form.email || undefined,
          passwordActual: passwords.nueva ? passwords.actual : undefined,
          passwordNueva: passwords.nueva || undefined,
        },
        token,
      );
      setPasswords({ actual: "", nueva: "" });
      setMensaje("Perfil actualizado.");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function crearCoordinador(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/cuenta/coordinadores", nuevo, token);
      setNuevo(NUEVO_VACIO);
      setCreando(false);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    }
  }

  async function alternarActivo(c: Cuenta) {
    await api.patch(`/cuenta/coordinadores/${c.id}`, { activo: !c.activo }, token);
    await cargar();
  }

  async function resetear(c: Cuenta) {
    const res = await api.post<{ passwordGenerada: string }>(`/cuenta/coordinadores/${c.id}/password`, {}, token);
    setPasswordReseteada({ id: c.id, password: res.passwordGenerada });
  }

  return (
    <Modal title="Mi cuenta" onClose={onClose} size="lg">
      {!yo ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <div className="space-y-5">
          <form onSubmit={guardar} className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <p className="text-xs text-slate-400 sm:col-span-2">
              {ROL_LABEL[yo.rol] ?? yo.rol} · {yo.email}
            </p>
            <label className="text-xs text-slate-500">
              Nombre
              <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-xs text-slate-500">
              Email de acceso
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-xs text-slate-500">
              Contraseña actual
              <input
                type="password"
                value={passwords.actual}
                onChange={(e) => setPasswords((p) => ({ ...p, actual: e.target.value }))}
                placeholder="Solo si cambias la contraseña"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-xs text-slate-500">
              Contraseña nueva
              <input
                type="password"
                minLength={6}
                value={passwords.nueva}
                onChange={(e) => setPasswords((p) => ({ ...p, nueva: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
            {mensaje && <p className="text-sm text-brand-green-700 sm:col-span-2">{mensaje}</p>}
            <button type="submit" disabled={guardando} className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-800 disabled:opacity-50 sm:col-span-2">
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>

          {esGestor && (
            <div className="border-t border-slate-100 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cuentas de coordinación</p>
                <button onClick={() => setCreando((v) => !v)} className="text-xs font-medium text-brand underline decoration-dotted hover:text-brand-800">
                  {creando ? "Cancelar" : "+ Nueva cuenta"}
                </button>
              </div>

              {creando && (
                <form onSubmit={crearCoordinador} className="mb-3 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
                  <input required placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5" />
                  <input required type="email" placeholder="Email" value={nuevo.email} onChange={(e) => setNuevo((n) => ({ ...n, email: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5" />
                  <input
                    required
                    type="password"
                    minLength={6}
                    placeholder="Contraseña"
                    value={nuevo.password}
                    onChange={(e) => setNuevo((n) => ({ ...n, password: e.target.value }))}
                    className="rounded-md border border-slate-300 px-2 py-1.5"
                  />
                  <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 sm:col-span-3">
                    Crear cuenta de coordinación
                  </button>
                </form>
              )}

              <ul className="divide-y divide-slate-100">
                {coordinadores.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">
                        {c.nombre ?? c.email} {c.id === yo.id && <span className="text-xs font-normal text-slate-400">· tú</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        {c.email} · {ROL_LABEL[c.rol] ?? c.rol}
                        {!c.activo && <span className="text-rose-600"> · inactiva</span>}
                      </p>
                      {passwordReseteada?.id === c.id && (
                        <p className="text-xs text-brand-green-700">
                          Nueva contraseña: <strong>{passwordReseteada.password}</strong> (apúntala, no se repetirá)
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button onClick={() => resetear(c)} className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50">
                        Resetear contraseña
                      </button>
                      {c.id !== yo.id && (
                        <button onClick={() => alternarActivo(c)} className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50">
                          {c.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
