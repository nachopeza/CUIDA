import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Card } from "../components/Layout.js";
import { Novedades } from "../components/Novedades.js";
import { EstadoBadge } from "../components/EstadoBadge.js";
import { Cronometro } from "../components/Cronometro.js";
import { IconAlert, IconCalendar, IconChat, IconClock, IconFlag, IconHome, IconMenu, IconNote, IconPin, IconPlay, IconSearch, IconStop, IconUsers } from "../components/icons.js";
import { IconoNecesidad } from "../lib/necesidadIconos.js";
import { cobroDeJornada, duracion, euros, minutosEntre, minutosFichados, porHora } from "../lib/economia.js";
import { Modal } from "../components/Modal.js";
import { TiempoTrabajadoModal } from "../components/TiempoTrabajadoModal.js";
import { ChatPanel } from "../components/ChatPanel.js";
import { Navegacion, type ItemNav } from "../components/Navegacion.js";
import { MisJornadasTab } from "./profesional/MisJornadasTab.js";
import { BuscarSolicitudesTab } from "./profesional/BuscarSolicitudesTab.js";
import { MiPerfilTab } from "./profesional/MiPerfilTab.js";
import type { Profesional, Servicio, Visita } from "../lib/types.js";

type Tab = "proximos" | "jornadas" | "buscar" | "perfil";

// Misma barra lateral que coordinación: el panel del profesional era una
// fila de pestañas sueltas y no se parecía a nada del resto de la app.
// "Mensajes" se va: el chat vive donde está la persona, no en una pestaña
// aparte que repetía lo mismo.
const NAV: ItemNav[] = [
  { key: "proximos", label: "Hoy", icon: IconHome },
  { key: "jornadas", label: "Mis jornadas", icon: IconClock },
  { key: "buscar", label: "Buscar solicitudes", icon: IconSearch },
  { key: "perfil", label: "Mi perfil", icon: IconUsers },
];
const TAB_LABEL: Record<Tab, string> = {
  proximos: "Hoy",
  jornadas: "Mis jornadas",
  buscar: "Buscar solicitudes",
  perfil: "Mi perfil",
};

const PRIORIDADES = ["BAJA", "MEDIA", "ALTA"] as const;

// Interfaz CUIDA PROFESIONAL (sección 9), rediseñada: lo primero que se ve
// es "qué toca ahora/a continuación", no el chat — el chat pasa a su propia
// pestaña, disimulado, en vez de ser lo más grande de la pantalla.
export function ProfesionalPage() {
  const { token, usuario } = useAuth();
  const [tab, setTab] = useState<Tab>("proximos");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [chatAbierto, setChatAbierto] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<Servicio | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [profesional, setProfesional] = useState<Profesional | null>(null);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [propuestas, setPropuestas] = useState<Servicio[]>([]);
  // La jornada que se está cerrando: cerrar obliga a confirmar el tiempo.
  const [cerrando, setCerrando] = useState<Visita | null>(null);
  const [perfilAbierto, setPerfilAbierto] = useState<string | null>(null);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [incidenciaAbierta, setIncidenciaAbierta] = useState<string | null>(null);
  const [incidenciaForm, setIncidenciaForm] = useState({ descripcion: "", prioridad: "MEDIA" as (typeof PRIORIDADES)[number] });

  async function cargar() {
    if (!usuario?.profesionalId) return;
    const [agenda, servicios, propio] = await Promise.all([
      api.get<Visita[]>(`/profesionales/${usuario.profesionalId}/agenda`, token),
      api.get<Servicio[]>("/servicios", token),
      api.get<Profesional>(`/profesionales/${usuario.profesionalId}`, token),
    ]);
    setVisitas(agenda);
    setPropuestas(servicios.filter((s) => s.estado === "ASIGNADO"));
    setProfesional(propio);
  }

  async function aceptar(servicioId: string) {
    await api.post(`/servicios/${servicioId}/aceptar`, {}, token);
    await cargar();
  }

  async function rechazar() {
    if (!rechazando) return;
    await api.post(`/servicios/${rechazando.id}/rechazar`, { motivo: motivoRechazo.trim() || undefined }, token);
    setRechazando(null);
    setMotivoRechazo("");
    await cargar();
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.profesionalId]);

  async function iniciar(id: string) {
    await api.post(`/visitas/${id}/iniciar`, {}, token);
    await cargar();
  }

  async function finalizar(id: string, datos: { horaInicio: string; horaFin: string; observacion?: string }) {
    await api.post(`/visitas/${id}/finalizar`, datos, token);
    await cargar();
  }

  async function toggleTarea(visitaId: string, tareaId: string, completada: boolean) {
    await api.patch(`/visitas/${visitaId}/tareas`, { tareaId, completada }, token);
    await cargar();
  }

  async function enviarNota(visitaId: string) {
    if (!notaTexto.trim()) return;
    await api.post(`/visitas/${visitaId}/actuaciones`, { descripcion: notaTexto.trim() }, token);
    setNotaTexto("");
    setNotaAbierta(null);
    await cargar();
  }

  async function enviarIncidencia(visitaId: string) {
    if (!incidenciaForm.descripcion.trim()) return;
    await api.post("/incidencias", { visitaId, descripcion: incidenciaForm.descripcion.trim(), prioridad: incidenciaForm.prioridad }, token);
    setIncidenciaForm({ descripcion: "", prioridad: "MEDIA" });
    setIncidenciaAbierta(null);
    await cargar();
  }

  // "Algo que diga Hola Carmen, próximamente tienes tal servicio": la
  // próxima visita sin terminar, la que está en curso ahora mismo tiene
  // prioridad.
  const proximaVisita = useMemo(() => {
    const enCurso = visitas.find((v) => v.estado === "EN_CURSO");
    if (enCurso) return enCurso;
    return visitas
      .filter((v) => ["PROGRAMADA", "CONFIRMADA"].includes(v.estado))
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0];
  }, [visitas]);

  // Hoy es lo que queda por hacer. Lo ya cerrado —entregado a coordinación o
  // verificado— se va a "Mis jornadas": mezclarlo hacía que cada día la lista
  // creciera con trabajo que ya no toca.
  const visitasProximas = visitas.filter((v) => ["PROGRAMADA", "CONFIRMADA", "EN_CURSO"].includes(v.estado));

  // El mes de un vistazo, que es lo que se mira al abrir.
  const mesActual = new Date().toISOString().slice(0, 7);
  const delMes = visitas.filter((v) => v.fecha.slice(0, 7) === mesActual);
  const fichadasDelMes = delMes.filter((v) => v.horaInicioReal && v.horaFinReal);
  const minutosDelMes = fichadasDelMes.reduce((acc, v) => acc + (minutosFichados(v.horaInicioReal, v.horaFinReal) ?? 0), 0);
  const cobroDelMes = fichadasDelMes.reduce((acc, v) => acc + cobroDeJornada(v), 0);
  // Lo que queda por delante este mes, para saber a cuánto se puede llegar.
  const cobroPendienteMes = delMes
    .filter((v) => !v.horaInicioReal && ["PROGRAMADA", "CONFIRMADA"].includes(v.estado))
    .reduce((acc, v) => acc + cobroDeJornada(v), 0);

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <Navegacion
        items={NAV}
        activo={tab}
        onIr={(k) => {
          setTab(k as Tab);
          setMenuAbierto(false);
        }}
        badges={{ proximos: propuestas.length > 0 ? { valor: propuestas.length, tono: "amber" } : undefined }}
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
      />

      <div className="min-w-0 flex-1">
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <button
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        >
          <IconMenu className="h-4 w-4" />
          {TAB_LABEL[tab]}
        </button>
      </div>

      {profesional && tab === "proximos" && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
          <p className="text-base font-semibold text-slate-800">Hola {profesional.nombre}</p>
          {proximaVisita ? (
            <p className="mt-0.5 text-sm text-slate-600">
              {proximaVisita.estado === "EN_CURSO" ? "Ahora mismo: " : "Próximamente: "}
              {proximaVisita.servicio?.solicitud.necesidad.nombre} con {proximaVisita.servicio?.solicitud.persona.nombre}
              {" · "}
              {new Date(proximaVisita.fecha).toLocaleDateString("es-ES")}
              {proximaVisita.horaInicioProg ? ` · ${proximaVisita.horaInicioProg}` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-600">No tienes ninguna visita próxima programada.</p>
          )}
        </div>
      )}

      {/* Lo que llevas trabajado y lo que vas a cobrar, sin ir a otra
          pestaña: es la pregunta con la que se abre la app. */}
      {tab === "proximos" && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs text-slate-500">Este mes</p>
            <p className="text-xl font-semibold leading-tight text-slate-900">{duracion(minutosDelMes)}</p>
            <p className="text-[11px] text-slate-400">{fichadasDelMes.length} jornada{fichadasDelMes.length === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded-lg border border-brand-green-200 bg-brand-green-50 px-3 py-2.5">
            <p className="text-xs text-brand-green-700">Vas a cobrar</p>
            <p className="text-xl font-semibold leading-tight text-brand-green-800">{euros(cobroDelMes)}</p>
            {cobroPendienteMes > 0 && <p className="text-[11px] text-brand-green-700">+{euros(cobroPendienteMes)} por delante</p>}
          </div>
          <button
            onClick={() => setTab("jornadas")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:bg-slate-50"
          >
            <p className="text-xs text-slate-500">Por hacer</p>
            <p className="text-xl font-semibold leading-tight text-slate-900">{visitasProximas.length}</p>
            <p className="text-[11px] text-brand">Ver mis jornadas</p>
          </button>
        </div>
      )}

      {/* Si le mueven la jornada o le cambian el horario, tiene que verlo al
          abrir la app, no sólo si le da a la campana. */}
      {tab === "proximos" && <Novedades />}

      {tab === "buscar" && <BuscarSolicitudesTab />}
      {tab === "perfil" && <MiPerfilTab />}
      {tab === "jornadas" && <MisJornadasTab visitas={visitas} />}

      {tab === "proximos" && (
        <>
          {/* Aceptar a ciegas no es aceptar. Antes solo salía el nombre y un
              botón: ni se veía de qué iba el servicio, ni cuánto duraba, ni
              cuánto se cobraba, ni se podía decir que no. */}
          {propuestas.length > 0 && (
            <Card title={`Te han propuesto ${propuestas.length} servicio${propuestas.length > 1 ? "s" : ""}`}>
              <ul className="space-y-2">
                {propuestas.map((s) => {
                  const plan = s.solicitud?.plan;
                  const minutos = plan ? minutosEntre(plan.horaInicio, plan.horaFin) : null;
                  const cobro = Number(s.importeProfesional ?? 0);
                  return (
                    <li key={s.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium text-slate-800">
                            <IconoNecesidad codigo={s.solicitud?.necesidad.codigo} className="h-4 w-4 shrink-0 text-slate-500" />
                            {s.solicitud?.necesidad.nombre}
                          </p>
                          <p className="text-sm text-slate-600">
                            con {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos}
                          </p>
                        </div>
                        {cobro > 0 && (
                          <div className="shrink-0 text-right">
                            <span className="inline-block rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-brand-green-700">
                              {euros(cobro)}
                              {s.tipoServicio === "RECURRENTE" && <span className="text-xs font-normal text-slate-400">/jornada</span>}
                            </span>
                            {/* A cuánto le sale la hora: es con lo que se
                                decide si compensa. */}
                            {porHora(cobro, minutos ?? s.minutosPrevistos) && (
                              <p className="mt-0.5 text-[11px] text-slate-500">{porHora(cobro, minutos ?? s.minutosPrevistos)}</p>
                            )}
                          </div>
                        )}
                      </div>

                      <dl className="mt-2 space-y-1 text-xs text-slate-600">
                        {plan && (
                          <div className="flex items-center gap-1.5">
                            <IconClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <dd>
                              {plan.horaInicio && plan.horaFin ? `${plan.horaInicio}–${plan.horaFin}` : "Horario a concretar"}
                              {minutos != null && ` · ${duracion(minutos)}`}
                              {plan.recurrencia && ` · ${plan.recurrencia}`}
                            </dd>
                          </div>
                        )}
                        {plan && (
                          <div className="flex items-center gap-1.5">
                            <IconCalendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <dd>
                              Desde el {new Date(plan.fechaInicio).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
                              {plan.fechaFin
                                ? ` hasta el ${new Date(plan.fechaFin).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`
                                : " · indefinido"}
                            </dd>
                          </div>
                        )}
                        {s.solicitud?.persona.direccion && (
                          <div className="flex items-center gap-1.5">
                            <IconPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <dd>{s.solicitud.persona.direccion}</dd>
                          </div>
                        )}
                        {plan?.tareasPrevistas && (
                          <div className="flex items-start gap-1.5">
                            <IconNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <dd className="whitespace-pre-line">{plan.tareasPrevistas}</dd>
                          </div>
                        )}
                        {s.solicitud?.descripcionLibre && <p className="pt-1 italic text-slate-500">"{s.solicitud.descripcionLibre}"</p>}
                      </dl>

                      <div className="mt-3 flex gap-2">
                        <button onClick={() => aceptar(s.id)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">
                          Aceptar
                        </button>
                        <button
                          onClick={() => setRechazando(s)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          No me encaja
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {visitasProximas.length === 0 && <p className="text-sm text-slate-500">No tienes jornadas próximas.</p>}

          {visitasProximas.map((v) => {
            const persona = v.servicio?.solicitud.persona;
            const cerrada = v.estado === "FINALIZADA" || v.estado === "REVISADA";
            const incidenciaAbiertaEnVisita = v.incidencias?.some((i) => !["RESUELTA", "CERRADA"].includes(i.estado));
            return (
              <Card key={v.id}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {persona?.nombre} {persona?.apellidos} — {v.servicio?.solicitud.necesidad.nombre}
                    </p>
                    <p className="text-xs text-slate-400">
                      {v.codigo} · {new Date(v.fecha).toLocaleDateString("es-ES")} {v.horaInicioProg ? `· ${v.horaInicioProg}-${v.horaFinProg}` : ""}
                    </p>
                    {persona?.direccion && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <IconPin className="h-3.5 w-3.5 shrink-0" />
                      {persona.direccion}
                    </p>
                  )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Cronometro inicio={v.horaInicioReal} fin={v.horaFinReal} />
                    {incidenciaAbiertaEnVisita && (
                      <span className="text-amber-600" title="Incidencia abierta">
                        <IconAlert className="inline h-3.5 w-3.5 align-text-bottom" />
                      </span>
                    )}
                    <EstadoBadge estado={v.estado} />
                  </div>
                </div>

                {persona && (
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => setPerfilAbierto(perfilAbierto === v.id ? null : v.id)}
                      className="text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700"
                    >
                      {perfilAbierto === v.id ? "Ocultar perfil" : "Ver perfil completo"}
                    </button>
                    {!cerrada && (
                      <button
                        onClick={() => setNotaAbierta(notaAbierta === v.id ? null : v.id)}
                        className="text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700"
                      >
                        <IconNote className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                    Añadir nota
                      </button>
                    )}
                    <button
                      onClick={() => setIncidenciaAbierta(incidenciaAbierta === v.id ? null : v.id)}
                      className="text-xs font-medium text-rose-500 underline decoration-dotted hover:text-rose-700"
                    >
                      <IconFlag className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                    Reportar incidencia
                    </button>
                    {/* El chat, donde está la persona con la que se habla, en
                        vez de en una pestaña suelta que repetía la lista. Es
                        un botón y no otro enlace subrayado: hablar con la
                        familia es de lo que más se hace desde aquí. */}
                    {persona && usuario?.profesionalId && (
                      <button
                        onClick={() => setChatAbierto(chatAbierto === v.id ? null : v.id)}
                        className={`ml-auto flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                          chatAbierto === v.id
                            ? "border-brand bg-brand text-white"
                            : "border-brand text-brand hover:bg-brand hover:text-white"
                        }`}
                      >
                        <IconChat className="h-3.5 w-3.5" />
                        {chatAbierto === v.id ? "Cerrar chat" : "Chat con la familia"}
                      </button>
                    )}
                  </div>
                )}

                {chatAbierto === v.id && persona && usuario?.profesionalId && (
                  <div className="mb-3 rounded-lg border border-slate-200">
                    <ChatPanel profesionalId={usuario.profesionalId} personaId={persona.id} compacto />
                  </div>
                )}

                {perfilAbierto === v.id && persona && (
                  <dl className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-400">Teléfono</dt>
                      <dd>{persona.telefono || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Preferencias</dt>
                      <dd>{persona.preferencias || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Medicación</dt>
                      <dd>{persona.medicacion || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Médico / centro de referencia</dt>
                      <dd>{persona.medico || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400">Contactos de emergencia</dt>
                      <dd>{persona.contactos || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400">Recomendaciones</dt>
                      <dd>{persona.recomendaciones || "—"}</dd>
                    </div>
                  </dl>
                )}

                {notaAbierta === v.id && (
                  <div className="mb-3 flex gap-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Escribe una nota sobre esta visita…"
                      value={notaTexto}
                      onChange={(e) => setNotaTexto(e.target.value)}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <button onClick={() => enviarNota(v.id)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">
                      Guardar
                    </button>
                  </div>
                )}

                {incidenciaAbierta === v.id && (
                  <div className="mb-3 space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <textarea
                      autoFocus
                      placeholder="¿Qué ha pasado?"
                      value={incidenciaForm.descripcion}
                      onChange={(e) => setIncidenciaForm((f) => ({ ...f, descripcion: e.target.value }))}
                      rows={2}
                      className="w-full rounded-md border border-rose-200 px-3 py-1.5 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={incidenciaForm.prioridad}
                        onChange={(e) => setIncidenciaForm((f) => ({ ...f, prioridad: e.target.value as (typeof PRIORIDADES)[number] }))}
                        className="rounded-md border border-rose-200 px-2 py-1.5 text-xs"
                      >
                        {PRIORIDADES.map((p) => (
                          <option key={p} value={p}>
                            Prioridad {p.toLowerCase()}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => enviarIncidencia(v.id)} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700">
                        Enviar a coordinación
                      </button>
                    </div>
                  </div>
                )}

                {v.actuaciones && v.actuaciones.length > 0 && (
                  <ul className="mb-3 space-y-1 rounded-lg bg-slate-50 p-2">
                    {v.actuaciones.map((a) => (
                      <li key={a.id} className="text-xs text-slate-600">
                        <IconNote className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-slate-400" />
                        {a.descripcion}
                      </li>
                    ))}
                  </ul>
                )}

                {v.tareas.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {v.tareas.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={t.completada}
                          disabled={v.estado !== "EN_CURSO"}
                          onChange={(e) => toggleTarea(v.id, t.id, e.target.checked)}
                        />
                        <span className={t.completada ? "text-slate-400 line-through" : ""}>{t.descripcion}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2">
                  {(v.estado === "PROGRAMADA" || v.estado === "CONFIRMADA") && (
                    <button onClick={() => iniciar(v.id)} className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">
                      <IconPlay className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
                      He llegado — empezar a contar
                    </button>
                  )}
                  {v.estado === "EN_CURSO" && (
                    <button
                      onClick={() => setCerrando(v)}
                      className="rounded-md bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-green-800"
                    >
                      <IconStop className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
                      He terminado — confirmar el tiempo
                    </button>
                  )}
                  {v.estado === "FINALIZADA" && <span className="text-xs text-slate-400">Enviada a coordinación para verificar</span>}
                  {v.estado === "REVISADA" && <span className="text-xs text-brand-green-600">Verificada y archivada</span>}
                </div>
              </Card>
            );
          })}
        </>
      )}

      {/* Cerrar la tarea pasa por confirmar el tiempo. La hora de fin que se
          propone es la de ahora mismo, porque es cuando se está cerrando. */}
      </div>

      {rechazando && (
        <Modal title="No me encaja" onClose={() => setRechazando(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {rechazando.solicitud?.necesidad.nombre} con {rechazando.solicitud?.persona.nombre}. Volverá a coordinación para buscar a otra persona.
            </p>
            <label className="block text-xs font-medium text-slate-500">
              ¿Por qué? (opcional, pero ayuda)
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                rows={2}
                placeholder="Me pilla lejos, ese día ya tengo otro servicio…"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRechazando(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Volver
              </button>
              <button onClick={rechazar} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
                Rechazar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {cerrando && (
        <TiempoTrabajadoModal
          titulo="¿Cuánto ha durado?"
          explicacion="Se cerrará la tarea y pasará a coordinación para que la verifique. Este tiempo es el que se factura."
          etiquetaConfirmar="Cerrar la tarea"
          inicioSugerido={cerrando.horaInicioReal}
          finSugerido={new Date().toISOString()}
          horaInicioProg={cerrando.horaInicioProg}
          horaFinProg={cerrando.horaFinProg}
          conObservacion
          onConfirmar={(datos) => finalizar(cerrando.id, datos)}
          onClose={() => setCerrando(null)}
        />
      )}
    </div>
  );
}
