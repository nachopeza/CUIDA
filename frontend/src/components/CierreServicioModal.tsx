import { useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { Modal } from "./Modal.js";
import type { Solicitud } from "../lib/types.js";

// Las tres maneras de sacar un servicio del día a día, cada una con lo que
// provoca escrito antes de confirmar:
//
//   Terminar  — el servicio ha hecho su trabajo y no sigue (un recurrente que se
//               acaba). Lo hecho se verifica, se cobra y se paga; lo que nadie ha
//               empezado sale de la agenda.
//   Cancelar  — no llega a hacerse o se corta. Sus jornadas sin empezar salen de
//               la agenda sin cargo y la solicitud queda cancelada.
//   Eliminar  — sólo si no ha habido actividad real: desaparece del todo.
//
// Antes había un botón «Cancelar» sin motivo ni explicación, y terminar o
// eliminar no existían: un servicio sólo podía quedarse como estaba.
export type ModoCierre = "terminar" | "cancelar" | "eliminar";

const TRABAJADAS = ["FINALIZADA", "INCIDENCIA", "REVISADA", "LIQUIDADA"];

// Qué impide hacerlo ahora mismo, con las mismas reglas del servidor, para
// explicarlo antes de que alguien pulse en vez de rechazarlo después.
export function motivoNoPuede(s: Solicitud, modo: ModoCierre): string | null {
  const srv = s.servicio;
  if (!srv) return null;
  const visitas = srv.visitas ?? [];
  const abierta = visitas.some((v) => v.estado === "EN_CURSO");
  const incidencia = (srv.incidencias ?? []).find((i) => i.tipo !== "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));
  const trabajo = visitas.some((v) => TRABAJADAS.includes(v.estado));

  if (modo === "terminar") {
    if (!["CONFIRMADO", "EN_CURSO"].includes(srv.estado)) {
      return ["PENDIENTE", "ASIGNADO"].includes(srv.estado) ? "Todavía no ha empezado: si ya no hace falta, cancélalo." : "Ya está terminado o cancelado.";
    }
    if (abierta) return "Hay una jornada abierta ahora mismo: hay que cerrarla antes.";
    if (incidencia) return `Tiene la incidencia ${incidencia.codigo} abierta: resuélvela antes de terminar.`;
    if (!trabajo) return "Todavía no se ha hecho ninguna jornada: si ya no hace falta, cancélalo.";
  }
  if (modo === "cancelar") {
    if (["CANCELADO", "CERRADO"].includes(srv.estado)) return "Ya está cerrado.";
    if (["FINALIZADO", "VALIDADO"].includes(srv.estado)) return "Ya se hizo el trabajo: lo que falta es cobrarlo y pagarlo, no cancelarlo.";
    if (abierta) return "Hay una jornada abierta ahora mismo: hay que cerrarla antes.";
  }
  if (modo === "eliminar") {
    const actividad = visitas.some((v) => v.horaInicioReal || v.facturaId || !["PROGRAMADA", "CONFIRMADA", "CANCELADA"].includes(v.estado));
    if (actividad) return "Ya hay jornadas trabajadas o facturadas: no se puede borrar. Cancélalo o termínalo.";
  }
  return null;
}

const TEXTOS: Record<ModoCierre, { titulo: string; boton: string; peligro: boolean; explica: string; motivo: boolean }> = {
  terminar: {
    titulo: "Terminar el servicio",
    boton: "Terminar servicio",
    peligro: false,
    explica: "El servicio da por hecho su trabajo y no sigue. No se generan más jornadas.",
    motivo: true,
  },
  cancelar: {
    titulo: "Cancelar el servicio",
    boton: "Cancelar servicio",
    peligro: true,
    explica: "El servicio no continúa. Queda como cancelado y se avisa a la profesional y a la familia.",
    motivo: true,
  },
  eliminar: {
    titulo: "Eliminar el servicio",
    boton: "Eliminar para siempre",
    peligro: true,
    explica: "Se borra la solicitud, el servicio y sus jornadas: no queda rastro en las listas. Sólo es posible porque no ha habido actividad real.",
    motivo: false,
  },
};

export function CierreServicioModal({
  solicitud,
  modo,
  onClose,
  onHecho,
}: {
  solicitud: Solicitud;
  modo: ModoCierre;
  onClose: () => void;
  // Recibe lo que ha pasado, para contárselo a quien lo ha pedido.
  onHecho: (aviso: string, borrado: boolean) => void;
}) {
  const { token } = useAuth();
  const srv = solicitud.servicio!;
  const t = TEXTOS[modo];
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const visitas = srv.visitas ?? [];
  const sinEmpezar = visitas.filter((v) => ["PROGRAMADA", "CONFIRMADA"].includes(v.estado) && !v.horaInicioReal);
  const hechas = visitas.filter((v) => TRABAJADAS.includes(v.estado));
  const porVerificar = visitas.filter((v) => ["FINALIZADA", "INCIDENCIA"].includes(v.estado));
  const bloqueo = motivoNoPuede(solicitud, modo);

  async function confirmar() {
    setError(null);
    if (t.motivo && motivo.trim().length < 3) {
      setError("Cuenta brevemente por qué: queda en el historial.");
      return;
    }
    setEnviando(true);
    try {
      if (modo === "eliminar") {
        await api.delete(`/solicitudes/${solicitud.id}`, token);
        onHecho(`${srv.codigo} eliminado.`, true);
      } else {
        const r = await api.post<{ jornadasRetiradas?: string[]; estado?: string }>(`/servicios/${srv.id}/${modo === "terminar" ? "terminar" : "cancelar"}`, { motivo: motivo.trim() }, token);
        const retiradas = r?.jornadasRetiradas?.length ?? 0;
        onHecho(
          modo === "terminar"
            ? `${srv.codigo} terminado${retiradas ? ` · ${retiradas} jornada${retiradas === 1 ? "" : "s"} sin empezar retirada${retiradas === 1 ? "" : "s"} de la agenda` : ""}.`
            : `${srv.codigo} cancelado${retiradas ? ` · ${retiradas} jornada${retiradas === 1 ? "" : "s"} retirada${retiradas === 1 ? "" : "s"} de la agenda` : ""}.`,
          false,
        );
      }
      onClose();
    } catch (e) {
      const texto = e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido hacer.";
      setError(texto);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title={t.titulo} onClose={onClose} size="lg">
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-800">{srv.codigo}</span> · {solicitud.persona.nombre} {solicitud.persona.apellidos}. {t.explica}
        </p>

        {bloqueo ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">{bloqueo}</div>
        ) : (
          <ul className="space-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-[13px]">
            {sinEmpezar.length > 0 && modo !== "eliminar" && (
              <li>
                {sinEmpezar.length} jornada{sinEmpezar.length === 1 ? "" : "s"} sin empezar salen de la agenda, sin cargo para nadie.
              </li>
            )}
            {sinEmpezar.length > 0 && modo === "eliminar" && (
              <li>
                Desaparecen {sinEmpezar.length} jornada{sinEmpezar.length === 1 ? "" : "s"} programada{sinEmpezar.length === 1 ? "" : "s"}.
              </li>
            )}
            {hechas.length > 0 && modo !== "eliminar" && (
              <li>
                Lo ya trabajado ({hechas.length} jornada{hechas.length === 1 ? "" : "s"}) se conserva: se verifica, se cobra a la familia y se paga a la profesional con normalidad.
              </li>
            )}
            {porVerificar.length > 0 && modo === "terminar" && (
              <li className="text-amber-700">
                {porVerificar.length} jornada{porVerificar.length === 1 ? "" : "s"} por verificar: el servicio se cierra cuando estén verificadas, cobradas y pagadas.
              </li>
            )}
            {srv.profesional && <li>Se avisa a {srv.profesional.nombre} de que ya no tiene que ir.</li>}
            {modo === "cancelar" && <li>La solicitud queda cancelada y las incidencias abiertas se cierran.</li>}
            {modo === "terminar" && <li>La solicitud y el servicio se cierran solos cuando la familia ha pagado y la profesional ha cobrado.</li>}
            {modo === "eliminar" && <li className="font-medium text-rose-700">No se puede deshacer.</li>}
            {sinEmpezar.length === 0 && hechas.length === 0 && !srv.profesional && modo !== "eliminar" && <li>No hay nada programado ni trabajado: sólo cambia el estado.</li>}
          </ul>
        )}

        {t.motivo && !bloqueo && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="motivo-cierre">
              Motivo
            </label>
            <textarea
              id="motivo-cierre"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={modo === "terminar" ? "Por ejemplo: la familia da por acabado el servicio" : "Por ejemplo: la familia ya no lo necesita"}
              className="campo w-full"
              autoFocus
            />
          </div>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="boton-secundario">
            Volver
          </button>
          {!bloqueo && (
            <button
              onClick={confirmar}
              disabled={enviando}
              className={t.peligro ? "boton-peligro" : "boton-principal"}
            >
              {enviando ? "Un momento…" : t.boton}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
