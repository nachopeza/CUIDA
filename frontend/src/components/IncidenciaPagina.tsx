import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { useFichas } from "../lib/fichas.js";
import { useRefrescoAutomatico } from "../lib/refresco.js";
import { diaDe } from "../lib/fechas.js";
import { infoMotivo } from "../lib/incidencias.js";
import { compararConAcordado, duracion, horaDe, minutosEntre, minutosFichados } from "../lib/economia.js";
import type { Candidato, CuentaResumen, EstadoHistorialEntry, Incidencia, IncidenciaServicio } from "../lib/types.js";
import { Avatar } from "./Avatar.js";
import { EstadoBadge } from "./EstadoBadge.js";
import { AccionesRapidas, Bloque, Dato, Etiqueta, FichaCabecera, Pestanas, RejillaFicha } from "./ficha.js";
import { IconArrowRight, IconBan, IconBriefcase, IconCheck, IconCheckCircle, IconClipboard, IconClock, IconMail, IconNote, IconPhone, IconPin, IconRefresh, IconUsers } from "./icons.js";

// ---------------------------------------------------------------------------
// La página de una incidencia
//
// Una incidencia es un caso que se trabaja: se lee qué ha pasado, se mira de
// quién es, se llama, se busca a alguien que cubra y se cierra. Antes era una
// ventana larga donde todo iba en columna; ahora tiene la misma estructura que
// el resto de fichas: el caso arriba, lo que se hace con él a la derecha.
// ---------------------------------------------------------------------------

// Espejo de TRANSICIONES_INCIDENCIA del backend (backend/src/services/estados.ts).
const TRANSICIONES_INCIDENCIA: Record<string, string[]> = {
  NUEVA: ["EN_REVISION"],
  EN_REVISION: ["ASIGNADA"],
  ASIGNADA: ["EN_RESOLUCION"],
  EN_RESOLUCION: ["RESUELTA"],
  RESUELTA: ["CERRADA"],
  CERRADA: [],
};

const ROL_LEGIBLE: Record<string, string> = {
  PERSONA: "persona atendida",
  FAMILIAR: "familiar",
  PROFESIONAL: "profesional",
  COORDINADOR: "coordinación",
  ORGANIZACION: "coordinación",
  ADMIN: "coordinación",
  SUPERADMIN: "coordinación",
};

const PRIORIDAD: Record<string, string> = {
  ALTA: "bg-rose-100 text-rose-700",
  MEDIA: "bg-amber-100 text-amber-700",
  BAJA: "bg-slate-100 text-slate-600",
};

type Pestana = "resumen" | "reemplazo" | "historial";

function siguienteDia(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return diaDe(d);
}

function fechaCorta(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const legible = (e: string) => e.replace(/_/g, " ").toLowerCase();

export function IncidenciaPagina({
  incidenciaId,
  onVolver,
  onChanged,
  onAbrirSolicitud,
  etiquetaVolver = "Volver a incidencias",
}: {
  incidenciaId: string;
  onVolver: () => void;
  onChanged: () => void;
  onAbrirSolicitud: (solicitudId: string) => void;
  etiquetaVolver?: string;
}) {
  const { token } = useAuth();
  const { abrirPersona, abrirProfesional } = useFichas();
  const [i, setI] = useState<Incidencia | null>(null);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [coordinadores, setCoordinadores] = useState<CuentaResumen[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [nota, setNota] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [sustitutoId, setSustitutoId] = useState("");
  const [recuperar, setRecuperar] = useState(false);
  const [fechaRecuperacion, setFechaRecuperacion] = useState("");
  const [notaReemplazo, setNotaReemplazo] = useState("");

  async function cargar() {
    try {
      setI(await api.get<Incidencia>(`/incidencias/${incidenciaId}`, token));
      setNoEncontrada(false);
    } catch {
      setNoEncontrada(true);
    }
  }

  useEffect(() => {
    setI(null);
    setPestana("resumen");
    setError(null);
    void cargar();
    api.get<CuentaResumen[]>("/cuenta/coordinadores", token).then(setCoordinadores).catch(() => setCoordinadores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidenciaId]);

  useRefrescoAutomatico(cargar, 30000);

  // Quién puede cubrir el servicio, con el mismo criterio que al asignarlo: los
  // papeles, la disponibilidad y lo que ya tiene en la agenda esos días.
  const servicioId = i?.servicio?.id ?? i?.visita?.servicio?.id ?? i?.servicioId;
  useEffect(() => {
    if (!servicioId) return;
    const ventana = i?.cubrirDesde && i?.cubrirHasta ? `?desde=${encodeURIComponent(i.cubrirDesde)}&hasta=${encodeURIComponent(i.cubrirHasta)}` : "";
    api
      .get<Candidato[]>(`/servicios/${servicioId}/candidatos${ventana}`, token)
      .then(setCandidatos)
      .catch(() => setCandidatos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicioId, i?.cubrirDesde, i?.cubrirHasta]);

  if (noEncontrada) {
    return (
      <div className="tarjeta p-6 text-sm text-slate-600">
        <button onClick={onVolver} className="mb-3 text-sm text-slate-500 hover:text-slate-800">
          ← {etiquetaVolver}
        </button>
        <p>Esta incidencia ya no existe.</p>
      </div>
    );
  }
  if (!i) return <p className="p-6 text-sm text-slate-400">Cargando…</p>;

  const esCancelacion = i.tipo === "SOLICITUD_CANCELACION";
  const abierta = !["RESUELTA", "CERRADA"].includes(i.estado);
  const siguientes = TRANSICIONES_INCIDENCIA[i.estado] ?? [];
  const motivo = infoMotivo(i.motivo);

  const servicio: IncidenciaServicio | null | undefined = i.servicio ?? i.visita?.servicio;
  const solicitud = servicio?.solicitud;
  const persona = solicitud?.persona;
  const profesional = i.visita?.profesional ?? servicio?.profesional;
  const profesionalActual = servicio?.profesional ?? i.visita?.profesional;
  const disponibles = candidatos.filter((c) => c.id !== profesionalActual?.id && !c.impide);
  const puedeReemplazar = !esCancelacion && !!i.servicioId && i.estado !== "CERRADA";
  const soloEstosDias = !!(i.cubrirDesde && i.cubrirHasta);
  const comoDia = (f: string) => new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  const plan = solicitud?.plan;
  const visita = i.visita;
  const fichados = visita ? minutosFichados(visita.horaInicioReal, visita.horaFinReal) : null;
  const previstos = visita ? (minutosEntre(visita.horaInicioProg, visita.horaFinProg) ?? servicio?.minutosPrevistos ?? null) : null;
  const desvio = fichados != null && previstos != null ? compararConAcordado(fichados, previstos) : null;
  const autor = i.creadoPor;
  const autorNombre = autor?.nombre ?? autor?.email ?? null;
  const autorRol = autor?.rol ? (ROL_LEGIBLE[autor.rol] ?? autor.rol.toLowerCase()) : null;
  const historial: EstadoHistorialEntry[] = [...(i.estadoHistorial ?? [])].reverse();
  const responsableId = i.responsable ? (coordinadores.find((c) => c.email === i.responsable?.email)?.id ?? "") : "";

  // Todo lo que pide algo al servidor pasa por aquí: si falla, se lee el motivo.
  async function intentar(accion: () => Promise<void>, hecho?: string) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      if (hecho) setAviso(hecho);
      await cargar();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido hacer.");
    } finally {
      setOcupado(false);
    }
  }

  const cambiarEstado = (estado: string) => intentar(() => api.post(`/incidencias/${incidenciaId}/estado`, { estado }, token), `Pasa a ${legible(estado)}.`);
  const asignar = (id: string) => intentar(() => api.post(`/incidencias/${incidenciaId}/asignar`, { responsableUsuarioId: id || null }, token), id ? "Asignada." : "Sin asignar.");
  const cerrar = () => intentar(() => api.post(`/incidencias/${incidenciaId}/cerrar`, {}, token), "Incidencia cerrada y archivada.");
  const enviarNota = () =>
    intentar(async () => {
      await api.post(`/incidencias/${incidenciaId}/nota`, { nota: nota.trim() }, token);
      setNota("");
    }, "Anotación añadida.");
  const confirmarCancelacion = () =>
    intentar(() => api.post(`/servicios/${servicioId}/confirmar-cancelacion`, {}, token), "Cancelación confirmada: el servicio queda cancelado y se ha avisado a la familia y a la profesional.");
  const rechazarCancelacion = () => intentar(() => api.post(`/servicios/${servicioId}/rechazar-cancelacion`, {}, token), "El servicio continúa.");
  const aplicarReemplazo = () =>
    intentar(async () => {
      const r = await api.post<{ resumen: string }>(
        `/incidencias/${incidenciaId}/reemplazo`,
        {
          profesionalId: sustitutoId,
          recuperarJornada: recuperar,
          fechaRecuperacion: recuperar ? fechaRecuperacion || (visita ? siguienteDia(visita.fecha) : undefined) : undefined,
          nota: notaReemplazo.trim() || undefined,
        },
        token,
      );
      setAviso(r.resumen);
      setSustitutoId("");
      setNotaReemplazo("");
      setRecuperar(false);
      setPestana("resumen");
    });

  const pestanas: { clave: Pestana; etiqueta: string }[] = [
    { clave: "resumen", etiqueta: "Resumen" },
    ...(puedeReemplazar ? [{ clave: "reemplazo" as const, etiqueta: "Buscar reemplazo" }] : []),
    { clave: "historial", etiqueta: "Historial y notas" },
  ];

  return (
    <div className="space-y-4">
      <FichaCabecera
        volver={etiquetaVolver}
        onVolver={onVolver}
        titulo={`${esCancelacion ? "Petición de cancelación" : "Incidencia"} ${i.codigo}`}
        etiquetas={
          <>
            <EstadoBadge estado={i.estado} />
            <span className={`pastilla ${PRIORIDAD[i.prioridad] ?? PRIORIDAD.BAJA}`}>Prioridad {i.prioridad.toLowerCase()}</span>
          </>
        }
        linea={
          <>
            {autorNombre ? `Abierta por ${autorNombre}${autorRol ? ` (${autorRol})` : ""}` : "No consta quién la abrió"}
            {i.createdAt && ` · ${fechaHora(i.createdAt)}`}
          </>
        }
        acciones={
          abierta && !esCancelacion ? (
            <button onClick={() => void cerrar()} disabled={ocupado} className="boton-principal">
              <IconCheckCircle className="h-4 w-4" /> Cerrar y archivar
            </button>
          ) : undefined
        }
        menu={[
          ...siguientes.filter(() => !esCancelacion).map((e) => ({ etiqueta: `Pasar a ${legible(e)}`, Icono: IconArrowRight, alPulsar: () => void cambiarEstado(e) })),
          ...(solicitud?.id ? [{ etiqueta: "Abrir el servicio", Icono: IconClipboard, alPulsar: () => onAbrirSolicitud(solicitud.id!) }] : []),
        ]}
      />

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 px-4 py-2.5 text-sm text-brand-green-800" role="status">
          <span className="min-w-0">{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-brand-green-700 hover:underline">
            Cerrar
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">
          <span className="min-w-0">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      {/* La familia pide cancelar: lo único que hay que hacer es decidir, así que
          la decisión va arriba, con lo que provoca cada opción. */}
      {esCancelacion && abierta && servicioId && (
        <div className="tarjeta flex flex-wrap items-center justify-between gap-3 !border-amber-200 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">La familia pide cancelar el servicio</p>
            <p className="text-sm text-slate-500">Confírmalo antes con la persona o su familia. Si se cancela, sus jornadas sin empezar salen de la agenda y se avisa a todos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void rechazarCancelacion()} disabled={ocupado} className="boton-secundario">
              Mantener el servicio
            </button>
            <button onClick={() => void confirmarCancelacion()} disabled={ocupado} className="boton-peligro">
              <IconBan className="h-4 w-4" /> Confirmar cancelación
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="tarjeta flex items-start gap-4 p-4">
          {persona ? (
            <>
              <Avatar nombre={persona.nombre} apellidos={persona.apellidos} className="h-14 w-14 !text-sm" />
              <div className="min-w-0 flex-1">
                <Etiqueta>Persona usuaria</Etiqueta>
                <p className="truncate text-base font-semibold text-slate-800">
                  {persona.nombre} {persona.apellidos}
                </p>
                <p className="text-xs text-slate-400">{persona.codigo}</p>
                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  {persona.telefono && (
                    <p className="flex items-center gap-2">
                      <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {persona.telefono}
                    </p>
                  )}
                  {(persona.direccion || persona.municipio) && (
                    <p className="flex items-start gap-2">
                      <IconPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="min-w-0">{persona.direccion ?? persona.municipio}</span>
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => abrirPersona(persona.id)} className="boton-secundario-sm shrink-0">
                Ver perfil
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-400">Sin persona asociada.</p>
          )}
        </div>

        <div className="tarjeta flex items-start gap-4 p-4">
          {profesional ? (
            <>
              <Avatar foto={profesional.foto} nombre={profesional.nombre} apellidos={profesional.apellidos} className="h-14 w-14 !text-sm" />
              <div className="min-w-0 flex-1">
                <Etiqueta>Profesional asignada</Etiqueta>
                <p className="truncate text-base font-semibold text-slate-800">
                  {profesional.nombre} {profesional.apellidos}
                </p>
                <p className="text-xs text-slate-400">{profesional.codigo}</p>
                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  {profesional.telefono && (
                    <p className="flex items-center gap-2">
                      <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {profesional.telefono}
                    </p>
                  )}
                  {profesional.usuario?.email && (
                    <p className="flex items-center gap-2">
                      <IconMail className="h-3.5 w-3.5 text-slate-400" /> {profesional.usuario.email}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => abrirProfesional(profesional.id)} className="boton-secundario-sm shrink-0">
                Ver perfil
              </button>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <IconUsers className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <Etiqueta>Profesional asignada</Etiqueta>
                <p className="text-base font-semibold text-slate-800">Sin cubrir</p>
              </div>
              {puedeReemplazar && (
                <button onClick={() => setPestana("reemplazo")} className="boton-verde-sm shrink-0">
                  Buscar a alguien
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="tarjeta p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Dato etiqueta="Motivo">
            <span className="inline-flex items-center gap-1.5">
              <motivo.Icono className="h-4 w-4 text-slate-400" /> {motivo.etiqueta}
            </span>
          </Dato>
          <Dato etiqueta="Servicio">{servicio ? `${servicio.codigo}${solicitud ? ` · ${solicitud.necesidad.nombre}` : ""}` : "—"}</Dato>
          <Dato etiqueta="Horario">{plan ? (plan.horaInicio && plan.horaFin ? `${plan.horaInicio}–${plan.horaFin}` : (plan.franjaHoraria ?? "—")) : "—"}</Dato>
          <Dato etiqueta="Asignada a">{i.responsable ? (i.responsable.nombre ?? i.responsable.email) : <span className="text-amber-700">Sin asignar</span>}</Dato>
        </div>
      </div>

      <RejillaFicha>
        <div className="min-w-0 space-y-4">
          <Pestanas valor={pestana} onCambiar={setPestana} opciones={pestanas} />

          {pestana === "resumen" && (
            <>
              <Bloque titulo="Qué ha pasado">
                <p className="whitespace-pre-line text-sm text-slate-700">{i.descripcion}</p>
                {soloEstosDias && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Hay que cubrir del {comoDia(i.cubrirDesde!)} al {comoDia(i.cubrirHasta!)}.
                  </p>
                )}
              </Bloque>

              {visita && (
                <Bloque titulo={`Jornada afectada · ${visita.codigo}`}>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <Dato etiqueta="Día">{fechaCorta(visita.fecha)}</Dato>
                    <Dato etiqueta="Previsto">{visita.horaInicioProg && visita.horaFinProg ? `${visita.horaInicioProg}–${visita.horaFinProg}` : "—"}</Dato>
                    <Dato etiqueta="Fichado">{fichados != null ? `${horaDe(visita.horaInicioReal)}–${horaDe(visita.horaFinReal)}` : <span className="text-amber-700">Sin fichaje</span>}</Dato>
                    <Dato etiqueta="Diferencia">
                      {desvio ? (
                        <span className={desvio.desvio === "exacto" ? "" : desvio.desvio === "de_mas" ? "text-amber-600" : "text-rose-600"}>
                          {desvio.desvio === "exacto" ? "Lo acordado" : `${desvio.diferencia > 0 ? "+" : ""}${duracion(desvio.diferencia)}`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Dato>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <IconClock className="h-3.5 w-3.5" /> Estado de la jornada: <EstadoBadge estado={visita.estado} />
                  </p>
                </Bloque>
              )}

              <Bloque titulo="Anotaciones" accion={<button onClick={() => setPestana("historial")} className="text-xs font-medium text-brand hover:underline">Ver todo</button>}>
                <div className="flex flex-wrap gap-2">
                  <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué se ha hablado, qué falta…" className="campo min-w-[14rem] flex-1" />
                  <button onClick={() => void enviarNota()} disabled={ocupado || !nota.trim()} className="boton-principal">
                    Añadir
                  </button>
                </div>
                <Linea entradas={historial.slice(0, 3)} />
              </Bloque>
            </>
          )}

          {pestana === "reemplazo" && puedeReemplazar && (
            <Bloque titulo="Buscar reemplazo">
              <p className="mb-4 text-sm text-slate-600">
                {soloEstosDias ? (
                  <>
                    Cubre <span className="font-medium text-slate-800">del {comoDia(i.cubrirDesde!)} al {comoDia(i.cubrirHasta!)}</span>, los días que{" "}
                    {profesionalActual ? profesionalActual.nombre : "quien lo lleva"} no puede. El servicio sigue siendo suyo y vuelve a él en cuanto se reincorpore.
                  </>
                ) : profesionalActual ? (
                  <>
                    Pasa el servicio de{" "}
                    <span className="font-medium text-slate-800">
                      {profesionalActual.nombre} {profesionalActual.apellidos}
                    </span>{" "}
                    a otra persona, de forma definitiva. Las jornadas que aún no han empezado pasan al sustituto; las ya trabajadas siguen siendo de quien las hizo.
                  </>
                ) : (
                  "El servicio está sin cubrir. Elige quién lo atiende a partir de ahora."
                )}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500 sm:col-span-2">
                  Quién va en su lugar
                  <select value={sustitutoId} onChange={(e) => setSustitutoId(e.target.value)} className="campo mt-0.5">
                    <option value="">Elige un profesional…</option>
                    {candidatos
                      .filter((c) => c.id !== profesionalActual?.id)
                      .map((c) => (
                        <option key={c.id} value={c.id} disabled={c.impide}>
                          {c.nombre} {c.apellidos}
                          {c.motivo === "Le encaja" ? (c.zona ? ` · ${c.zona}` : "") : ` · ${c.motivo}`}
                        </option>
                      ))}
                  </select>
                </label>
                {candidatos.length > 0 && disponibles.length === 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
                    Ahora mismo no hay nadie que pueda cubrirlo: o les faltan papeles, o no trabajan esos días, o ya están ocupados a esa hora. Habla con la familia para mover el
                    horario, o da de alta a alguien más.
                  </p>
                )}
                {visita && (
                  <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={recuperar} onChange={(e) => setRecuperar(e.target.checked)} className="h-4 w-4" />
                      Recuperar la jornada perdida otro día
                    </label>
                    {recuperar && (
                      <label className="mt-2 block text-xs text-slate-500">
                        Cuándo se recupera
                        <input type="date" value={fechaRecuperacion || siguienteDia(visita.fecha)} onChange={(e) => setFechaRecuperacion(e.target.value)} className="campo mt-0.5" />
                        <span className="mt-1 block">Se crea una jornada nueva a la misma hora ({visita.horaInicioProg ?? "?"}–{visita.horaFinProg ?? "?"}).</span>
                      </label>
                    )}
                  </div>
                )}
                <label className="text-xs text-slate-500 sm:col-span-2">
                  Nota para el historial
                  <input value={notaReemplazo} onChange={(e) => setNotaReemplazo(e.target.value)} placeholder="Opcional: qué se ha hablado con la familia…" maxLength={500} className="campo mt-0.5" />
                </label>
                <div className="flex justify-end sm:col-span-2">
                  <button onClick={() => void aplicarReemplazo()} disabled={ocupado || !sustitutoId} className="boton-principal">
                    <IconRefresh className="h-4 w-4" /> {ocupado ? "Aplicando…" : "Aplicar el reemplazo"}
                  </button>
                </div>
              </div>
            </Bloque>
          )}

          {pestana === "historial" && (
            <Bloque titulo="Historial y notas">
              <div className="mb-4 flex flex-wrap gap-2">
                <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe una anotación…" className="campo min-w-[14rem] flex-1" />
                <button onClick={() => void enviarNota()} disabled={ocupado || !nota.trim()} className="boton-principal">
                  Añadir
                </button>
              </div>
              <Linea entradas={historial} />
            </Bloque>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          {!esCancelacion && (
            <Bloque titulo="Gestión">
              <div className="space-y-3">
                <label className="block text-xs text-slate-500">
                  Estado
                  <select
                    value=""
                    onChange={(e) => e.target.value && void cambiarEstado(e.target.value)}
                    disabled={siguientes.length === 0 || ocupado}
                    className="campo mt-0.5 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">
                      {legible(i.estado)}
                      {siguientes.length === 0 ? " · sin más pasos" : " · pasar a…"}
                    </option>
                    {siguientes.map((e) => (
                      <option key={e} value={e}>
                        {legible(e)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  Asignada a
                  <select value={responsableId} onChange={(e) => void asignar(e.target.value)} disabled={ocupado} className="campo mt-0.5">
                    <option value="">Sin asignar</option>
                    {coordinadores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre ?? c.email}
                      </option>
                    ))}
                  </select>
                </label>
                {abierta && (
                  <button onClick={() => void cerrar()} disabled={ocupado} className="boton-secundario w-full">
                    <IconCheck className="h-4 w-4" /> Cerrar y archivar
                  </button>
                )}
              </div>
            </Bloque>
          )}

          <AccionesRapidas
            acciones={[
              { etiqueta: "Abrir el servicio", Icono: IconClipboard, alPulsar: () => solicitud?.id && onAbrirSolicitud(solicitud.id), oculto: !solicitud?.id },
              { etiqueta: "Buscar reemplazo", Icono: IconRefresh, alPulsar: () => setPestana("reemplazo"), oculto: !puedeReemplazar },
              { etiqueta: "Añadir anotación", Icono: IconNote, alPulsar: () => setPestana("historial") },
              { etiqueta: "Ver a la persona", Icono: IconUsers, alPulsar: () => persona && abrirPersona(persona.id), oculto: !persona },
              { etiqueta: "Ver a la profesional", Icono: IconBriefcase, alPulsar: () => profesional && abrirProfesional(profesional.id), oculto: !profesional },
            ]}
          />

          <Bloque titulo="Última actividad">
            <Linea entradas={historial.slice(0, 4)} />
          </Bloque>
        </aside>
      </RejillaFicha>
    </div>
  );
}

function Linea({ entradas }: { entradas: EstadoHistorialEntry[] }) {
  if (entradas.length === 0) return <p className="mt-3 text-sm text-slate-400">Sin movimientos todavía.</p>;
  return (
    <ul className="mt-3 space-y-3">
      {entradas.map((h) => (
        <li key={h.id} className="border-l-2 border-slate-200 pl-3 text-sm">
          {h.estadoAnterior && h.estadoAnterior !== h.estadoNuevo ? (
            <p className="text-slate-800">
              <span className="text-slate-400">{legible(h.estadoAnterior)} → </span>
              <span className="font-medium">{legible(h.estadoNuevo)}</span>
            </p>
          ) : null}
          {h.motivo && <p className={h.estadoAnterior !== h.estadoNuevo ? "text-xs text-slate-500" : "text-slate-700"}>{h.motivo}</p>}
          <p className="text-xs text-slate-400">{fechaHora(h.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}
