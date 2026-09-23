import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { useRegistrarMenuMovil } from "../lib/menuMovil.js";
import { api } from "../lib/api.js";
import { Avatar } from "../components/Avatar.js";
import { Card } from "../components/Layout.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import { SolicitudModal } from "../components/SolicitudModal.js";
import { Modal } from "../components/Modal.js";
import { FacturaDocumento, referenciaFactura } from "../components/FacturaDocumento.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { ConversacionesPanel } from "../components/ConversacionesPanel.js";
import { IconoNecesidad } from "../lib/necesidadIconos.js";
import type { Factura, Incidencia, Necesidad, PersonaConFamiliares, Solicitud } from "../lib/types.js";
import {
  IconAlert,
  IconBan,
  IconBriefcase,
  IconChat,
  IconChevronDown,
  IconClock,
  IconHome,
  IconInfinity,
  IconPlus,
  IconFile,
  IconReceipt,
  IconUsers,
} from "../components/icons.js";
import { Navegacion, type ItemNav } from "../components/Navegacion.js";
import { conMayusculaInicial, duracion, minutosEntre } from "../lib/economia.js";

const SERVICIO_CANCELABLE = ["PENDIENTE", "ASIGNADO", "CONFIRMADO", "EN_CURSO"];

// Misma navegación que el resto de la app: barra lateral en pantalla ancha y
// cajón en el móvil, que es donde una hija va a abrir esto.
const NAV: ItemNav[] = [
  { key: "resumen", label: "Resumen", icon: IconHome },
  { key: "servicios", label: "Servicios", icon: IconBriefcase },
  { key: "solicitar", label: "Solicitar", icon: IconPlus },
  { key: "incidencias", label: "Incidencias", icon: IconAlert },
  { key: "chat", label: "Chat", icon: IconChat },
  { key: "facturacion", label: "Facturación", icon: IconReceipt },
  { key: "editar", label: "Mis datos", icon: IconUsers },
];
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
  const [menuAbierto, setMenuAbierto] = useState(false);
  // La hamburguesa está en la cabecera y abre este cajón.
  useRegistrarMenuMovil(() => setMenuAbierto(true));
  const [otrosAbiertos, setOtrosAbiertos] = useState(false);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, PersonaConFamiliares>>({});
  const [personaEditando, setPersonaEditando] = useState("");
  const [formEdicion, setFormEdicion] = useState({ telefono: "", direccion: "", contactos: "", preferencias: "" });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [necesidadModal, setNecesidadModal] = useState<Necesidad | null>(null);
  // La factura abierta se pide entera: el listado no trae ni las líneas ni el
  // QR de cotejo, y el documento los necesita.
  const [facturaAbierta, setFacturaAbierta] = useState<Factura | null>(null);

  async function abrirFactura(id: string) {
    setFacturaAbierta(await api.get<Factura>(`/facturas/${id}`, token));
  }
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

  // Lo que hay contratado ahora mismo. Es lo primero que quiere ver una hija:
  // qué tiene su madre, quién viene y cuándo — no la lista de todo lo que se
  // ha pedido alguna vez.
  const contratados = useMemo(
    () =>
      solicitudes
        .filter((s) => s.servicio && ["CONFIRMADO", "EN_CURSO"].includes(s.servicio.estado))
        .map((s) => {
          const ahora = Date.now();
          const proxima = (s.servicio?.visitas ?? [])
            .filter((v) => ["PROGRAMADA", "CONFIRMADA"].includes(v.estado) && new Date(v.fecha).getTime() >= ahora - 86400000)
            .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
          const enCurso = (s.servicio?.visitas ?? []).find((v) => v.horaInicioReal && !v.horaFinReal);
          return { solicitud: s, proxima, enCurso };
        })
        .sort((a, b) => (a.proxima?.fecha ?? "9999").localeCompare(b.proxima?.fecha ?? "9999")),
    [solicitudes],
  );

  const incidenciasAbiertas = incidencias.filter((i) => !["RESUELTA", "CERRADA"].includes(i.estado));

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <Navegacion
        items={NAV}
        activo={tab}
        onIr={(k) => {
          setTab(k as Tab);
          setMenuAbierto(false);
        }}
        badges={{ incidencias: incidenciasAbiertas.length > 0 ? { valor: incidenciasAbiertas.length, tono: "rose" } : undefined }}
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
      />

      <div className="min-w-0 flex-1">

      {mensaje && <div className="mb-4 rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">{mensaje}</div>}

      {tab === "resumen" && (
        <>
          {/* El servicio contratado, de un vistazo: qué es, quién viene, cada
              cuánto y si es indefinido. Antes había que ir a "Servicios
              solicitados" y leer la lista entera para saberlo. */}
          {contratados.length === 0 ? (
            <Card title="Servicio contratado">
              <p className="text-sm text-slate-500">Todavía no hay ningún servicio en marcha.</p>
            </Card>
          ) : (
            <div className="mb-4">
              {/* Solo el servicio que toca, desplegado y en verde. Con cuatro
                  contratados, cuatro tarjetas enteras empujaban los atajos de
                  "solicitar ayuda" fuera de la pantalla; el resto se resume en
                  una línea cada uno y solo si se piden. */}
              {(() => {
                const { solicitud: s, proxima, enCurso } = contratados[0];
                const plan = s.plan;
                const indefinido = plan && !plan.fechaFin;
                const pro = s.servicio?.profesional;
                const minutos = minutosEntre(plan?.horaInicio, plan?.horaFin);
                return (
                  <div className="rounded-xl border-2 border-brand-green-200 bg-white shadow-sm">
                    <div className="rounded-t-[10px] bg-brand-green-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-base font-semibold text-slate-800">
                            <IconoNecesidad codigo={s.necesidad.codigo} className="h-5 w-5 shrink-0 text-brand-green-700" />
                            {s.necesidad.nombre}
                          </p>
                          <p className="text-sm text-slate-500">
                            para {s.persona.nombre} {s.persona.apellidos}
                          </p>
                        </div>
                        {indefinido ? (
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-green-700">
                            <IconInfinity className="h-3.5 w-3.5" />
                            Indefinido
                          </span>
                        ) : (
                          plan?.fechaFin && (
                            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                              Hasta el {new Date(plan.fechaFin).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <dl className="space-y-1.5 text-sm">
                        {pro && (
                          <div className="flex items-center gap-2">
                            <IconUsers className="h-4 w-4 shrink-0 text-slate-400" />
                            <dd className="text-slate-700">
                              Viene <strong className="font-medium">{pro.nombre} {pro.apellidos}</strong>
                            </dd>
                          </div>
                        )}
                        {plan?.horaInicio && (
                          <div className="flex items-center gap-2">
                            <IconClock className="h-4 w-4 shrink-0 text-slate-400" />
                            <dd className="text-slate-700">
                              {plan.horaInicio}–{plan.horaFin}
                              {minutos != null && <span className="text-slate-400"> · {duracion(minutos)}</span>}
                              {plan.recurrencia && <span className="text-slate-400"> · {plan.recurrencia}</span>}
                            </dd>
                          </div>
                        )}
                      </dl>

                      {/* Lo que de verdad se pregunta: ¿cuándo viene la próxima
                          vez? Y si está ahora mismo, se dice. */}
                      <div className={`mt-3 rounded-lg px-3 py-2.5 ${enCurso ? "bg-brand-green-50" : "bg-slate-50"}`}>
                        {enCurso ? (
                          <p className="flex items-center gap-2 text-sm font-medium text-brand-green-700">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-green-600" />
                            {pro?.nombre ?? "La profesional"} está ahí ahora mismo
                          </p>
                        ) : proxima ? (
                          <p className="text-sm text-slate-700">
                            <span className="text-slate-500">Próxima visita: </span>
                            <strong className="font-medium">
                              {conMayusculaInicial(
                                new Date(proxima.fecha).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }),
                              )}
                            </strong>
                            {proxima.horaInicioProg && ` a las ${proxima.horaInicioProg}`}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500">Sin próxima visita en la agenda todavía.</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {contratados.length > 1 && (
                <div className="mt-2">
                  {otrosAbiertos && (
                    <ul className="mb-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {contratados.slice(1).map(({ solicitud: s, proxima, enCurso }) => (
                        <li key={s.id} className="flex items-center gap-2.5 px-3 py-2.5">
                          <IconoNecesidad codigo={s.necesidad.codigo} className="h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{s.necesidad.nombre}</p>
                            <p className="truncate text-xs text-slate-500">
                              {enCurso
                                ? "Ahora mismo"
                                : proxima
                                  ? new Date(proxima.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })
                                  : "Sin próxima visita"}
                              {s.servicio?.profesional && ` · ${s.servicio.profesional.nombre}`}
                            </p>
                          </div>
                          {s.plan && !s.plan.fechaFin && <IconInfinity className="h-4 w-4 shrink-0 text-brand-green-600" aria-label="Indefinido" />}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    onClick={() => setOtrosAbiertos((v) => !v)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {otrosAbiertos ? "Ver menos" : `Ver ${contratados.length - 1} servicio${contratados.length > 2 ? "s" : ""} más`}
                    <IconChevronDown className={`h-4 w-4 transition ${otrosAbiertos ? "rotate-180" : ""}`} />
                  </button>
                </div>
              )}
            </div>
          )}

          {personas.map((p) => (
            <Card key={p.id} title={`${p.nombre} ${p.apellidos}`}>
              <p className="text-xs text-slate-400">{p.codigo}</p>
              <p className="mt-1 text-sm text-slate-600">{p.direccion || "Sin dirección registrada"}</p>
            </Card>
          ))}

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
                    <IconoNecesidad codigo={n.codigo} className="h-7 w-7 text-brand" />
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
                    <Avatar foto={s.servicio.profesional.foto} nombre={s.servicio.profesional.nombre} apellidos={s.servicio.profesional.apellidos} className="h-8 w-8" />
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
                      {i.tipo === "SOLICITUD_CANCELACION" && <IconBan className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />}
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
                <IconoNecesidad codigo={n.codigo} className="h-7 w-7 text-brand" />
                <span className="text-sm font-medium text-slate-800">{n.nombre}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === "chat" && <ConversacionesPanel />}

      {tab === "facturacion" && (
        <Card title="Facturación">
          {facturas.length === 0 && <p className="text-sm text-slate-500">Todavía no hay facturas emitidas.</p>}
          <ul className="divide-y divide-slate-100">
            {facturas.map((f) => (
              <li key={f.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {f.persona.nombre} · {f.mes}
                    {/* El número de la factura es lo que se cita al banco o a
                        Hacienda: sin él, la familia no tiene cómo referirse a
                        lo que está pagando. */}
                    <span className="block text-xs font-normal text-slate-500">{referenciaFactura(f)}</span>
                  </p>
                  <EstadoBadge estado={f.estado} />
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    Base {Number(f.importeTotal).toFixed(2)} € + IVA {Number(f.ivaTotal ?? 0).toFixed(2)} € = <strong>{Number(f.totalConIva ?? f.importeTotal).toFixed(2)} € total</strong>
                  </p>
                  {/* Poder verla y guardarla es la mitad de la factura: hasta
                      ahora la familia veía la cifra pero no el documento. */}
                  <button
                    onClick={() => abrirFactura(f.id)}
                    className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <IconFile className="h-3.5 w-3.5" /> Ver la factura
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {facturaAbierta && (
        <Modal title={referenciaFactura(facturaAbierta)} onClose={() => setFacturaAbierta(null)} size="doc">
          <div className="mb-3 flex justify-end print:hidden">
            <button
              onClick={() => window.print()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Imprimir o guardar en PDF
            </button>
          </div>
          <FacturaDocumento factura={facturaAbierta} />
        </Modal>
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

      </div>

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
