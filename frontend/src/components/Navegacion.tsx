import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { IconChevronDown, IconX } from "./icons.js";

export interface ItemNav {
  key: string;
  label: string;
  icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
}

// Un área agrupa varias pestañas bajo un mismo encabezado. Dieciséis entradas
// sueltas obligaban a leérselas todas para encontrar una; agrupadas por
// aquello de lo que se hace con ellas, se va directo.
//
// El título vacío es un grupo sin rótulo: lo primero del menú no necesita que
// le pongan nombre. Y `plegable` guarda para lo que se toca una vez al mes
// —la configuración— que por defecto está cerrado y no ocupa media pantalla.
export interface AreaNav {
  titulo: string;
  items: ItemNav[];
  plegable?: boolean;
}

export interface BadgeNav {
  valor: number;
  tono: "rose" | "amber";
}

interface Props {
  // O una lista plana (paneles simples) o áreas con título (coordinación).
  items?: ItemNav[];
  areas?: AreaNav[];
  activo: string;
  onIr: (key: string) => void;
  badges?: Record<string, BadgeNav | undefined>;
  // Lo que va encima de la navegación: el buscador global en coordinación,
  // nada en los paneles más simples.
  cabecera?: ReactNode;
  // Lo que se crea desde aquí. Va en el menú y no perdido en la cabecera de
  // cada pantalla: crear una solicitud es lo que más se hace en el día.
  acciones?: ReactNode;
  abierto: boolean;
  onCerrar: () => void;
}

function Botones({
  items,
  activo,
  onIr,
  badges,
}: { items: ItemNav[] } & Pick<Props, "activo" | "onIr" | "badges">) {
  return (
    <>
      {items.map((n) => {
        const badge = badges?.[n.key];
        const seleccionado = activo === n.key;
        return (
          <button
            key={n.key}
            onClick={() => onIr(n.key)}
            aria-current={seleccionado ? "page" : undefined}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition md:py-2 ${
              seleccionado ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <n.icon className="h-4 w-4 shrink-0" />
              {n.label}
            </span>
            {badge && badge.valor > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  seleccionado
                    ? "bg-white/25 text-white"
                    : badge.tono === "rose"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {badge.valor}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function Area({ area, activo, onIr, badges }: { area: AreaNav } & Pick<Props, "activo" | "onIr" | "badges">) {
  const contieneElActivo = area.items.some((i) => i.key === activo);
  // Se recuerda si estaba abierto: quien pasa la mañana en configuración no
  // tiene que abrirla en cada recarga.
  const [abierta, setAbierta] = useState(() => {
    if (!area.plegable) return true;
    try {
      return window.localStorage.getItem(`nav-area-${area.titulo}`) === "abierta";
    } catch {
      return false;
    }
  });

  // Si se navega a algo que está dentro, el grupo se abre solo: no tiene
  // sentido estar en una pantalla y que el menú no la señale.
  useEffect(() => {
    if (contieneElActivo) setAbierta(true);
  }, [contieneElActivo]);

  function alternar() {
    const siguiente = !abierta;
    setAbierta(siguiente);
    try {
      window.localStorage.setItem(`nav-area-${area.titulo}`, siguiente ? "abierta" : "cerrada");
    } catch {
      /* en privado no se guarda, y no pasa nada */
    }
  }

  const rotulo = "px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400";
  return (
    <div>
      {area.titulo &&
        (area.plegable ? (
          <button onClick={alternar} className={`mb-1 flex w-full items-center justify-between py-1 ${rotulo} hover:text-slate-600`}>
            {area.titulo}
            <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden />
          </button>
        ) : (
          // El título del área no es pulsable a propósito: es un rótulo
          // que ordena, no un sitio al que ir.
          <p className={`mb-1 ${rotulo}`}>{area.titulo}</p>
        ))}
      {abierta && (
        <div className="space-y-0.5">
          <Botones items={area.items} activo={activo} onIr={onIr} badges={badges} />
        </div>
      )}
    </div>
  );
}

function Lista({ items, areas, activo, onIr, badges }: Pick<Props, "items" | "areas" | "activo" | "onIr" | "badges">) {
  if (areas && areas.length > 0) {
    return (
      <nav className="space-y-4">
        {areas.map((area) => (
          <Area key={area.titulo} area={area} activo={activo} onIr={onIr} badges={badges} />
        ))}
      </nav>
    );
  }
  return (
    <nav className="space-y-0.5">
      <Botones items={items ?? []} activo={activo} onIr={onIr} badges={badges} />
    </nav>
  );
}

// Una sola navegación para los tres paneles. En pantalla ancha es la columna
// de siempre; en móvil es un cajón que entra desde la izquierda sobre un
// fondo atenuado, en vez de la rejilla de botones sueltos que se colaba
// entre la cabecera y el contenido y empujaba la página hacia abajo.
export function Navegacion({ items, areas, activo, onIr, badges, cabecera, acciones, abierto, onCerrar }: Props) {
  // Mientras el cajón está abierto la página de detrás no se mueve: en móvil
  // es lo que distingue un panel de una sección más que se ha desplegado.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function alPulsar(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPulsar);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", alPulsar);
    };
  }, [abierto, onCerrar]);

  return (
    <>
      <aside className="hidden shrink-0 md:block md:w-56">
        <div className="sticky top-6">
          {cabecera && <div className="mb-3">{cabecera}</div>}
          {acciones && <div className="mb-3">{acciones}</div>}
          <Lista items={items} areas={areas} activo={activo} onIr={onIr} badges={badges} />
        </div>
      </aside>

      {/* Cajón móvil. Se monta siempre para que la transición se vea al
          abrir y al cerrar; cuando está cerrado no recibe pulsaciones. */}
      <div className={`fixed inset-0 z-50 md:hidden ${abierto ? "" : "pointer-events-none"}`} aria-hidden={!abierto}>
        <div
          onClick={onCerrar}
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${abierto ? "opacity-100" : "opacity-0"}`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className={`absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 ${
            abierto ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-700">Menú</span>
            <button onClick={onCerrar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar menú">
              <IconX className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {cabecera && <div className="mb-3">{cabecera}</div>}
            {acciones && <div className="mb-3">{acciones}</div>}
            <Lista items={items} areas={areas} activo={activo} onIr={onIr} badges={badges} />
          </div>
        </div>
      </div>
    </>
  );
}
