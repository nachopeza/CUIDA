import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";

const PERSONA_VACIA = {
  nombre: "",
  apellidos: "",
  telefono: "",
  direccion: "",
  medicacion: "",
  medico: "",
  contactos: "",
  recomendaciones: "",
};

const FAMILIAR_VACIO = {
  nombre: "",
  parentesco: "",
  email: "",
  puedeVerImportes: true,
};

interface Resultado {
  personaCodigo: string;
  emailPersona?: string;
  passwordPersona?: string;
  emailFamiliar?: string;
  passwordFamiliar?: string;
}

// Alta completa y dinámica de un usuario (sección "la creación de usuario
// con un botón y que se abra un pop-up más dinámico y completo... crear
// perfiles familiares, usuarios de app"): en un solo paso registra los
// datos de la persona, le crea su cuenta de acceso (simple y directa) y,
// si hace falta, la de un familiar representante (con más opciones de
// gestión) — las dos cuentas de uso del mismo perfil.
export function NuevoUsuarioModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth();
  const [persona, setPersona] = useState(PERSONA_VACIA);
  const [crearAccesoPersona, setCrearAccesoPersona] = useState(true);
  const [emailPersona, setEmailPersona] = useState("");
  const [conFamiliar, setConFamiliar] = useState(false);
  const [familiar, setFamiliar] = useState(FAMILIAR_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function limpiar<T extends Record<string, unknown>>(o: T) {
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && v === "" ? undefined : v]));
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const payload = {
        ...limpiar(persona),
        email: crearAccesoPersona && emailPersona ? emailPersona : undefined,
      };
      const creada = await api.post<{ codigo: string; id: string; email?: string; passwordGenerada?: string }>("/personas", payload, token);

      const res: Resultado = { personaCodigo: creada.codigo };
      if (creada.email) {
        res.emailPersona = creada.email;
        res.passwordPersona = creada.passwordGenerada;
      }

      if (conFamiliar && familiar.nombre && familiar.parentesco && familiar.email) {
        const passwordFamiliar = Math.random().toString(36).slice(2, 10);
        await api.post(`/personas/${creada.id}/familiares`, { ...familiar, esRepresentante: true, password: passwordFamiliar }, token);
        res.emailFamiliar = familiar.email;
        res.passwordFamiliar = passwordFamiliar;
      }

      setResultado(res);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario. Revisa los datos (¿email ya usado?).");
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <Modal title="Usuario creado" onClose={onClose} size="sm">
        <div className="space-y-3 text-sm">
          <p className="text-brand-green-700">
            Perfil <strong>{resultado.personaCodigo}</strong> creado correctamente.
          </p>
          {resultado.emailPersona && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-medium text-slate-700">Acceso de la persona (simple y directo)</p>
              <p className="text-slate-600">Email: {resultado.emailPersona}</p>
              {resultado.passwordPersona && <p className="text-slate-600">Contraseña: <strong>{resultado.passwordPersona}</strong></p>}
            </div>
          )}
          {resultado.emailFamiliar && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="font-medium text-slate-700">Acceso del familiar (más opciones de gestión)</p>
              <p className="text-slate-600">Email: {resultado.emailFamiliar}</p>
              {resultado.passwordFamiliar && <p className="text-slate-600">Contraseña: <strong>{resultado.passwordFamiliar}</strong></p>}
            </div>
          )}
          <p className="text-xs text-slate-400">Apunta estas contraseñas ahora: no se volverán a mostrar.</p>
          <button onClick={onClose} className="w-full rounded-xl bg-brand px-4 py-2 font-medium text-white hover:bg-brand-800">
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose} size="lg">
      <form onSubmit={crear} className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Datos de la persona</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input required placeholder="Nombre" value={persona.nombre} onChange={(e) => setPersona((p) => ({ ...p, nombre: e.target.value }))} className="campo" />
            <input required placeholder="Apellidos" value={persona.apellidos} onChange={(e) => setPersona((p) => ({ ...p, apellidos: e.target.value }))} className="campo" />
            <input placeholder="Teléfono" value={persona.telefono} onChange={(e) => setPersona((p) => ({ ...p, telefono: e.target.value }))} className="campo" />
            <input placeholder="Dirección" value={persona.direccion} onChange={(e) => setPersona((p) => ({ ...p, direccion: e.target.value }))} className="campo sm:col-span-2" />
            <input placeholder="Medicación" value={persona.medicacion} onChange={(e) => setPersona((p) => ({ ...p, medicacion: e.target.value }))} className="campo" />
            <input placeholder="Médico / centro de referencia" value={persona.medico} onChange={(e) => setPersona((p) => ({ ...p, medico: e.target.value }))} className="campo sm:col-span-2" />
            <input placeholder="Contactos de emergencia" value={persona.contactos} onChange={(e) => setPersona((p) => ({ ...p, contactos: e.target.value }))} className="campo sm:col-span-3" />
            <textarea placeholder="Recomendaciones" value={persona.recomendaciones} onChange={(e) => setPersona((p) => ({ ...p, recomendaciones: e.target.value }))} rows={2} className="campo sm:col-span-3" />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={crearAccesoPersona} onChange={(e) => setCrearAccesoPersona(e.target.checked)} />
            Crear acceso a la app para esta persona (cuenta simple y directa)
          </label>
          {crearAccesoPersona && (
            <div className="mt-2">
              <input
                type="email"
                placeholder="Email de acceso de la persona"
                value={emailPersona}
                onChange={(e) => setEmailPersona(e.target.value)}
                className="w-full campo sm:w-1/2"
              />
              <p className="mt-1 text-xs text-slate-400">Se generará una contraseña automáticamente y se mostrará al terminar.</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={conFamiliar} onChange={(e) => setConFamiliar(e.target.checked)} />
            Vincular un familiar representante (cuenta con más opciones y gestión)
          </label>
          {conFamiliar && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input placeholder="Nombre del familiar" value={familiar.nombre} onChange={(e) => setFamiliar((f) => ({ ...f, nombre: e.target.value }))} className="campo" />
              <input placeholder="Parentesco (ej. Hija)" value={familiar.parentesco} onChange={(e) => setFamiliar((f) => ({ ...f, parentesco: e.target.value }))} className="campo" />
              <input type="email" placeholder="Email del familiar" value={familiar.email} onChange={(e) => setFamiliar((f) => ({ ...f, email: e.target.value }))} className="campo" />
              <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-3">
                <input type="checkbox" checked={familiar.puedeVerImportes} onChange={(e) => setFamiliar((f) => ({ ...f, puedeVerImportes: e.target.checked }))} />
                Puede ver importes/tarifas
              </label>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button type="submit" disabled={enviando} className="w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
          {enviando ? "Creando…" : "Crear usuario"}
        </button>
      </form>
    </Modal>
  );
}
