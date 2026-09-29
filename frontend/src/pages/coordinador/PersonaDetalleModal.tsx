import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { SolicitudFichaModal } from "../../components/SolicitudFichaModal.js";
import { Avatar } from "../../components/Avatar.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { IconCalendar, IconClock, IconPin } from "../../components/icons.js";
import { ConsentimientosPersona } from "../../components/ConsentimientosPersona.js";
import type { PersonaConFamiliares, Solicitud } from "../../lib/types.js";

const PERFIL_CAMPOS = ["telefono", "direccion", "municipio", "zona", "medicacion", "medico", "contactos", "recomendaciones"] as const;

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

  const estaCerrada = (sol: Solicitud) => ["CERRADO", "VALIDADO", "CANCELADO", "CANCELADA", "CERRADA"].includes(sol.servicio?.estado ?? sol.estado);
  const enMarcha = solicitudes.filter((sol) => !estaCerrada(sol));
  const cerradas = solicitudes.filter(estaCerrada);

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
        {/* Los servicios, lo primero. Es lo que se viene a mirar de una persona:
            qué tiene contratado, con quién y cuándo es lo próximo. Los datos de
            contacto y las cuentas van debajo, porque se consultan menos. */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Servicios</p>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
              {(persona.municipio || persona.direccion) && (
                <span className="flex items-center gap-1">
                  <IconPin className="h-3.5 w-3.5 text-slate-400" />
                  {[persona.zona, persona.municipio].filter(Boolean).join(" · ") || persona.direccion}
                </span>
              )}
              <span>{enMarcha.length} en marcha</span>
              {cerradas.length > 0 && <span className="text-slate-400">{cerradas.length} terminados</span>}
            </p>
          </div>

          {solicitudes.length === 0 && <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Todavía no ha solicitado ningún servicio.</p>}

          <ul className="grid gap-2 sm:grid-cols-2">
            {[...enMarcha, ...cerradas].map((sol) => {
              const srv = sol.servicio;
              const plan = sol.plan;
              const activa = !["CERRADO", "VALIDADO", "CANCELADO", "CANCELADA", "CERRADA"].includes(srv?.estado ?? sol.estado);
              const proxima = (srv?.visitas ?? [])
                .filter((v) => ["PROGRAMADA", "CONFIRMADA", "EN_CURSO"].includes(v.estado))
                .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
              return (
                <li key={sol.id}>
                  <button
                    onClick={() => setFichaSolicitud(sol.id)}
                    className={`flex h-full w-full flex-col gap-2 rounded-xl border p-3 text-left transition hover:border-brand-200 hover:bg-brand-50/30 ${activa ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/60"}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
                          <IconoNecesidad codigo={sol.necesidad.codigo} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">{sol.necesidad.nombre}</span>
                          <span className="block text-[11px] text-slate-400">
                            {sol.codigo}
                            {srv?.tipoServicio === "RECURRENTE" ? " · recurrente" : ""}
                          </span>
                        </span>
                      </span>
                      <EstadoBadge estado={srv ? srv.estado : sol.estado} />
                    </span>

                    {srv?.profesional ? (
                      <span className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Avatar foto={srv.profesional.foto} nombre={srv.profesional.nombre} apellidos={srv.profesional.apellidos} className="h-5 w-5" />
                        {srv.profesional.nombre} {srv.profesional.apellidos}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">Sin profesional todavía</span>
                    )}

                    {plan && (
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <IconClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {plan.horaInicio && plan.horaFin ? `${plan.horaInicio}–${plan.horaFin}` : plan.franjaHoraria || "Horario a concretar"}
                        {plan.recurrencia ? ` · ${plan.recurrencia}` : ""}
                        {!plan.fechaFin ? " · indefinido" : ""}
                      </span>
                    )}

                    {activa && (
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <IconCalendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {proxima
                          ? `Próxima: ${new Date(proxima.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}`
                          : srv && ["CONFIRMADO", "EN_CURSO"].includes(srv.estado)
                            ? "Sin jornada por delante"
                            : "Sin fecha aún"}
                      </span>
                    )}

                    {sol.descripcionLibre && <span className="line-clamp-2 text-xs italic text-slate-400">"{sol.descripcionLibre}"</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Datos */}
        <div className="border-t border-slate-100 pt-4">
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
              {/* El municipio es lo que ve una profesional que todavía no tiene
                  el trabajo asignado, así que se enseña aquí aparte: sin él,
                  su solicitud sale al mercado sin decir ni dónde es. */}
              <div>
                <dt className="text-xs text-slate-400">Municipio</dt>
                <dd>
                  {[persona.zona, persona.municipio].filter(Boolean).join(" · ") || <span className="text-amber-700">sin rellenar</span>}
                </dd>
              </div>
              <div><dt className="text-xs text-slate-400">Medicación</dt><dd>{persona.medicacion || "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Médico</dt><dd>{persona.medico || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Contactos de emergencia</dt><dd>{persona.contactos || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Recomendaciones</dt><dd>{persona.recomendaciones || "—"}</dd></div>
            </dl>
          ) : (
            <form onSubmit={guardarEdicion} className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <input placeholder="Teléfono" value={form.telefono ?? ""} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" />
              <input placeholder="Dirección (calle y número)" value={form.direccion ?? ""} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" />
              <input placeholder="Municipio" value={form.municipio ?? ""} onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" />
              <input placeholder="Barrio o zona (opcional)" value={form.zona ?? ""} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" />
              <input placeholder="Medicación" value={form.medicacion ?? ""} onChange={(e) => setForm((f) => ({ ...f, medicacion: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" />
              <input placeholder="Médico" value={form.medico ?? ""} onChange={(e) => setForm((f) => ({ ...f, medico: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" />
              <input placeholder="Contactos de emergencia" value={form.contactos ?? ""} onChange={(e) => setForm((f) => ({ ...f, contactos: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 sm:col-span-2" />
              <textarea placeholder="Recomendaciones" value={form.recomendaciones ?? ""} onChange={(e) => setForm((f) => ({ ...f, recomendaciones: e.target.value }))} rows={2} className="rounded-xl border border-slate-200 px-3 py-2 sm:col-span-2" />
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="rounded-xl bg-brand px-4 py-2 font-medium text-white hover:bg-brand-800">Guardar</button>
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

          <div className="mb-2 rounded-xl border border-slate-200 p-3">
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
                <button type="submit" className="rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">Crear acceso</button>
                <button type="button" onClick={() => setCreandoCuenta(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">Cancelar</button>
              </form>
            ) : (
              <button onClick={() => setCreandoCuenta(true)} className="mt-1 text-xs font-medium text-brand underline decoration-dotted">
                Sin acceso todavía — crear ahora
              </button>
            )}
          </div>

          {persona.familiares.map((f) => (
            <div key={f.id} className="mb-2 rounded-xl border border-slate-200 p-3">
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
            <form onSubmit={vincularFamiliar} className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <input required placeholder="Nombre" value={familiar.nombre} onChange={(e) => setFamiliar((f) => ({ ...f, nombre: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5" />
              <input required placeholder="Parentesco (ej. Hija)" value={familiar.parentesco} onChange={(e) => setFamiliar((f) => ({ ...f, parentesco: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5" />
              <input required type="email" placeholder="Email" value={familiar.email} onChange={(e) => setFamiliar((f) => ({ ...f, email: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 sm:col-span-2" />
              <label className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
                <input type="checkbox" checked={familiar.puedeVerImportes} onChange={(e) => setFamiliar((f) => ({ ...f, puedeVerImportes: e.target.checked }))} />
                Puede ver importes/tarifas
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">Vincular</button>
                <button type="button" onClick={() => setVinculandoFamiliar(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">Cancelar</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setVinculandoFamiliar(true)} className="text-xs font-medium text-brand underline decoration-dotted">
              + Vincular otro familiar
            </button>
          )}
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
