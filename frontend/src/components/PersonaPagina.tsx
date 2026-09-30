import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { useRefrescoAutomatico } from "../lib/refresco.js";
import { diaDe } from "../lib/fechas.js";
import { IconoNecesidad } from "../lib/necesidadIconos.js";
import type { PersonaConFamiliares, Solicitud } from "../lib/types.js";
import { Avatar } from "./Avatar.js";
import { EstadoBadge } from "./EstadoBadge.js";
import { ConsentimientosPersona } from "./ConsentimientosPersona.js";
import { Bloque, Dato, Etiqueta, FichaCabecera, Pestanas, RejillaFicha, AccionesRapidas } from "./ficha.js";
import { IconCalendar, IconCheck, IconClock, IconDownload, IconFamily, IconKey, IconPencil, IconPhone, IconPin, IconPlus, IconShield } from "./icons.js";

// ---------------------------------------------------------------------------
// La página de una persona
//
// Mismas piezas que la del servicio y la de la profesional. Lo primero son sus
// servicios —es lo que se viene a mirar—; los datos, las cuentas de acceso y lo
// que ha autorizado en materia de protección de datos, cada uno en su pestaña.
// ---------------------------------------------------------------------------

type Pestana = "resumen" | "datos" | "accesos" | "proteccion";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "datos", etiqueta: "Datos" },
  { clave: "accesos", etiqueta: "Cuentas de acceso" },
  { clave: "proteccion", etiqueta: "Protección de datos" },
];

const PERFIL_CAMPOS = ["telefono", "direccion", "municipio", "zona", "medicacion", "medico", "contactos", "recomendaciones"] as const;
const CUENTA_VACIA = { email: "", password: "" };
const FAMILIAR_VACIO = { nombre: "", parentesco: "", email: "", puedeVerImportes: true };
const CERRADOS = ["CERRADO", "VALIDADO", "CANCELADO", "CANCELADA", "CERRADA"];

export function PersonaPagina({
  personaId,
  onVolver,
  onChanged,
  onAbrirSolicitud,
  etiquetaVolver = "Volver a personas",
}: {
  personaId: string;
  onVolver: () => void;
  onChanged: () => void;
  onAbrirSolicitud: (solicitudId: string) => void;
  etiquetaVolver?: string;
}) {
  const { token } = useAuth();
  const [persona, setPersona] = useState<PersonaConFamiliares | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [aviso, setAviso] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  const [cuenta, setCuenta] = useState(CUENTA_VACIA);
  const [vinculando, setVinculando] = useState(false);
  const [familiar, setFamiliar] = useState(FAMILIAR_VACIO);
  const [descargando, setDescargando] = useState(false);

  async function cargar() {
    try {
      const [p, sols] = await Promise.all([api.get<PersonaConFamiliares>(`/personas/${personaId}`, token), api.get<Solicitud[]>("/solicitudes", token)]);
      setPersona(p);
      setSolicitudes(sols.filter((s) => s.persona.id === personaId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cargar la ficha");
    }
  }

  useEffect(() => {
    setPersona(null);
    setPestana("resumen");
    setEditando(false);
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  useRefrescoAutomatico(cargar, 30000);

  const estaCerrada = (s: Solicitud) => CERRADOS.includes(s.servicio?.estado ?? s.estado);
  const enMarcha = useMemo(() => solicitudes.filter((s) => !estaCerrada(s)), [solicitudes]);
  const terminadas = useMemo(() => solicitudes.filter(estaCerrada), [solicitudes]);
  const proxima = useMemo(
    () =>
      enMarcha
        .flatMap((s) => (s.servicio?.visitas ?? []).filter((v) => ["PROGRAMADA", "CONFIRMADA", "EN_CURSO"].includes(v.estado)).map((v) => ({ v, s })))
        .sort((a, b) => a.v.fecha.localeCompare(b.v.fecha))[0] ?? null,
    [enMarcha],
  );

  if (error && !persona) {
    return (
      <div className="tarjeta p-6 text-sm text-slate-600">
        <button onClick={onVolver} className="mb-3 text-sm text-slate-500 hover:text-slate-800">
          ← {etiquetaVolver}
        </button>
        <p className="text-rose-600">{error}</p>
      </div>
    );
  }
  if (!persona) return <p className="p-6 text-sm text-slate-400">Cargando…</p>;

  const nombre = `${persona.nombre} ${persona.apellidos}`;
  const lugar = [persona.zona, persona.municipio].filter(Boolean).join(" · ");

  function abrirEdicion() {
    setForm(Object.fromEntries(PERFIL_CAMPOS.map((c) => [c, persona![c] ?? ""])));
    setEditando(true);
    setPestana("datos");
  }

  async function guardarEdicion(e: FormEvent) {
    e.preventDefault();
    const datos = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || undefined]));
    await api.patch(`/personas/${personaId}`, datos, token);
    setEditando(false);
    setAviso("Datos guardados.");
    await cargar();
    onChanged();
  }

  async function crearCuenta(e: FormEvent) {
    e.preventDefault();
    const r = await api.post<{ email: string; passwordGenerada?: string }>(`/personas/${personaId}/cuenta`, cuenta, token);
    setAviso(`Acceso creado: ${r.email}${r.passwordGenerada ? ` · contraseña ${r.passwordGenerada} (apúntala, no se repetirá)` : ""}`);
    setCreandoCuenta(false);
    setCuenta(CUENTA_VACIA);
    await cargar();
    onChanged();
  }

  async function resetearPassword() {
    const r = await api.post<{ email: string; passwordGenerada: string }>(`/personas/${personaId}/cuenta/password`, {}, token);
    setAviso(`Nueva contraseña de ${r.email}: ${r.passwordGenerada} (apúntala, no se repetirá)`);
    setPestana("accesos");
  }

  async function vincularFamiliar(e: FormEvent) {
    e.preventDefault();
    const password = Math.random().toString(36).slice(2, 10);
    await api.post(`/personas/${personaId}/familiares`, { ...familiar, esRepresentante: true, password }, token);
    setAviso(`Familiar creado: ${familiar.email} · contraseña ${password} (apúntala, no se repetirá)`);
    setVinculando(false);
    setFamiliar(FAMILIAR_VACIO);
    await cargar();
  }

  // Derecho de acceso (arts. 15 y 20 del RGPD): hay un mes para responder, así que
  // no puede ser una consulta que alguien improvise el día que llega la petición.
  async function descargarExpediente() {
    setDescargando(true);
    try {
      const expediente = await api.get<unknown>(`/proteccion-datos/personas/${persona!.id}/expediente`, token);
      const blob = new Blob([JSON.stringify(expediente, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cuida-datos-${persona!.codigo}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } finally {
      setDescargando(false);
    }
  }

  const tarjetasServicio = (lista: Solicitud[]) => (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
      {lista.map((sol) => {
        const srv = sol.servicio;
        const plan = sol.plan;
        const activa = !estaCerrada(sol);
        const prox = (srv?.visitas ?? []).filter((v) => ["PROGRAMADA", "CONFIRMADA", "EN_CURSO"].includes(v.estado)).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
        return (
          <li key={sol.id}>
            <button
              onClick={() => onAbrirSolicitud(sol.id)}
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
                  {prox ? `Próxima: ${new Date(prox.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}` : "Sin jornada por delante"}
                </span>
              )}
              {sol.descripcionLibre && <span className="line-clamp-2 text-xs italic text-slate-400">"{sol.descripcionLibre}"</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4">
      <FichaCabecera
        volver={etiquetaVolver}
        onVolver={onVolver}
        titulo={nombre}
        etiquetas={
          <span className={`pastilla ${persona.estado === "ACTIVA" || persona.estado === "ACTIVO" ? "bg-brand-green-100 text-brand-green-700" : "bg-slate-200 text-slate-600"}`}>
            <IconCheck className="h-3.5 w-3.5" /> {persona.estado === "ACTIVA" || persona.estado === "ACTIVO" ? "Activa" : persona.estado.toLowerCase()}
          </span>
        }
        linea={
          <>
            {persona.codigo}
            {lugar ? ` · ${lugar}` : ""}
          </>
        }
        acciones={
          <button onClick={abrirEdicion} className="boton-secundario">
            <IconPencil className="h-4 w-4" /> Editar datos
          </button>
        }
        menu={[
          { etiqueta: "Copia de sus datos (RGPD)", Icono: IconDownload, alPulsar: () => void descargarExpediente() },
          { etiqueta: "Resetear contraseña", Icono: IconKey, alPulsar: () => void resetearPassword(), razon: persona.usuario ? null : "Todavía no tiene cuenta de acceso." },
        ]}
      />

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 px-4 py-2.5 text-sm text-brand-green-800" role="status">
          <span className="min-w-0 break-words">{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-brand-green-700 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="tarjeta flex items-start gap-4 p-4">
          <Avatar nombre={persona.nombre} apellidos={persona.apellidos} className="h-14 w-14 !text-sm" />
          <div className="min-w-0 flex-1">
            <Etiqueta>Persona usuaria</Etiqueta>
            <p className="truncate text-base font-semibold text-slate-800">{nombre}</p>
            <p className="text-xs text-slate-400">{persona.codigo}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {persona.telefono && (
                <p className="flex items-center gap-2">
                  <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {persona.telefono}
                </p>
              )}
              {(persona.direccion || lugar) && (
                <p className="flex items-start gap-2">
                  <IconPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="min-w-0">{persona.direccion ?? lugar}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="tarjeta flex items-start gap-4 p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-700">
            <IconFamily className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <Etiqueta>Familia y representantes</Etiqueta>
            {persona.familiares.length === 0 ? (
              <p className="mt-0.5 text-sm text-slate-500">Sin familiares vinculados.</p>
            ) : (
              <ul className="mt-0.5 space-y-1">
                {persona.familiares.slice(0, 3).map((f) => (
                  <li key={f.id} className="text-sm text-slate-700">
                    <span className="font-medium">{f.usuario?.nombre ?? "Familiar"}</span> <span className="text-slate-400">· {f.parentesco}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">{persona.usuario ? "Tiene acceso propio" : "Sin acceso propio"}</p>
          </div>
          <button onClick={() => setPestana("accesos")} className="boton-secundario-sm shrink-0">
            Ver cuentas
          </button>
        </div>
      </div>

      <div className="tarjeta p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Dato etiqueta="Servicios en marcha">{enMarcha.length}</Dato>
          <Dato etiqueta="Servicios terminados">{terminadas.length}</Dato>
          <Dato etiqueta="Próxima visita">
            {proxima ? new Date(proxima.v.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }) : "—"}
          </Dato>
          <Dato etiqueta="Municipio">{lugar || <span className="text-amber-700">Sin rellenar</span>}</Dato>
        </div>
      </div>

      <RejillaFicha>
        <div className="min-w-0 space-y-4">
          <Pestanas valor={pestana} onCambiar={setPestana} opciones={PESTANAS} />

          {pestana === "resumen" && (
            <>
              <Bloque titulo="Servicios">
                {solicitudes.length === 0 ? <p className="text-sm text-slate-400">Todavía no ha solicitado ningún servicio.</p> : tarjetasServicio([...enMarcha, ...terminadas])}
              </Bloque>
              <Bloque titulo="Salud y cuidados">
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Dato etiqueta="Medicación">{persona.medicacion || "—"}</Dato>
                  <Dato etiqueta="Médico">{persona.medico || "—"}</Dato>
                </div>
              </Bloque>
            </>
          )}

          {pestana === "datos" && (
            <Bloque titulo="Datos de la persona" accion={!editando ? <button onClick={abrirEdicion} className="boton-secundario-sm">Editar</button> : undefined}>
              {!editando ? (
                <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Dato etiqueta="Teléfono">{persona.telefono || "—"}</Dato>
                  <Dato etiqueta="Dirección">{persona.direccion || "—"}</Dato>
                  <Dato etiqueta="Municipio">{lugar || <span className="text-amber-700">Sin rellenar</span>}</Dato>
                  <Dato etiqueta="Medicación">{persona.medicacion || "—"}</Dato>
                  <Dato etiqueta="Médico">{persona.medico || "—"}</Dato>
                  <div className="sm:col-span-2">
                    <Etiqueta>Contactos de emergencia</Etiqueta>
                    <p className="mt-0.5 text-sm text-slate-800">{persona.contactos || "—"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <Etiqueta>Recomendaciones</Etiqueta>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-slate-800">{persona.recomendaciones || "—"}</p>
                  </div>
                </dl>
              ) : (
                <form onSubmit={guardarEdicion} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ["telefono", "Teléfono", false],
                    ["direccion", "Dirección (calle y número)", false],
                    ["municipio", "Municipio", false],
                    ["zona", "Barrio o zona", false],
                    ["medicacion", "Medicación", false],
                    ["medico", "Médico", false],
                    ["contactos", "Contactos de emergencia", true],
                  ].map(([clave, etiqueta, ancho]) => (
                    <label key={clave as string} className={`text-xs text-slate-500 ${ancho ? "sm:col-span-2" : ""}`}>
                      {etiqueta as string}
                      <input value={form[clave as string] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [clave as string]: e.target.value }))} className="campo mt-0.5" />
                    </label>
                  ))}
                  <label className="text-xs text-slate-500 sm:col-span-2">
                    Recomendaciones
                    <textarea value={form.recomendaciones ?? ""} onChange={(e) => setForm((f) => ({ ...f, recomendaciones: e.target.value }))} rows={3} className="campo mt-0.5" />
                  </label>
                  <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                    <button type="button" onClick={() => setEditando(false)} className="boton-secundario">
                      Cancelar
                    </button>
                    <button type="submit" className="boton-principal">
                      Guardar cambios
                    </button>
                  </div>
                </form>
              )}
            </Bloque>
          )}

          {pestana === "accesos" && (
            <div className="space-y-4">
              <Bloque titulo="Cuenta de la persona" accion={<span className="text-xs text-slate-400">Acceso simple y directo</span>}>
                {persona.usuario ? (
                  <div className="space-y-2 text-sm">
                    <p className="text-slate-700">
                      {persona.usuario.email} {!persona.usuario.activo && <span className="text-rose-600">(inactiva)</span>}
                    </p>
                    <button onClick={() => void resetearPassword()} className="boton-secundario-sm">
                      <IconKey className="h-3.5 w-3.5" /> Resetear contraseña
                    </button>
                  </div>
                ) : creandoCuenta ? (
                  <form onSubmit={crearCuenta} className="flex flex-wrap items-end gap-3">
                    <label className="min-w-[14rem] flex-1 text-xs text-slate-500">
                      Email
                      <input required type="email" value={cuenta.email} onChange={(e) => setCuenta((c) => ({ ...c, email: e.target.value }))} className="campo mt-0.5" />
                    </label>
                    <button type="submit" className="boton-principal">
                      Crear acceso
                    </button>
                    <button type="button" onClick={() => setCreandoCuenta(false)} className="boton-secundario">
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">Todavía no tiene acceso.</p>
                    <button onClick={() => setCreandoCuenta(true)} className="boton-secundario-sm">
                      <IconPlus className="h-3.5 w-3.5" /> Crear acceso
                    </button>
                  </div>
                )}
              </Bloque>

              <Bloque titulo="Familiares" accion={!vinculando ? <button onClick={() => setVinculando(true)} className="boton-secundario-sm"><IconPlus className="h-3.5 w-3.5" /> Vincular familiar</button> : undefined}>
                {persona.familiares.length === 0 && !vinculando && <p className="text-sm text-slate-400">Sin familiares vinculados.</p>}
                <ul className="space-y-3">
                  {persona.familiares.map((f) => (
                    <li key={f.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-medium text-slate-700">
                        {f.usuario?.nombre ?? "Familiar"} <span className="font-normal text-slate-400">· {f.parentesco}</span>
                      </p>
                      <p className="text-sm text-slate-600">{f.usuario?.email}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {f.esRepresentante && <span className="pastilla !py-0.5 bg-slate-100 text-slate-600">Representante</span>}
                        {f.puedeSolicitar && <span className="pastilla !py-0.5 bg-slate-100 text-slate-600">Puede solicitar</span>}
                        {f.puedeVerImportes && <span className="pastilla !py-0.5 bg-slate-100 text-slate-600">Ve importes</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                {vinculando && (
                  <form onSubmit={vincularFamiliar} className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-500">
                      Nombre
                      <input required value={familiar.nombre} onChange={(e) => setFamiliar((f) => ({ ...f, nombre: e.target.value }))} className="campo mt-0.5" />
                    </label>
                    <label className="text-xs text-slate-500">
                      Parentesco
                      <input required placeholder="Ej. Hija" value={familiar.parentesco} onChange={(e) => setFamiliar((f) => ({ ...f, parentesco: e.target.value }))} className="campo mt-0.5" />
                    </label>
                    <label className="text-xs text-slate-500 sm:col-span-2">
                      Email
                      <input required type="email" value={familiar.email} onChange={(e) => setFamiliar((f) => ({ ...f, email: e.target.value }))} className="campo mt-0.5" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                      <input type="checkbox" checked={familiar.puedeVerImportes} onChange={(e) => setFamiliar((f) => ({ ...f, puedeVerImportes: e.target.checked }))} />
                      Puede ver importes y tarifas
                    </label>
                    <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                      <button type="button" onClick={() => setVinculando(false)} className="boton-secundario">
                        Cancelar
                      </button>
                      <button type="submit" className="boton-principal">
                        Vincular
                      </button>
                    </div>
                  </form>
                )}
              </Bloque>
            </div>
          )}

          {pestana === "proteccion" && (
            <Bloque titulo="Qué se le ha explicado y qué ha autorizado">
              <ConsentimientosPersona personaId={persona.id} />
            </Bloque>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <AccionesRapidas
            acciones={[
              { etiqueta: "Editar datos", Icono: IconPencil, alPulsar: abrirEdicion },
              { etiqueta: "Vincular familiar", Icono: IconFamily, alPulsar: () => { setPestana("accesos"); setVinculando(true); } },
              { etiqueta: "Resetear contraseña", Icono: IconKey, alPulsar: () => void resetearPassword(), oculto: !persona.usuario },
              { etiqueta: descargando ? "Preparando…" : "Copia de sus datos (RGPD)", Icono: IconDownload, alPulsar: () => void descargarExpediente() },
              { etiqueta: "Protección de datos", Icono: IconShield, alPulsar: () => setPestana("proteccion") },
            ]}
          />
          <Bloque titulo="Información adicional">
            <Etiqueta>Recomendaciones</Etiqueta>
            <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{persona.recomendaciones || "Sin recomendaciones."}</p>
            <div className="mt-3">
              <Etiqueta>Contactos de emergencia</Etiqueta>
              <p className="mt-0.5 text-sm text-slate-600">{persona.contactos || "Sin contactos."}</p>
            </div>
          </Bloque>
          {proxima && (
            <Bloque titulo="Próxima visita">
              <p className="text-sm font-medium text-slate-800">{diaDe(proxima.v.fecha)}{proxima.v.horaInicioProg ? ` · ${proxima.v.horaInicioProg}` : ""}</p>
              <p className="text-xs text-slate-500">{proxima.s.necesidad.nombre}</p>
            </Bloque>
          )}
        </aside>
      </RejillaFicha>
    </div>
  );
}
