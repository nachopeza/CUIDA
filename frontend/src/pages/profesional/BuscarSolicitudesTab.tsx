import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { useRefrescoAutomatico } from "../../lib/refresco.js";
import { Card } from "../../components/Layout.js";
import { SearchBox } from "../../components/SearchBox.js";
import { SubPestanas } from "../../components/SubPestanas.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { IconCheck, IconClock, IconLock, IconPin } from "../../components/icons.js";
import { euros, minutosEntre, porHora } from "../../lib/economia.js";
import type { Desenlace, Servicio } from "../../lib/types.js";

function fecha(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString("es-ES") : null;
}

// Dónde se trabaja. Mientras la solicitud está publicada esto es el municipio
// y, si lo hay, el barrio: con eso se decide si se llega, y es todo lo que
// tiene derecho a saber quien a lo mejor nunca va a ir a esa casa. El portal
// aparece cuando el servicio ya es suyo.
function lugarDe(s: Servicio): string {
  const persona = s.solicitud?.persona;
  if (!persona) return "A concretar";
  if (!persona.identidadReservada && persona.direccion) return persona.direccion;
  const partes = [persona.zona, persona.municipio].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "A concretar";
}

// Cómo se le llama al caso sin decir quién es.
function quienDe(s: Servicio): string {
  const persona = s.solicitud?.persona;
  if (!persona) return "—";
  if (persona.identidadReservada) return persona.iniciales ?? "—";
  return `${persona.nombre} ${persona.apellidos}`.trim();
}

const DESENLACE: Record<Desenlace, { etiqueta: string; explica: string; clase: string }> = {
  ESPERANDO: {
    etiqueta: "Esperando respuesta",
    explica: "Coordinación todavía no ha decidido a quién se lo da.",
    clase: "bg-amber-50 text-amber-700 border-amber-200",
  },
  TE_LO_PROPONEN: {
    etiqueta: "Te lo proponen",
    explica: "Te lo han ofrecido: contéstalo en Hoy, aceptando o diciendo que no te encaja.",
    clase: "bg-brand-50 text-brand-800 border-brand-200",
  },
  TUYO: {
    etiqueta: "Es tuyo",
    explica: "Ya lo tienes confirmado. Las jornadas están en Mis jornadas.",
    clase: "bg-brand-green-50 text-brand-green-700 border-brand-green-200",
  },
  PARA_OTRA_PERSONA: {
    etiqueta: "Se lo han dado a otra persona",
    explica: "Esta vez no ha salido. La candidatura queda registrada.",
    clase: "bg-slate-100 text-slate-600 border-slate-200",
  },
  CANCELADO: {
    etiqueta: "Se ha cancelado",
    explica: "La familia o coordinación lo han retirado.",
    clase: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

// "Debe tener un apartado donde pueda buscar solicitudes de su estilo o
// propuestas" (sección Profesional), y al lado el otro apartado que faltaba: a
// qué se ha apuntado y en qué ha quedado. Marcar "me interesa" y que al
// recargar la página el botón volviera a estar sin marcar era no tener ni una
// cosa ni la otra.
export function BuscarSolicitudesTab() {
  const { token } = useAuth();
  const [disponibles, setDisponibles] = useState<Servicio[]>([]);
  const [mios, setMios] = useState<Servicio[]>([]);
  const [vista, setVista] = useState<"abiertas" | "apuntado">("abiertas");
  const [busqueda, setBusqueda] = useState("");
  // El servicio al que se está apuntando ahora mismo, con lo que quiere decir.
  const [apuntandose, setApuntandose] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const [abiertas, candidaturas] = await Promise.all([
      api.get<Servicio[]>("/servicios/disponibles", token),
      api.get<Servicio[]>("/servicios/mis-intereses", token),
    ]);
    setDisponibles(abiertas);
    setMios(candidaturas);
  }

  useEffect(() => {
    cargar().catch(() => setError("No se han podido cargar las solicitudes."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una solicitud que coordinación acaba de asignar a otra persona no debe
  // seguir ofreciéndose: se pone al día sola.
  useRefrescoAutomatico(cargar);

  async function intentar(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido hacer.");
    } finally {
      setOcupado(false);
    }
  }

  async function proponerse(servicioId: string) {
    await intentar(async () => {
      await api.post(`/servicios/${servicioId}/interes`, { mensaje: mensaje.trim() || undefined }, token);
      setApuntandose(null);
      setMensaje("");
    });
  }

  async function retirar(servicioId: string) {
    await intentar(() => api.delete(`/servicios/${servicioId}/interes`, token));
  }

  const lista = vista === "abiertas" ? disponibles : mios;
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((s) => {
      const texto = `${s.codigo} ${s.solicitud?.necesidad.nombre ?? ""} ${lugarDe(s)} ${s.solicitud?.descripcionLibre ?? ""}`;
      return texto.toLowerCase().includes(q);
    });
  }, [lista, busqueda]);

  // Lo que está esperando respuesta es lo que se mira: el resto ya se sabe.
  const esperando = mios.filter((s) => s.desenlace === "ESPERANDO").length;

  return (
    <div className="space-y-3">
      <SubPestanas
        valor={vista}
        onCambiar={(v) => {
          setVista(v);
          setApuntandose(null);
        }}
        opciones={[
          { clave: "abiertas", etiqueta: "Sin cubrir", cuenta: disponibles.length },
          { clave: "apuntado", etiqueta: "A las que me he apuntado", cuenta: esperando },
        ]}
      />

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <Card>
        {lista.length > 0 && (
          <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por servicio, municipio o descripción…" className="mb-3 w-full sm:max-w-xs" />
        )}

        {vista === "abiertas" && (
          // Que se entienda por qué se ve tan poco de la persona: si no, parece
          // una ficha a medio rellenar y da la sensación de que falta algo.
          <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <IconLock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              Aquí se ve el municipio, los días, las horas y qué hay que hacer. El nombre y la dirección exacta aparecen cuando el servicio es tuyo:
              son datos de una persona mayor y no se reparten entre toda la plantilla.
            </span>
          </p>
        )}

        {filtradas.length === 0 && (
          <p className="py-3 text-center text-sm text-slate-500">
            {vista === "abiertas"
              ? lista.length === 0
                ? "Ahora mismo no hay solicitudes sin cubrir."
                : "Ninguna coincide con lo que buscas."
              : "Todavía no te has apuntado a ninguna solicitud."}
          </p>
        )}

        <div className="space-y-3">
          {filtradas.map((s) => {
            const plan = s.solicitud?.plan;
            const recurrente = s.tipoServicio === "RECURRENTE";
            const indefinido = plan != null && !plan.fechaFin;
            const tarifaPorHora = porHora(s.importeProfesional, minutosEntre(plan?.horaInicio, plan?.horaFin) ?? s.minutosPrevistos);
            const desenlace = s.desenlace ? DESENLACE[s.desenlace] : null;
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      <IconoNecesidad codigo={s.solicitud?.necesidad.codigo} className="mr-1.5 inline h-4 w-4 shrink-0 align-text-bottom" />
                      {s.solicitud?.necesidad.nombre}
                    </p>
                    <p className="text-xs text-slate-400">
                      {s.codigo} · {quienDe(s)} · {recurrente ? "Recurrente" : "Puntual"}
                      {indefinido && " · indefinido"}
                    </p>
                  </div>

                  {/* Lo que se puede hacer con esta solicitud, según en qué haya
                      quedado. En "sin cubrir" no hay desenlace todavía. */}
                  {desenlace ? (
                    <div className="text-right">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium ${desenlace.clase}`}>{desenlace.etiqueta}</span>
                      {s.desenlace === "ESPERANDO" && (
                        <button
                          onClick={() => void retirar(s.id)}
                          disabled={ocupado}
                          className="mt-1 block w-full text-[11px] text-slate-400 underline decoration-dotted hover:text-rose-600 disabled:opacity-50"
                        >
                          Ya no me interesa
                        </button>
                      )}
                    </div>
                  ) : s.meInteresa ? (
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand-green-200 bg-brand-green-50 px-2.5 py-1 text-[11px] font-medium text-brand-green-700">
                        <IconCheck className="h-3 w-3" /> Te has apuntado
                      </span>
                      <button
                        onClick={() => void retirar(s.id)}
                        disabled={ocupado}
                        className="mt-1 block w-full text-[11px] text-slate-400 underline decoration-dotted hover:text-rose-600 disabled:opacity-50"
                      >
                        Ya no me interesa
                      </button>
                    </div>
                  ) : apuntandose === s.id ? null : (
                    <button onClick={() => setApuntandose(s.id)} className="boton-principal-sm">
                      Me interesa
                    </button>
                  )}
                </div>

                {/* Al apuntarse puede decir algo: es lo que lee coordinación al
                    elegir entre varias, y antes se enviaba en blanco siempre. */}
                {apuntandose === s.id && (
                  <div className="mb-2 rounded-lg border border-brand-200 bg-brand-50/60 p-2.5">
                    <label className="block text-xs font-medium text-slate-600">
                      ¿Quieres decirle algo a coordinación? (opcional)
                      <input
                        autoFocus
                        value={mensaje}
                        onChange={(e) => setMensaje(e.target.value)}
                        placeholder="Vivo en el mismo barrio, tengo esos días libres…"
                        className="mt-1 campo"
                      />
                    </label>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => void proponerse(s.id)} disabled={ocupado} className="boton-principal-sm">
                        {ocupado ? "Enviando…" : "Apuntarme"}
                      </button>
                      <button
                        onClick={() => {
                          setApuntandose(null);
                          setMensaje("");
                        }}
                        className="boton-secundario-sm"
                      >
                        Dejarlo
                      </button>
                    </div>
                  </div>
                )}

                {/* Qué ha pasado con la candidatura, en una frase: el badge dice
                    el estado y esto dice qué toca hacer. */}
                {desenlace && (
                  <p className="mb-2 text-xs text-slate-500">
                    {desenlace.explica}
                    {s.meApunteEl && <span className="text-slate-400"> · te apuntaste el {fecha(s.meApunteEl)}</span>}
                  </p>
                )}
                {s.miMensaje && (
                  <p className="mb-2 flex items-start gap-1.5 text-xs italic text-slate-500">
                    <IconClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                    Dijiste: "{s.miMensaje}"
                  </p>
                )}

                {s.solicitud?.descripcionLibre && <p className="mb-2 text-sm text-slate-600">{s.solicitud.descripcionLibre}</p>}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-400">Dónde</dt>
                    <dd className="flex items-center gap-1 text-slate-700">
                      <IconPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {lugarDe(s)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Cuándo</dt>
                    <dd className="text-slate-700">
                      {fecha(plan?.fechaInicio) ?? "A concretar"}
                      {plan?.fechaFin ? ` a ${fecha(plan.fechaFin)}` : indefinido ? " · indefinido" : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Horario</dt>
                    <dd className="text-slate-700">
                      {plan?.horaInicio && plan.horaFin ? `${plan.horaInicio}-${plan.horaFin}` : plan?.franjaHoraria || "A concretar"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Días</dt>
                    <dd className="text-slate-700">{plan?.recurrencia || (recurrente ? "A concretar" : "Puntual")}</dd>
                  </div>
                  {plan?.tareasPrevistas && (
                    <div className="col-span-2 sm:col-span-4">
                      <dt className="text-slate-400">Qué hay que hacer</dt>
                      <dd className="whitespace-pre-line text-slate-700">{plan.tareasPrevistas}</dd>
                    </div>
                  )}
                  <div className="col-span-2 sm:col-span-4">
                    <dt className="text-slate-400">Lo que cobrarías</dt>
                    {/* Ponía "por hora" en los recurrentes y no lo es: el
                        importe es de la jornada. El precio de la hora se saca
                        de ese importe y su duración. */}
                    <dd className="font-medium text-brand-green-700">
                      {s.tarifaTipo === "VOLUNTARIO"
                        ? "Voluntario (sin remuneración)"
                        : s.importeProfesional != null
                          ? `${euros(s.importeProfesional)}${recurrente ? " por jornada" : " por el servicio"}`
                          : "Pendiente de concretar con coordinación"}
                      {tarifaPorHora && <span className="ml-1.5 font-normal text-slate-500">· {tarifaPorHora}</span>}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
