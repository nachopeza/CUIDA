import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { SolicitudFichaModal } from "../../components/SolicitudFichaModal.js";
import { ConsentimientosPersona } from "../../components/ConsentimientosPersona.js";
import type { PersonaConFamiliares, Solicitud } from "../../lib/types.js";

const PERFIL_CAMPOS = ["telefono", "direccion", "medicacion", "medico", "contactos", "recomendaciones"] as const;

const CUENTA_VACIA = { email: "", password: "" };
const FAMILIAR_VACIO = { nombre: "", parentesco: "", email: "", puedeVerImportes: true };

// Ficha unificada del usuario (sección "unificarlos con los representantes
// familiares en un único perfil pero con dos cuentas diferentes de uso"):
// datos, las cuentas de acceso vinculadas (persona y familiares, cada una
// con su alcance) y el historial de servicios solicitados, todo en un
// mismo sitio en vez de repartido entre formularios sueltos.
export function PersonaDetalleModal({ personaId, onClose, onCambiado }: { personaId: string; onClose: () => void; onCambiado: () => void }) {
  const { token } = useAuth();
  const [persona, setPersona] = useState<PersonaConFamiliares | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  const [cuenta, setCuenta] = useState(CUENTA_VACIA);
  const [cuentaCreada, setCuentaCreada] = useState<{ email: string; password?: string } | null>(null);
  const [vinculandoFamiliar, setVinculandoFamiliar] = useState(false);
  const [familiar, setFamiliar] = useState(FAMILIAR_VACIO);
  const [familiarCreado, setFamiliarCreado] = useState<{ email: string; password: string } | null>(null);
  const [fichaSolicitud, setFichaSolicitud] = useState<string | null>(null);
  const [passwordReseteada, setPasswordReseteada] = useState<{ email: string; passwordGenerada: string } | null>(null);

  async function cargar() {
    const [p, sols] = await Promise.all([
      api.get<PersonaConFamiliares>(`/personas/${personaId}`, token),
      api.get<Solicitud[]>("/solicitudes", token),
    ]);
    setPersona(p);
    setSolicitudes(sols.filter((s) => s.persona.id === personaId));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);


  const [descargando, setDescargando] = useState(false);

  // Se descarga como JSON con un bloque por finalidad y su base jurídica. No
  // es un volcado de la base de datos: es lo que se le entrega a la persona.
  async function descargarExpediente() {
    if (!persona) return;
    setDescargando(true);
    try {
      const expediente = await api.get<unknown>(`/proteccion-datos/personas/${persona.id}/expediente`, token);
      const blob = new Blob([JSON.stringify(expediente, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cuida-datos-${persona.codigo}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } finally {
      setDescargando(false);
    }
  }

  function abrirEditar() {
    if (!persona) return;
    setForm(Object.fromEntries(PERFIL_CAMPOS.map((c) => [c, persona[c] ?? ""])));
    setEditando(true);
  }

  async function guardarEdicion(e: FormEvent) {
    e.preventDefault();
    const datos = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || undefined]));
    await api.patch(`/personas/${personaId}`, datos, token);
    setEditando(false);
    await cargar();
    onCambiado();
  }

  async function crearCuenta(e: FormEvent) {
    e.preventDefault();
    const res = await api.post<{ email: string; passwordGenerada?: string }>(`/personas/${personaId}/cuenta`, cuenta, token);
    setCuentaCreada({ email: res.email, password: res.passwordGenerada });
    setCreandoCuenta(false);
    setCuenta(CUENTA_VACIA);
    await cargar();
    onCambiado();
  }

  async function resetearPassword() {
    const res = await api.post<{ email: string; passwordGenerada: string }>(`/personas/${personaId}/cuenta/password`, {}, token);
    setPasswordReseteada(res);
  }

  async function vincularFamiliar(e: FormEvent) {
    e.preventDefault();
    const password = Math.random().toString(36).slice(2, 10);
    await api.post(`/personas/${personaId}/familiares`, { ...familiar, esRepresentante: true, password }, token);
    setFamiliarCreado({ email: familiar.email, password });
    setVinculandoFamiliar(false);
    setFamiliar(FAMILIAR_VACIO);
    await cargar();
  }

  if (!persona) {
    return (
      <Modal title="Cargando…" onClose={onClose} size="lg">
        <p className="text-sm text-slate-500">Cargando ficha…</p>
      </Modal>
    );
  }

  return (
    <Modal title={`${persona.nombre} ${persona.apellidos} · ${persona.codigo}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* Datos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Datos</p>
            <span className="flex items-center gap-3">
              {/* Derecho de acceso (arts. 15 y 20 del RGPD): hay un mes para
                  responder, así que esto no puede ser una consulta que alguien
                  improvise a mano el día que llega la petición. */}
              <button
                onClick={descargarExpediente}
                disabled={descargando}
                className="text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700 disabled:opacity-50"
                title="Copia de todos sus datos personales, para entregársela si la pide"
              >
                {descargando ? "Preparando…" : "Copia de sus datos (RGPD)"}
              </button>
              {!editando && (
                <button onClick={abrirEditar} className="text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700">
                  Editar
                </button>
              )}
            </span>
          </div>
          {!editando ? (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
              <div><dt className="text-xs text-slate-400">Teléfono</dt><dd>{persona.telefono || "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Dirección</dt><dd>{persona.direccion || "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Medicación</dt><dd>{persona.medicacion || "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Médico</dt><dd>{persona.medico || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Contactos de emergencia</dt><dd>{persona.contactos || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Recomendaciones</dt><dd>{persona.recomendaciones || "—"}</dd></div>
            </dl>
          ) : (
            <form onSubmit={guardarEdicion} className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <input placeholder="Teléfono" value={form.telefono ?? ""} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2" />
              <input placeholder="Dirección" value={form.direccion ?? ""} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2" />
              <input placeholder="Medicación" value={form.medicacion ?? ""} onChange={(e) => setForm((f) => ({ ...f, medicacion: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2" />
              <input placeholder="Médico" value={form.medico ?? ""} onChange={(e) => setForm((f) => ({ ...f, medico: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2" />
              <input placeholder="Contactos de emergencia" value={form.contactos ?? ""} onChange={(e) => setForm((f) => ({ ...f, contactos: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 sm:col-span-2" />
              <textarea placeholder="Recomendaciones" value={form.recomendaciones ?? ""} onChange={(e) => setForm((f) => ({ ...f, recomendaciones: e.target.value }))} rows={2} className="rounded-md border border-slate-300 px-3 py-2 sm:col-span-2" />
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-800">Guardar</button>
                <button type="button" onClick={() => setEditando(false)} className="rounded-md border border-slate-300 px-4 py-2 hover:bg-slate-50">Cancelar</button>
              </div>
            </form>
          )}
        </div>

        {/* Qué se le ha explicado y qué ha autorizado */}
        <ConsentimientosPersona personaId={persona.id} />

        {/* Cuentas de acceso */}
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cuentas de acceso</p>

          <div className="mb-2 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">Cuenta de la persona <span className="font-normal text-slate-400">— acceso simple y directo</span></p>
            {persona.usuario ? (
              <div>
                <p className="text-sm text-slate-600">{persona.usuario.email} {!persona.usuario.activo && <span className="text-rose-600">(inactiva)</span>}</p>
                {passwordReseteada ? (
                  <p className="mt-1 text-xs text-brand-green-700">
                    Nueva contraseña: <strong>{passwordReseteada.passwordGenerada}</strong> (apúntala, no se repetirá)
                  </p>
                ) : (
                  <button onClick={resetearPassword} className="mt-1 text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700">
                    Resetear contraseña
                  </button>
                )}
              </div>
            ) : cuentaCreada ? (
              <p className="text-sm text-brand-green-700">Creada: {cuentaCreada.email} · contraseña <strong>{cuentaCreada.password}</strong> (apúntala, no se repetirá)</p>
            ) : creandoCuenta ? (
              <form onSubmit={crearCuenta} className="mt-2 flex flex-wrap gap-2">
                <input required type="email" placeholder="Email" value={cuenta.email} onChange={(e) => setCuenta((c) => ({ ...c, email: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">Crear acceso</button>
                <button type="button" onClick={() => setCreandoCuenta(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">Cancelar</button>
              </form>
            ) : (
              <button onClick={() => setCreandoCuenta(true)} className="mt-1 text-xs font-medium text-brand underline decoration-dotted">
                Sin acceso todavía — crear ahora
              </button>
            )}
          </div>

          {persona.familiares.map((f) => (
            <div key={f.id} className="mb-2 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">
                {f.usuario?.nombre ?? "Familiar"} <span className="font-normal text-slate-400">— {f.parentesco} · más opciones de gestión</span>
              </p>
              <p className="text-sm text-slate-600">{f.usuario?.email}</p>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                {f.esRepresentante && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Representante</span>}
                {f.puedeSolicitar && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Puede solicitar</span>}
                {f.puedeVerImportes && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Ve importes</span>}
              </div>
            </div>
          ))}

          {familiarCreado && (
            <p className="mb-2 text-sm text-brand-green-700">
              Familiar creado: {familiarCreado.email} · contraseña <strong>{familiarCreado.password}</strong> (apúntala, no se repetirá)
            </p>
          )}

          {vinculandoFamiliar ? (
            <form onSubmit={vincularFamiliar} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <input required placeholder="Nombre" value={familiar.nombre} onChange={(e) => setFamiliar((f) => ({ ...f, nombre: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5" />
              <input required placeholder="Parentesco (ej. Hija)" value={familiar.parentesco} onChange={(e) => setFamiliar((f) => ({ ...f, parentesco: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5" />
              <input required type="email" placeholder="Email" value={familiar.email} onChange={(e) => setFamiliar((f) => ({ ...f, email: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 sm:col-span-2" />
              <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
                <input type="checkbox" checked={familiar.puedeVerImportes} onChange={(e) => setFamiliar((f) => ({ ...f, puedeVerImportes: e.target.checked }))} />
                Puede ver importes/tarifas
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">Vincular</button>
                <button type="button" onClick={() => setVinculandoFamiliar(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">Cancelar</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setVinculandoFamiliar(true)} className="text-xs font-medium text-brand underline decoration-dotted">
              + Vincular otro familiar
            </button>
          )}
        </div>

        {/* Servicios solicitados */}
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Servicios solicitados</p>
          {solicitudes.length === 0 && <p className="text-sm text-slate-500">Todavía no ha solicitado ningún servicio.</p>}
          <ul className="divide-y divide-slate-100">
            {solicitudes.map((s) => (
              <li key={s.id}>
                <button onClick={() => setFichaSolicitud(s.id)} className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-slate-50">
                  <span>
                    {s.necesidad.nombre} <span className="text-xs text-slate-400">· {s.codigo}</span>
                  </span>
                  <EstadoBadge estado={s.servicio ? s.servicio.estado : s.estado} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {fichaSolicitud && (
        <SolicitudFichaModal
          solicitudId={fichaSolicitud}
          onClose={() => setFichaSolicitud(null)}
          onChanged={() => {
            cargar();
            onCambiado();
          }}
        />
      )}
    </Modal>
  );
}
