import { useState } from "react";
import { Modal } from "./Modal.js";
import { IconAlert, IconCheck } from "./icons.js";

export interface ElementoAQuitar {
  id: string;
  etiqueta: string;
}

export interface Alternativa {
  // Lo que se ofrece cuando no se puede borrar: "Archivar", "Dar de baja"…
  verbo: string;
  // Qué hace exactamente, en una frase, antes de aceptar.
  explicacion: string;
  aplicar: (id: string) => Promise<void>;
  // Cómo se dice lo que ha quedado hecho: "3 archivadas", "2 de baja".
  textoHecho: (n: number) => string;
}

type Fase = "confirmar" | "trabajando" | "resultado" | "hecho";

function motivoDe(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido";
}

// "Eliminar" para una selección, con salida cuando no se puede borrar.
//
// Antes, eliminar varias filas a la vez terminaba en un aviso: "3 no se han
// podido eliminar porque ya tienen historial". Y ahí se acababa: quien limpiaba
// la lista se quedaba con las mismas filas y sin ningún gesto que las quitara de
// en medio. El historial no se borra, pero sí se puede archivar, cancelar o dar
// de baja. Este diálogo lo ofrece justo en el momento en que hace falta, y dice
// por qué cada fila que se resiste no se ha podido borrar.
export function QuitarEnLoteModal({
  singular,
  plural,
  elementos,
  eliminar,
  alternativa,
  onClose,
  onTerminado,
}: {
  singular: string;
  plural: string;
  elementos: ElementoAQuitar[];
  eliminar: (id: string) => Promise<void>;
  alternativa?: Alternativa;
  onClose: () => void;
  onTerminado: () => void | Promise<void>;
}) {
  const [fase, setFase] = useState<Fase>("confirmar");
  const [borrados, setBorrados] = useState(0);
  const [bloqueados, setBloqueados] = useState<{ el: ElementoAQuitar; motivo: string }[]>([]);
  const [resultadoAlt, setResultadoAlt] = useState<{ hechos: number; fallos: { el: ElementoAQuitar; motivo: string }[] } | null>(null);

  const n = elementos.length;
  const nombre = n === 1 ? singular : plural;

  async function borrar() {
    setFase("trabajando");
    const perdidos: { el: ElementoAQuitar; motivo: string }[] = [];
    let ok = 0;
    // De uno en uno: en paralelo, dos borrados que comparten algo (una persona y
    // su familiar) se pisaban y el resultado dependía del orden en que llegaran.
    for (const el of elementos) {
      try {
        await eliminar(el.id);
        ok += 1;
      } catch (e) {
        perdidos.push({ el, motivo: motivoDe(e) });
      }
    }
    setBorrados(ok);
    setBloqueados(perdidos);
    await onTerminado();
    setFase(perdidos.length === 0 ? "hecho" : "resultado");
  }

  async function aplicarAlternativa() {
    if (!alternativa) return;
    setFase("trabajando");
    const fallos: { el: ElementoAQuitar; motivo: string }[] = [];
    let hechos = 0;
    for (const { el } of bloqueados) {
      try {
        await alternativa.aplicar(el.id);
        hechos += 1;
      } catch (e) {
        fallos.push({ el, motivo: motivoDe(e) });
      }
    }
    setResultadoAlt({ hechos, fallos });
    await onTerminado();
    setFase("hecho");
  }

  return (
    <Modal title={`Quitar ${n} ${nombre}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {fase === "confirmar" && (
          <>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {elementos.map((e) => (
                <li key={e.id}>{e.etiqueta}</li>
              ))}
            </ul>
            <p className="text-slate-600">
              Se eliminarán del todo. Los que ya tengan historial no se pueden borrar
              {alternativa ? `: para esos podrás elegir ${alternativa.verbo.toLowerCase()} en el paso siguiente.` : "."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="boton-secundario-sm">
                Cancelar
              </button>
              <button onClick={() => void borrar()} className="boton-peligro-sm">
                Eliminar
              </button>
            </div>
          </>
        )}

        {fase === "trabajando" && <p className="py-4 text-center text-slate-500">Un momento…</p>}

        {fase === "resultado" && (
          <>
            {borrados > 0 && (
              <p className="flex items-center gap-1.5 text-brand-green-700">
                <IconCheck className="h-4 w-4" /> {borrados} eliminad{borrados === 1 ? "o" : "os"}.
              </p>
            )}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <IconAlert className="h-3.5 w-3.5" />
                {bloqueados.length} no se {bloqueados.length === 1 ? "puede" : "pueden"} eliminar
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-amber-900">
                {bloqueados.map(({ el, motivo }) => (
                  <li key={el.id}>
                    <span className="font-medium">{el.etiqueta}</span> — {motivo}
                  </li>
                ))}
              </ul>
            </div>
            {alternativa ? (
              <>
                <p className="text-slate-600">
                  <span className="font-medium text-slate-800">¿{alternativa.verbo} en su lugar?</span> {alternativa.explicacion}
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={onClose} className="boton-secundario-sm">
                    Dejarlos como están
                  </button>
                  <button onClick={() => void aplicarAlternativa()} className="boton-principal-sm">
                    {alternativa.verbo} {bloqueados.length === 1 ? "el que queda" : `los ${bloqueados.length}`}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-end">
                <button onClick={onClose} className="boton-secundario-sm">
                  Cerrar
                </button>
              </div>
            )}
          </>
        )}

        {fase === "hecho" && (
          <>
            {borrados > 0 && (
              <p className="flex items-center gap-1.5 text-brand-green-700">
                <IconCheck className="h-4 w-4" /> {borrados} eliminad{borrados === 1 ? "o" : "os"}.
              </p>
            )}
            {resultadoAlt && resultadoAlt.hechos > 0 && alternativa && (
              <p className="flex items-center gap-1.5 text-brand-green-700">
                <IconCheck className="h-4 w-4" /> {alternativa.textoHecho(resultadoAlt.hechos)}.
              </p>
            )}
            {resultadoAlt && resultadoAlt.fallos.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <p className="font-medium">Estos siguen como estaban:</p>
                <ul className="mt-1 space-y-1">
                  {resultadoAlt.fallos.map(({ el, motivo }) => (
                    <li key={el.id}>
                      <span className="font-medium">{el.etiqueta}</span> — {motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="boton-principal-sm">
                Listo
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
