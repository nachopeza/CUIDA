import { useState, type ReactNode } from "react";
import { IconArrowLeft } from "./icons.js";

// ---------------------------------------------------------------------------
// Las piezas de toda ficha de página
//
// Servicio, persona y profesional se abren igual: volver, título con su estado,
// acciones arriba a la derecha, dos tarjetas de contexto, una franja de datos,
// pestañas y, a la derecha, lo que se hace y lo que hay pendiente. Que las tres
// usen las mismas piezas es lo que hace que se lean igual: los mismos botones,
// la misma rejilla y la misma tipografía.
// ---------------------------------------------------------------------------

export function Etiqueta({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>;
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Etiqueta>{etiqueta}</Etiqueta>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export function Fila({ etiqueta, valor, aviso, bueno }: { etiqueta: string; valor: string; aviso?: boolean; bueno?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{etiqueta}</dt>
      <dd className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${aviso ? "text-amber-600" : bueno ? "text-brand-green-700" : "text-slate-800"}`}>{valor}</dd>
    </div>
  );
}

// Una tarjeta con título y, a la derecha, un enlace o un botón pequeño.
export function Bloque({ titulo, accion, children, className = "" }: { titulo?: string; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`tarjeta p-4 ${className}`}>
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {titulo && <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </div>
  );
}

export function EnlaceBloque({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="text-xs font-medium text-brand hover:underline">
      {children}
    </button>
  );
}

export function Pestanas<T extends string>({ valor, onCambiar, opciones }: { valor: T; onCambiar: (v: T) => void; opciones: { clave: T; etiqueta: string }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {opciones.map((p) => (
        <button
          key={p.clave}
          role="tab"
          aria-selected={valor === p.clave}
          onClick={() => onCambiar(p.clave)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition ${
            valor === p.clave ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
}

export interface AccionMenu {
  etiqueta: string;
  Icono: (p: { className?: string }) => JSX.Element;
  alPulsar: () => void;
  peligro?: boolean;
  // Por qué no se puede ahora: se enseña debajo y la opción queda atenuada, pero
  // sigue pudiéndose pulsar para leer la explicación completa.
  razon?: string | null;
}

// Cabecera: volver, título con sus etiquetas, una línea de contexto y, a la
// derecha, la acción principal y el menú «⋯».
export function FichaCabecera({
  volver,
  onVolver,
  titulo,
  etiquetas,
  linea,
  acciones,
  menu,
}: {
  volver: string;
  onVolver: () => void;
  titulo: string;
  etiquetas?: ReactNode;
  linea?: ReactNode;
  acciones?: ReactNode;
  menu?: AccionMenu[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button onClick={onVolver} className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <IconArrowLeft className="h-4 w-4" /> {volver}
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-slate-800">{titulo}</h1>
            {etiquetas}
          </div>
          {linea && <p className="mt-1 text-sm text-slate-500">{linea}</p>}
        </div>
        <div className="relative flex items-center gap-2">
          {acciones}
          {menu && menu.length > 0 && (
            <>
              <button onClick={() => setAbierto((v) => !v)} className="boton-secundario px-3" aria-label="Más acciones" aria-haspopup="menu" aria-expanded={abierto}>
                <span className="text-lg leading-none">⋯</span>
              </button>
              {abierto && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
                  <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    {menu.map(({ etiqueta, Icono, alPulsar, peligro, razon }) => (
                      <button
                        key={etiqueta}
                        role="menuitem"
                        onClick={() => {
                          setAbierto(false);
                          alPulsar();
                        }}
                        className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${razon ? "opacity-60" : ""}`}
                      >
                        <span className={`flex items-center gap-2 font-medium ${peligro ? "text-rose-600" : "text-slate-700"}`}>
                          <Icono className="h-4 w-4" /> {etiqueta}
                        </span>
                        {razon && <span className="mt-0.5 pl-6 text-xs text-slate-500">{razon}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Lista de acciones rápidas de la columna derecha.
export function AccionesRapidas({ acciones }: { acciones: { etiqueta: string; Icono: (p: { className?: string }) => JSX.Element; alPulsar: () => void; oculto?: boolean }[] }) {
  return (
    <Bloque titulo="Acciones rápidas">
      <ul className="-my-1 divide-y divide-slate-100 text-sm">
        {acciones
          .filter((a) => !a.oculto)
          .map(({ etiqueta, Icono, alPulsar }) => (
            <li key={etiqueta}>
              <button onClick={alPulsar} className="flex w-full items-center gap-3 py-2.5 text-left text-slate-700 hover:text-brand">
                <Icono className="h-4 w-4 text-slate-400" /> {etiqueta}
              </button>
            </li>
          ))}
      </ul>
    </Bloque>
  );
}

// La rejilla de la ficha: lo principal a la izquierda y la columna lateral a la
// derecha. Con `minmax(0, 1fr)` nada ensancha la página en una pantalla estrecha.
export function RejillaFicha({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">{children}</div>;
}
