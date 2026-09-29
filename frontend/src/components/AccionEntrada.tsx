import { IconAlert, IconCalendar, IconPlay } from "./icons.js";
import type { Visita } from "../lib/types.js";

// El botón de entrada de una jornada.
//
// "He llegado" ficha la hora de este instante, así que sólo tiene sentido
// pulsarlo el día de la jornada. Se decide aquí qué se ofrece según cuándo
// cae, en vez de enseñar el mismo botón en todas y dejar que el servidor
// rechace el toque:
//
//   hoy      el botón, con la hora que va a quedar escrita y si llega tarde
//   otro día futuro: se dice cuándo se podrá; no hay botón que pulsar por error
//   pasado   la jornada se quedó sin fichar; no se puede fichar a posteriori,
//            se avisa a coordinación, que la ficha por ella con su motivo
export function AccionEntrada({
  visita,
  ahora,
  hoyClave,
  onFichar,
  onAvisar,
}: {
  visita: Visita;
  ahora: Date;
  hoyClave: string;
  onFichar: () => void;
  onAvisar: () => void;
}) {
  const dia = visita.fecha.slice(0, 10);
  const horaProg = visita.horaInicioProg;

  if (dia > hoyClave) {
    const cuando = new Date(visita.fecha).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <IconCalendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        Se ficha el {cuando}
        {horaProg ? `, a las ${horaProg}` : ""}.
      </p>
    );
  }

  if (dia < hoyClave) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="flex min-w-0 flex-1 items-start gap-1.5 text-xs text-amber-800">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Esta jornada era del {new Date(visita.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long" })} y no se fichó.
        </p>
        <button onClick={onAvisar} className="boton-secundario-sm">
          Avisar a coordinación
        </button>
      </div>
    );
  }

  const hora = ahora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  let nota = "Se guarda la hora en que pulsas.";
  let tarde = false;
  if (horaProg) {
    const [h, m] = horaProg.split(":").map(Number);
    const previsto = new Date(ahora);
    previsto.setHours(h, m, 0, 0);
    const minutos = Math.round((ahora.getTime() - previsto.getTime()) / 60000);
    if (minutos > 5) {
      tarde = true;
      nota = `Empezaba a las ${horaProg}: llevas ${minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${minutos} min`} de retraso y quedará anotado.`;
    } else if (minutos < -30) {
      nota = `Empieza a las ${horaProg}. Puedes fichar cuando llegues.`;
    } else {
      nota = `Empieza a las ${horaProg}.`;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button onClick={onFichar} className="boton-principal">
        <IconPlay className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
        He llegado · fichar entrada a las {hora}
      </button>
      <p className={`text-xs ${tarde ? "text-amber-700" : "text-slate-500"}`}>{nota}</p>
    </div>
  );
}
