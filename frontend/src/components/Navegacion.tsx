import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { IconChevronDown, IconChevronRight, IconMenu, IconX } from "./icons.js";
import logoBlanco from "../assets/logo-cuida-blanco.svg";
import { useAuth } from "../lib/auth.js";

const ROL_CORTO: Record<string, string> = {
  PERSONA: "Persona atendida",
  FAMILIAR: "Familiar autorizado",
  PROFESIONAL: "Profesional",
  COORDINADOR: "Coordinadora",
  ORGANIZACION: "Organización",
  ADMIN: "Administrador",
  SUPERADMIN: "Superadmin",
};

// Quién eres, arriba del cajón. En escritorio eso está en la cabecera, pero
// en móvil la cabecera es un logo y dos iconos: el cajón es el único sitio
// donde cabe decirlo.
function QuienEres() {
  const { usuario } = useAuth();
  if (!usuario) return null;
  const nombre = usuario.nombre?.trim() || usuario.email.split("@")[0].replace(/[._]/g, " ");
  const iniciales = nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl bg-white/[0.08] px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
        {iniciales}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium capitalize text-white">{nombre}</span>
        <span className="block truncate text-xs text-white/50">{ROL_CORTO[usuario.rol] ?? usuario.rol}</span>
      </span>
      <IconChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden />
    </div>
  );
}

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
  // Rojo: alguien se queda sin servicio. Ámbar: va tarde. Verde: es sólo
  // cuántos hay. Tres tonos, ni uno más, y siempre queriendo decir lo mismo.
  tono: "rose" | "amber" | "verde";
}

interface Props {
  // O una lista plana (paneles simples) o áreas con título (coordinación).
  items?: ItemNav[];
  areas?: AreaNav[];
  activo: string;
  onIr: (key: string) => void;
  badges?: Record<string, BadgeNav | undefined>;
  // Lo que va encima de la navegación en el cajón móvil. En escritorio el
  // buscador vive en la cabecera.
  cabecera?: ReactNode;
  // Lo que se crea desde aquí. Va en el menú y no perdido en la cabecera de
  // cada pantalla: crear una solicitud es lo que más se hace en el día.
  acciones?: ReactNode;
  // De qué va esta parte de la casa, encima del menú.
  rotulo?: { titulo: string; lema: string } | null;
  // Las cuatro entradas que van en la barra inferior del móvil. La quinta,
  // "Menú", la pone la propia barra y abre el cajón.
  pestanasMovil?: ItemNav[];
  abierto: boolean;
  onAbrir?: () => void;
  onCerrar: () => void;
}

function Botones({ items, activo, onIr, badges }: { items: ItemNav[] } & Pick<Props, "activo" | "onIr" | "badges">) {
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
            className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-[7px] text-[13.5px] transition ${
              seleccionado
                ? // El elegido: la pastilla verde de la maqueta, en degradado
                  // y con un poco de brillo para que se despegue del fondo.
                  // Verde, que es el color de la casa. La sombra, apenas un
                  // apoyo: la de antes era un halo verde de 20 px que sobre la
                  // barra oscura parecía suciedad, no relieve.
                  "bg-gradient-to-r from-[#23a084] to-[#188a72] font-semibold text-white shadow-[0_2px_6px_-2px_rgba(0,0,0,0.35)]"
                : "font-medium text-white/75 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <n.icon className="h-[17px] w-[17px] shrink-0" />
              <span className="truncate">{n.label}</span>
            </span>
            {/* La cantidad, en círculo y del mismo tamaño siempre: en la
                maqueta son discos, no etiquetas que crecen con el número. */}
            {badge && badge.valor > 0 && (
              <span
                className={`flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none ${
                  seleccionado
                    ? "bg-white/25 text-white"
                    : badge.tono === "rose"
                      ? "bg-rose-400 text-white"
                      : badge.tono === "amber"
                        ? "bg-amber-300 text-amber-950"
                        : "bg-brand-green-300 text-brand-900"
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

  const rotulo = "px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45";
  return (
    // La raya entre grupos: en la maqueta separa un bloque del siguiente sin
    // necesidad de dejar medio dedo de aire.
    <div className="border-t border-white/[0.07] pt-3 first:border-0 first:pt-0">
      {area.titulo &&
        (area.plegable ? (
          <button onClick={alternar} className={`mb-1 flex w-full items-center justify-between py-1 ${rotulo} transition hover:text-white/70`}>
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
      <nav className="space-y-3">
        {areas.map((area) => (
          <Area key={area.titulo} area={area} activo={activo} onIr={onIr} badges={badges} />
        ))}
      </nav>
    );
  }
  return (
    <nav className="space-y-1">
      <Botones items={items ?? []} activo={activo} onIr={onIr} badges={badges} />
    </nav>
  );
}

// El remate de abajo. No es decoración de relleno: es lo que hace esta
// empresa, escrito donde se ve al final de cada jornada.
function Firma() {
  return (
    <div className="mt-8 shrink-0 px-2 pb-1 md:mt-auto">
      {/* Las dos hojas de la marca, grandes y superpuestas, y el lema
          debajo. Es el remate de la casa, no un adorno de relleno. */}
      <svg viewBox="0 0 120 80" className="mb-2 h-14 w-auto" aria-hidden>
        <path
          fill="#2c6650"
          d="M58 6C34 6 14 20 10 42c-2 11 3 21 11 26 0-18 10-34 28-44-14 12-22 27-23 46 18 2 33-7 38-22 4-13 4-29-6-42Z"
        />
        <path
          fill="#5ab893"
          d="M86 22c-18 0-32 10-35 26-2 8 2 15 8 19 0-13 8-25 21-32-11 9-17 20-17 34 13 2 24-5 28-16 3-9 3-21-5-31Z"
        />
      </svg>
      <p className="text-[13px] font-medium leading-snug text-white/80">
        Cuidamos hoy
        <br />
        de un mejor mañana
      </p>
    </div>
  );
}

// Una sola navegación para los tres paneles. En pantalla ancha es la columna
// oscura pegada al borde; en móvil es un cajón que entra desde la izquierda
// más una barra de pestañas fija abajo con lo que se usa a diario.
export function Navegacion({ items, areas, activo, onIr, badges, cabecera, acciones, rotulo, pestanasMovil, abierto, onAbrir, onCerrar }: Props) {
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

  // El hueco de la barra de pestañas se pide desde aquí: sólo lo necesita
  // quien la tiene.
  useEffect(() => {
    if (!pestanasMovil || pestanasMovil.length === 0) return;
    document.body.classList.add("con-pestanas");
    return () => document.body.classList.remove("con-pestanas");
  }, [pestanasMovil]);

  // El teal de la maqueta, tomado de la propia imagen: arriba un punto más
  // claro y casi plano hacia abajo.
  // Azul marino, no el teal casi negro de antes. Es la barra que se ve en
  // todas las pantallas: tiene que leerse como un color, no como una sombra.
  const fondoOscuro = "bg-gradient-to-b from-[#16304f] via-[#122944] to-[#0f223a]";

  return (
    <>
      <aside className={`hidden shrink-0 md:block md:w-[15rem] ${fondoOscuro}`}>
        <div className="sticky top-16 flex min-h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] flex-col overflow-y-auto barra-fina px-3 py-5">
          {/* De qué va esta parte de la casa. Vivía en la cabecera, al lado del
              logo, pero ahí ocupaba justo el trozo por donde empieza la
              columna de contenido: o cabía el rótulo o el buscador quedaba
              alineado, no las dos cosas. Aquí sigue estando a la vista, encima
              del menú, y la cabecera queda para el logo y la búsqueda. */}
          {rotulo && (
            <div className="mb-4 px-2">
              <p className="text-sm font-semibold leading-tight text-white">{rotulo.titulo}</p>
              <p className="mt-0.5 text-xs leading-snug text-white/45">{rotulo.lema}</p>
            </div>
          )}
          {acciones && <div className="mb-5">{acciones}</div>}
          <Lista items={items} areas={areas} activo={activo} onIr={onIr} badges={badges} />
          <Firma />
        </div>
      </aside>

      {/* Cajón móvil. Se monta siempre para que la transición se vea al
          abrir y al cerrar; cuando está cerrado no recibe pulsaciones. */}
      <div className={`fixed inset-0 z-50 md:hidden ${abierto ? "" : "pointer-events-none"}`} aria-hidden={!abierto}>
        <div
          onClick={onCerrar}
          className={`absolute inset-0 bg-brand-950/50 transition-opacity duration-200 ${abierto ? "opacity-100" : "opacity-0"}`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className={`absolute inset-y-0 left-0 flex w-[17.5rem] max-w-[86vw] flex-col shadow-elevada transition-transform duration-200 ${fondoOscuro} ${
            abierto ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <img src={logoBlanco} alt="CUIDA" className="h-7 w-auto" />
            <button onClick={onCerrar} className="rounded-xl p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar menú">
              <IconX className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto barra-fina px-3 pb-5">
            <QuienEres />
            {cabecera && <div className="mb-4">{cabecera}</div>}
            {acciones && <div className="mb-5">{acciones}</div>}
            <Lista items={items} areas={areas} activo={activo} onIr={onIr} badges={badges} />
            <Firma />
          </div>
        </div>
      </div>

      {/* La barra de abajo del móvil: lo que se toca todos los días, al
          alcance del pulgar, sin tener que abrir el cajón. */}
      {pestanasMovil && pestanasMovil.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg">
            {pestanasMovil.map((n) => {
              const seleccionado = activo === n.key;
              const badge = badges?.[n.key];
              return (
                <button
                  key={n.key}
                  onClick={() => onIr(n.key)}
                  aria-current={seleccionado ? "page" : undefined}
                  className={`relative flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition ${
                    seleccionado ? "text-brand-700" : "text-slate-400"
                  }`}
                >
                  <n.icon className="h-5 w-5" />
                  <span className="truncate">{n.label}</span>
                  {badge && badge.valor > 0 && (
                    <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-rose-500" aria-hidden />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => onAbrir?.()}
              className="flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium text-slate-400 transition"
            >
              <IconMenu className="h-5 w-5" />
              Menú
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
