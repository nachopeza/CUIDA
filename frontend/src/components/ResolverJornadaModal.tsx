import { useState } from "react";
import { Modal } from "./Modal.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { IconAlert, IconCheck, IconClock } from "./icons.js";

// ---------------------------------------------------------------------------
// La jornada que no arrancó
//
// Una jornada que debía empezar hace dos horas y sigue en "programada" salta
// como crítica en la bandeja. Hasta ahora "Resolver ahora" abría la ficha de
// la solicitud y ahí no había nada con lo que resolver: cambiar el estado a
// mano no ficha ninguna hora, así que la jornada se quedaba sin horas, sin
// poder cobrarse ni pagarse, y volvía a salir en la bandeja al día siguiente.
//
// Lo que hace falta no es un desplegable de estados: es la pregunta que Laura
// hace por teléfono —"¿qué ha pasado?"— con las cinco respuestas posibles y lo
// que cuesta cada una. Porque no cuestan lo mismo, y esa es justamente la
// decisión: si nadie fue, la familia no paga nada; si la persona no estaba, el
// profesional sí se desplazó y algo se le paga.
// ---------------------------------------------------------------------------

type Salida = "FICHAR" | "CAMINO" | "FALTA_PROFESIONAL" | "NO_PRESENTADO" | "CANCELADA";

interface Opcion {
  clave: Salida;
  titulo: string;
  cuando: string;
  // Qué pasa con el dinero. Es lo que convierte esto en una decisión y no en
  // un trámite, así que va escrito en la propia opción y no en una ayuda.
  consecuencia: string;
  tono: "verde" | "ambar" | "rojo";
}

const OPCIONES: Opcion[] = [
  {
    clave: "FICHAR",
    titulo: "Sí fue, se olvidó de fichar",
    cuando: "Lo más habitual. Hablas con ella, te dice las horas y las pones tú.",
    consecuencia: "La jornada queda hecha: se cobra y se paga con normalidad.",
    tono: "verde",
  },
  {
    clave: "CAMINO",
    titulo: "Va de camino o ha entrado tarde",
    cuando: "Todavía va a hacerse. Sólo quieres dejar constancia de por qué llega tarde.",
    consecuencia: "No cambia nada: la jornada sigue abierta y se ficha como siempre.",
    tono: "ambar",
  },
  {
    clave: "FALTA_PROFESIONAL",
    titulo: "No fue nadie",
    cuando: "La persona se ha quedado esperando en casa.",
    consecuencia: "Ni se cobra ni se paga, y se abre incidencia de prioridad alta.",
    tono: "rojo",
  },
  {
    clave: "NO_PRESENTADO",
    titulo: "Fue, pero la persona no estaba",
    cuando: "Se desplazó y no pudo entrar.",
    consecuencia: "Se aplica el porcentaje de la casa: la familia paga parte y la profesional cobra parte.",
    tono: "ambar",
  },
  {
    clave: "CANCELADA",
    titulo: "Se canceló",
    cuando: "Alguien avisó de que no hacía falta.",
    consecuencia: "Se aplica el porcentaje de cancelación según el aviso.",
    tono: "ambar",
  },
];

const TONOS: Record<Opcion["tono"], string> = {
  verde: "border-brand-green-200 bg-brand-green-50",
  ambar: "border-amber-200 bg-amber-50",
  rojo: "border-rose-200 bg-rose-50",
};

export function ResolverJornadaModal({
  visitaId,
  codigo,
  persona,
  profesional,
  horaInicioProg,
  horaFinProg,
  onClose,
  onResuelta,
}: {
  visitaId: string;
  codigo: string;
  persona: string;
  profesional?: string | null;
  horaInicioProg?: string | null;
  horaFinProg?: string | null;
  onClose: () => void;
  onResuelta: () => void;
}) {
  const { token } = useAuth();
  const [salida, setSalida] = useState<Salida | null>(null);
  // Se proponen las horas acordadas: nueve de cada diez veces son las buenas y
  // sólo hay que confirmarlas.
  const [horaInicio, setHoraInicio] = useState(horaInicioProg ?? "09:00");
  const [horaFin, setHoraFin] = useState(horaFinProg ?? "12:00");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  async function aplicar() {
    if (!salida) return;
    setGuardando(true);
    setError(null);
    try {
      if (salida === "FICHAR") {
        const r = await api.post<{ incidenciasResueltas?: string[] }>(
          `/visitas/${visitaId}/fichar-por`,
          { horaInicio, horaFin, motivo: motivo.trim() || "Fichado por coordinación: olvidó fichar" },
          token,
        );
        const cerradas = r.incidenciasResueltas ?? [];
        setHecho(
          `${codigo} queda fichada de ${horaInicio} a ${horaFin}.` +
            (cerradas.length > 0 ? ` Se ha resuelto ${cerradas.join(", ")}.` : ""),
        );
      } else if (salida === "CAMINO") {
        // No cambia el estado: sólo deja dicho por qué llega tarde, que es lo
        // que hará falta si mañana alguien pregunta.
        await api.post(
          `/incidencias`,
          {
            visitaId,
            motivo: "RETRASO",
            prioridad: "BAJA",
            descripcion: `${codigo}: ${motivo.trim() || "va de camino, llega tarde"}`,
          },
          token,
        );
        setHecho(`Anotado. ${codigo} sigue abierta y se ficha como siempre.`);
      } else {
        await api.post(
          `/visitas/${visitaId}/no-prestada`,
          { tipo: salida, motivo: motivo.trim() || OPCIONES.find((o) => o.clave === salida)!.titulo },
          token,
        );
        setHecho(`${codigo} registrada como ${salida.toLowerCase().replace(/_/g, " ")}.`);
      }
      onResuelta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  const elegida = OPCIONES.find((o) => o.clave === salida);

  return (
    <Modal title={`${codigo} · ¿qué ha pasado?`} onClose={onClose} size="lg">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Jornada de <span className="font-medium text-slate-800">{persona}</span>
          {profesional && (
            <>
              {" "}
              con <span className="font-medium text-slate-800">{profesional}</span>
            </>
          )}
          {horaInicioProg && (
            <>
              {" "}
              · debía empezar a las <span className="font-medium text-slate-800">{horaInicioProg}</span>
            </>
          )}
          .
        </p>

        {hecho ? (
          <div className="rounded-xl border border-brand-green-200 bg-brand-green-50 px-3 py-3 text-sm text-brand-green-800">
            <p className="flex items-start gap-2">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0" /> {hecho}
            </p>
            <button onClick={onClose} className="boton-secundario-sm mt-3">
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {OPCIONES.map((o) => (
                <button
                  key={o.clave}
                  onClick={() => setSalida(o.clave)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    salida === o.clave ? `${TONOS[o.tono]} ring-2 ring-brand-300` : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-800">{o.titulo}</p>
                  <p className="text-xs text-slate-500">{o.cuando}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">{o.consecuencia}</p>
                </button>
              ))}
            </div>

            {salida === "FICHAR" && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <IconClock className="h-3.5 w-3.5 text-slate-400" /> Qué horas hizo
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-slate-500">
                    Entró
                    <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="mt-1 campo w-32" />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Salió
                    <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="mt-1 campo w-32" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Quedará escrito que lo fichó coordinación y no quien estuvo allí: el registro de jornada tiene que poder decirlo.
                </p>
              </div>
            )}

            {elegida && (
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Qué te han contado
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={
                    salida === "FICHAR"
                      ? "Hablado con ella: hizo la jornada entera y olvidó cerrar…"
                      : "Lo que te han dicho, para que quede en el historial…"
                  }
                  className="mt-1 campo font-normal normal-case"
                />
              </label>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="boton-secundario-sm">
                Ahora no
              </button>
              <button onClick={() => void aplicar()} disabled={!salida || guardando} className="boton-principal-sm">
                {guardando ? "Guardando…" : "Resolver"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
