import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { ConversacionesPanel } from "../components/ConversacionesPanel.js";
import type { Factura, Incidencia, Necesidad, PersonaConFamiliares, Solicitud } from "../lib/types.js";

const ICONOS: Record<string, string> = {
  compra: "🛒",
  acompanamiento: "🚶",
  compania: "💬",
  tareas_domesticas: "🧹",
  comida: "🍲",
  recados: "📦",
  paseo: "🌳",
  citas: "🩺",
  apoyo_puntual: "🤝",
};

const SERVICIO_CANCELABLE = ["PENDIENTE", "ASIGNADO", "CONFIRMADO", "EN_CURSO"];
const CAMPOS_EDITABLES = ["telefono", "direccion", "contactos", "preferencias"] as const;

type Tab = "resumen" | "servicios" | "incidencias" | "solicitar" | "chat" | "facturacion" | "editar";
const TAB_LABEL: Record<Tab, string> = {
  resumen: "Resumen",
  servicios: "Servicios solicitados",
  incidencias: "Incidencias",
  solicitar: "Solicitar servicio",
  chat: "Chat",
  facturacion: "Facturación",
  editar: "Editar familiar",
};

// Interfaz CUIDA FAMILIA (sección 9), rediseñada con menú de secciones
// (sección "el panel del familiar debe tener un menú con las gestiones,
// servicios solicitados, incidencias, solicitar servicio, chat,
// facturación, editar familiar. Al iniciar solo debe salir un pequeño
// recuadro..."): la pantalla de entrada es un resumen compacto, no todo el
// historial de golpe — cada sección vive en su propia pestaña.
export function FamiliaPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("resumen");
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, PersonaConFamiliares>>({});
  const [personaEditando, setPersonaEditando] = useState("");
  const [formEdicion, setFormEdicion] = useState({ telefono: "", direccion: "", contactos: "", preferencias: "" });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [necesidadModal, setNecesidadModal] = useState<Necesidad | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    const [sols, necs, incs, facs] = await Promise.all([
      api.get<Solicitud[]>("/solicitudes", token),
      api.get<Necesidad[]>("/necesidades", token),
      api.get<Incidencia[]>("/incidencias", token),
      api.get<Factura[]>("/facturas", token),
    ]);
    setSolicitudes(sols);
    setNecesidades(necs);
    setIncidencias(incs);
    setFacturas(facs);

    const personaIds = Array.from(new Set(sols.map((s) => s.persona.id)));
    const detalles = await Promise.all(personaIds.map((id) => api.get<PersonaConFamiliares>(`/personas/${id}`, token)));
    const mapa = Object.fromEntries(detalles.map((p) => [p.id, p]));
    setPerfiles(mapa);
    if (!personaEditando && detalles[0]) {
      setPersonaEditando(detalles[0].id);
      setFormEdicion({
        telefono: detalles[0].telefono ?? "",
        direccion: detalles[0].direccion ?? "",
        contactos: detalles[0].contactos ?? "",
        preferencias: detalles[0].preferencias ?? "",
      });
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirPersonaEditar(id: string) {
    setPersonaEditando(id);
    const p = perfiles[id];
    if (p) setFormEdicion({ telefono: p.telefono ?? "", direccion: p.direccion ?? "", contactos: p.contactos ?? "", preferencias: p.preferencias ?? "" });
  }

  async function guardarEdicion() {
    if (!personaEditando) return;
    setGuardandoEdicion(true);
    try {
      await api.patch(`/personas/${personaEditando}`, formEdicion, token);
      setMensaje("Datos actualizados.");
      await cargar();
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function cancelarServicio(servicioId: string) {
    await api.post(`/servicios/${servicioId}/solicitar-cancelacion`, {}, token);
    setMensaje("Hemos avisado a coordinación. Te confirmarán la cancelación.");
    await cargar();
  }

  const personas = Object.values(perfiles);

  // Próximo servicio (sección "recuadro con... próximo servicio"): la visita
  // programada más cercana entre todos los servicios de la familia.
  const proximaVisita = useMemo(() => {
    const ahora = Date.now();
    const candidatas = solicitudes
      .flatMap((s) => s.servicio?.visitas ?? [])
      .filter((v) => ["PROGRAMADA", "CONFIRMADA"].includes(v.estado) && new Date(v.fecha).getTime() >= ahora)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    return candidatas[0] ?? null;
  }, [solicitudes]);

  const incidenciasAbiertas = incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado));

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Seguimiento familiar</h2>

      {mensaje && <div className="mb-4 rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">{mensaje}</div>}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 font-medium ${tab === t ? "bg-brand text-white" : "border border-slate-300 bg-white text-slate-600"}`}
          >
            {TAB_LABEL[t]}
            {t === "incidencias" && incidenciasAbiertas.length > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">{incidenciasAbiertas.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <>
          {personas.map((p) => (
            <Card key={p.id} title={`${p.nombre} ${p.apellidos}`}>
              <p className="text-xs text-slate-400">{p.codigo}</p>
              <p className="mt-1 text-sm text-slate-600">{p.direccion || "Sin dirección registrada"}</p>
            </Card>
          ))}

          <Card title="Próximo servicio">
            {proximaVisita ? (
              <p className="text-sm text-slate-700">
                {new Date(proximaVisita.fecha).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                {proximaVisita.horaInicioProg && ` · ${proximaVisita.horaInicioProg}`}
              </p>
            ) : (
              <p className="text-sm text-slate-500">No hay ninguna visita programada todavía.</p>
            )}
          </Card>

          <ConversacionesPanel />

          {personas.length > 0 && (
            <Card title="Solicitar ayuda">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {necesidades.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setNecesidadModal(n)}
                    className="flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-2 py-3 text-center hover:border-slate-400 hover:bg-slate-50"
                  >
                    <span className="text-2xl">{ICONOS[n.codigo] ?? "❓"}</span>
                    <span className="text-sm font-medium text-slate-800">{n.nombre}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {incidenciasAbiertas.length > 0 && (
            <Card title="Incidencias abiertas">
              <p className="text-sm text-slate-600">
                Tienes {incidenciasAbiertas.length} incidencia(s) en seguimiento. Consulta la pestaña "Incidencias" para ver el detalle.
              </p>
            </Card>
          )}
        </>
      )}

      {tab === "servicios" && (
        <Card title="Todos los servicios y solicitudes">
          {solicitudes.length === 0 && <p className="text-sm text-slate-500">Todavía no hay solicitudes.</p>}
          <ul className="divide-y divide-slate-100">
            {solicitudes.map((s) => (
              <li key={s.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {s.persona.nombre} · {s.necesidad.nombre}
                    </p>
                    <p className="text-xs text-slate-400">
                      {s.codigo} · {s.descripcionLibre}
                    </p>
                  </div>
                  <EstadoBadge estado={s.estado} />
                </div>
                {s.servicio && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-2 text-xs text-slate-500">
                    <span>Servicio {s.servicio.codigo}</span>
                    <EstadoBadge estado={s.servicio.estado} />
                    {(s.servicio.tarifaImporte != null || s.servicio.tarifaTipo) && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                        {s.servicio.tarifaTipo === "VOLUNTARIO" ? "Voluntario (sin coste)" : `${s.servicio.tarifaImporte} €`}
                      </span>
                    )}
                    {s.servicio.empresaColaboradora && <span className="text-slate-400">vía {s.servicio.empresaColaboradora.nombre}</span>}
                    {s.servicio.profesional && ["CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO"].includes(s.servicio.estado) && (
                      <span className="text-slate-600">
                        {s.servicio.profesional.nombre} {s.servicio.profesional.apellidos}
                        {s.servicio.profesional.telefono && ` · ${s.servicio.profesional.telefono}`}
                      </span>
                    )}
                    {SERVICIO_CANCELABLE.includes(s.servicio.estado) && (
                      <button onClick={() => setCancelando(s.servicio!.id)} className="ml-auto rounded-md border border-rose-200 px-2 py-0.5 text-rose-600 hover:bg-rose-50">
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
                {/* "Para que los familiares también acepten y vean las
                    cualidades" del profesional que la atiende, no solo un
                    nombre. */}
                {s.servicio?.profesional?.biografia && ["CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO"].includes(s.servicio.estado) && (
                  <div className="mt-1 flex items-start gap-2 pl-2">
                    {s.servicio.profesional.foto && <img src={s.servicio.profesional.foto} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />}
                    <p className="text-xs text-slate-500">{s.servicio.profesional.biografia}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "incidencias" && (
        <Card title="Incidencias">
          {incidencias.length === 0 && <p className="text-sm text-slate-500">No hay incidencias registradas.</p>}
          <ul className="divide-y divide-slate-100">
            {incidencias.map((i) => (
              <li key={i.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {i.tipo === "SOLICITUD_CANCELACION" && "🚫 "}
                      {i.descripcion}
                    </p>
                    <p className="text-xs text-slate-400">
                      {i.codigo} {i.servicio?.solicitud && `· ${i.servicio.solicitud.necesidad.nombre}`}
                    </p>
                  </div>
                  <EstadoBadge estado={i.estado} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "solicitar" && personas.length > 0 && (
        <Card title="¿Qué necesita?">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {necesidades.map((n) => (
              <button
                key={n.id}
                onClick={() => setNecesidadModal(n)}
                className="flex min-h-[90px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-slate-200 bg-white px-2 py-3 text-center hover:border-slate-400 hover:bg-slate-50"
              >
                <span className="text-2xl">{ICONOS[n.codigo] ?? "❓"}</span>
                <span className="text-sm font-medium text-slate-800">{n.nombre}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === "chat" && <ConversacionesPanel />}

      {tab === "facturacion" && (
        <Card title="Facturación">
          {facturas.length === 0 && <p className="text-sm text-slate-500">Todavía no hay facturas.</p>}
          <ul className="divide-y divide-slate-100">
            {facturas.map((f) => (
              <li key={f.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {f.persona.nombre} · {f.mes}
                  </p>
                  <EstadoBadge estado={f.estado} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Base {Number(f.importeTotal).toFixed(2)} € + IVA {Number(f.ivaTotal ?? 0).toFixed(2)} € = <strong>{Number(f.totalConIva ?? f.importeTotal).toFixed(2)} € total</strong>
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "editar" && personas.length > 0 && (
        <Card title="Editar datos de contacto">
          {personas.length > 1 && (
            <select value={personaEditando} onChange={(e) => elegirPersonaEditar(e.target.value)} className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos}
                </option>
              ))}
            </select>
          )}
          <p className="mb-3 text-xs text-slate-400">Puedes actualizar el teléfono, la dirección, los contactos de emergencia y las preferencias. El resto lo gestiona coordinación.</p>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {CAMPOS_EDITABLES.map((campo) => (
              <label key={campo} className="text-xs capitalize text-slate-500 sm:col-span-1">
                {campo}
                <input
                  value={formEdicion[campo]}
                  onChange={(e) => setFormEdicion((f) => ({ ...f, [campo]: e.target.value }))}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            ))}
          </div>
          <button
            onClick={guardarEdicion}
            disabled={guardandoEdicion}
            className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
          </button>
        </Card>
      )}

      {necesidadModal && (
        <SolicitudModal
          necesidad={necesidadModal}
          personas={personas}
          onClose={() => setNecesidadModal(null)}
          onCreated={() => {
            setMensaje("Solicitud enviada en nombre de la persona a tu cargo.");
            cargar();
          }}
        />
      )}

      {cancelando && (
        <ConfirmModal
          title="Cancelar servicio"
          description="Avisaremos a coordinación. Te lo confirmarán antes de cancelarlo del todo."
          confirmLabel="Sí, avisar"
          danger
          onConfirm={() => cancelarServicio(cancelando)}
          onClose={() => setCancelando(null)}
        />
      )}
    </div>
  );
}
