import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// La identidad de CUIDA, en piezas
//
// Las hojas de la marca, los cuatro tintes de las casillas y la tarjeta de marca
// estaban sólo en el escritorio. Las fichas se quedaban en blanco y gris, y la
// aplicación parecía otra en cuanto se abría algo. Aquí viven para todas.
// ---------------------------------------------------------------------------

// La hoja de la marca, en la esquina y apenas insinuada.
export function Hojas({ className = "-right-4 -top-6 h-28 sm:h-40", opacidad = "opacity-[0.13]" }: { className?: string; opacidad?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={`pointer-events-none absolute w-auto ${opacidad} ${className}`} aria-hidden>
      <path fill="#1b8b7a" d="M58 6C34 6 14 20 10 42c-2 11 3 21 11 26 0-18 10-34 28-44-14 12-22 27-23 46 18 2 33-7 38-22 4-13 4-29-6-42Z" />
      <path fill="#5bceaa" d="M96 20c-18 0-32 10-35 26-2 8 2 15 8 19 0-13 8-25 21-32-11 9-17 20-17 34 13 2 24-5 28-16 3-9 3-21-5-31Z" />
    </svg>
  );
}

// Los cuatro tintes de la maqueta: un degradado desde la esquina al blanco, el
// icono en su círculo y la cifra en el color de la casilla.
export const TINTES = {
  rose: { caja: "from-[#fff1f1] to-white", icono: "bg-[#ffdfe1] text-[#d4415a]", numero: "text-[#ac2633]", etiqueta: "text-[#86181b]" },
  amber: { caja: "from-[#fff6e6] to-white", icono: "bg-[#ffeed2] text-[#e1820e]", numero: "text-[#c96f06]", etiqueta: "text-[#653b15]" },
  verde: { caja: "from-[#eafaf4] to-white", icono: "bg-[#dbf3eb] text-[#0b5f55]", numero: "text-[#0b5f55]", etiqueta: "text-[#0b3338]" },
  azul: { caja: "from-[#e9f4fd] to-white", icono: "bg-[#dceefc] text-[#0c5770]", numero: "text-[#0c5770]", etiqueta: "text-[#002033]" },
} as const;

export type Tono = keyof typeof TINTES;
type Pinta = (p: { className?: string }) => JSX.Element;

export interface Indicador {
  etiqueta: string;
  valor: ReactNode;
  Icono: Pinta;
  tono: Tono;
  // Una línea pequeña debajo: el contexto de la cifra.
  detalle?: ReactNode;
  onClick?: () => void;
}

// La franja de cifras de una ficha, con los mismos tintes que las casillas del
// escritorio: lo que se mira primero se ve primero.
export function Indicadores({ items }: { items: Indicador[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ etiqueta, valor, Icono, tono, detalle, onClick }) => {
        const t = TINTES[tono];
        const Caja = onClick ? "button" : "div";
        return (
          <Caja
            key={etiqueta}
            onClick={onClick}
            className={`flex min-w-0 items-center gap-3 rounded-tarjeta border border-slate-200/60 bg-gradient-to-br p-3.5 text-left shadow-tarjeta ${t.caja} ${onClick ? "transition hover:brightness-[0.98]" : ""}`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${t.icono}`}>
              <Icono className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-xl font-bold leading-tight tabular-nums ${t.numero}`}>{valor}</span>
              <span className={`block truncate text-xs font-semibold ${t.etiqueta}`}>{etiqueta}</span>
              {detalle && <span className="block truncate text-[11px] text-slate-500">{detalle}</span>}
            </span>
          </Caja>
        );
      })}
    </div>
  );
}

// El icono de un bloque, en su círculo de color.
export function IconoTintado({ Icono, tono = "verde", tamano = "h-8 w-8" }: { Icono: Pinta; tono?: Tono; tamano?: string }) {
  return (
    <span className={`flex ${tamano} shrink-0 items-center justify-center rounded-full ${TINTES[tono].icono}`}>
      <Icono className="h-4 w-4" />
    </span>
  );
}

// La tarjeta de marca: lo que significan las cifras de al lado.
export function TarjetaMarca({ titulo, texto, accion }: { titulo: ReactNode; texto: string; accion?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-tarjeta bg-gradient-to-br from-brand-green-50 to-brand-50 p-5">
      <Hojas />
      <h3 className="relative text-xl font-semibold leading-tight text-brand-900">{titulo}</h3>
      <p className="relative mt-1.5 text-sm text-slate-600">{texto}</p>
      {accion && <div className="relative mt-3">{accion}</div>}
    </section>
  );
}
