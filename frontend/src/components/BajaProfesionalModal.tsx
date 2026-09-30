import { useEffect, useState } from "react";
import { Modal } from "./Modal.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { IconAlert, IconCheck } from "./icons.js";

interface Servicio {
  id: string;
  codigo: string;
  persona: string;
  necesidad: string;
  jornadasPorHacer: number;
  proxima: string | null;
}

interface Impacto {
  estado: string;
  propuestas: Servicio[];
  enMarcha: Servicio[];
  ausenciasPendientes: number;
  interesesAbiertos: number;
}

// Dar de baja a quien deja de trabajar con nosotros.
//
// Antes sólo se podía eliminar, y eso no se puede si ha hecho algún servicio:
// "desactívalo en vez de eliminarlo", decía el aviso, y no había dónde. Y darlo
// de baja sin más dejaría a personas atendidas con un servicio a nombre de
// alguien que ya no va a ir. Por eso lo primero que se enseña es qué se queda
// sin cubrir, y lo segundo, qué se va a hacer con ello.
export function BajaProfesionalModal({ profesionalId, nombre, onClose, onHecho }: {
  profesionalId: string;
  nombre: string;
  onClose: () => void;
  onHecho: () => void | Promise<void>;
}) {
  const { token } = useAuth();
  const [impacto, setImpacto] = useState<Impacto | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ propuestasDevueltas: string[]; incidencias: string[] } | null>(null);

  useEffect(() => {
    api
      .get<Impacto>(`/profesionales/${profesionalId}/baja-impacto`, token)
      .then(setImpacto)
      .catch(() => setError("No se ha podido calcular lo que dejaría sin cubrir."));
  }, [profesionalId, token]);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await api.post<{ propuestasDevueltas: string[]; incidencias: string[] }>(`/profesionales/${profesionalId}/baja`, { motivo }, token);
      setHecho(r);
      await onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido dar de baja");
    } finally {
      setEnviando(false);
    }
  }

  const fila = (s: Servicio) => (
    <li key={s.id} className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-slate-700">
        {s.necesidad} con {s.persona} <span className="text-slate-400">· {s.codigo}</span>
      </span>
      {s.jornadasPorHacer > 0 && <span className="shrink-0 text-slate-400">{s.jornadasPorHacer} jornada{s.jornadasPorHacer === 1 ? "" : "s"}</span>}
    </li>
  );

  return (
    <Modal title={`Dar de baja a ${nombre}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {hecho ? (
          <>
            <p className="flex items-center gap-1.5 text-brand-green-700">
              <IconCheck className="h-4 w-4" /> {nombre} está de baja y ya no puede entrar.
            </p>
            {hecho.propuestasDevueltas.length > 0 && (
              <p className="text-xs text-slate-600">Vuelven a estar sin cubrir: {hecho.propuestasDevueltas.join(", ")}.</p>
            )}
            {hecho.incidencias.length > 0 && (
              <p className="text-xs text-slate-600">
                Incidencias de relevo abiertas: {hecho.incidencias.join(", ")}. Están en la bandeja, con prioridad alta.
              </p>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="boton-principal-sm">
                Listo
              </button>
            </div>
          </>
        ) : !impacto ? (
          <p className="py-3 text-center text-slate-500">{error ?? "Calculando lo que quedaría sin cubrir…"}</p>
        ) : (
          <>
            <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
              {impacto.enMarcha.length === 0 && impacto.propuestas.length === 0 ? (
                <p className="text-xs text-slate-600">No tiene ningún servicio en marcha ni propuesto: la baja no deja nada a medias.</p>
              ) : (
                <>
                  {impacto.enMarcha.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500">Servicios en marcha — abrirán una incidencia de relevo</p>
                      <ul className="space-y-0.5">{impacto.enMarcha.map(fila)}</ul>
                    </div>
                  )}
                  {impacto.propuestas.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500">Propuestas sin aceptar — vuelven a estar sin cubrir</p>
                      <ul className="space-y-0.5">{impacto.propuestas.map(fila)}</ul>
                    </div>
                  )}
                </>
              )}
              {(impacto.ausenciasPendientes > 0 || impacto.interesesAbiertos > 0) && (
                <p className="text-xs text-slate-500">
                  {impacto.ausenciasPendientes > 0 && `${impacto.ausenciasPendientes} petición(es) de días sin contestar se cancelarán. `}
                  {impacto.interesesAbiertos > 0 && `Se retirará de ${impacto.interesesAbiertos} solicitud(es) a las que se había apuntado.`}
                </p>
              )}
            </div>

            <label className="block text-xs font-medium text-slate-500">
              Motivo de la baja
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Fin de contrato, cambia de ciudad…" className="mt-1 campo" />
            </label>

            <p className="text-xs text-slate-500">
              Su historial, sus jornadas y lo que se le debe se conservan. La cuenta deja de poder entrar. Se puede reactivar después, pero no recupera lo que se reasigne.
            </p>

            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="boton-secundario-sm">
                Cancelar
              </button>
              <button
                onClick={() => void confirmar()}
                disabled={enviando || motivo.trim().length < 3}
                className="boton-peligro-sm"
              >
                {enviando ? "Dando de baja…" : "Dar de baja"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
