import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth.js";
import { NotificationBell } from "./NotificationBell.js";
import { IconChevronDown, IconMenu } from "./icons.js";
import { MiCuentaModal } from "./MiCuentaModal.js";
import logoCuida from "../assets/logo-cuida.svg";
import { MenuMovilContexto } from "../lib/menuMovil.js";
import { RANURA_BUSCADOR } from "../lib/ranuras.js";

const ROL_LABEL: Record<string, string> = {
  PERSONA: "Persona atendida",
  FAMILIAR: "Familiar autorizado",
  PROFESIONAL: "Profesional",
  COORDINADOR: "Coordinadora",
  ORGANIZACION: "Organización",
  ADMIN: "Administrador",
  SUPERADMIN: "Superadmin",
};

function iniciales(email: string, nombre?: string | null) {
  if (nombre) {
    const partes = nombre.trim().split(/\s+/);
    return `${partes[0]?.[0] ?? ""}${partes[1]?.[0] ?? ""}`.toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  // El panel de turno registra aquí cómo se abre su cajón de navegación; la
  // cabecera sólo pinta el botón.
  const [abrirMenuMovil, setAbrirMenuMovil] = useState<(() => void) | null>(null);
  const registrarMenuMovil = useCallback((abrir: (() => void) | null) => setAbrirMenuMovil(() => abrir), []);
  const [irAInicio, setIrAInicio] = useState<(() => void) | null>(null);
  const registrarInicio = useCallback((ir: (() => void) | null) => setIrAInicio(() => ir), []);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  // El nombre de la cuenta si lo hay; si no, lo que haya antes de la arroba,
  // que es mejor que enseñar la dirección entera.
  const nombre = usuario?.nombre?.trim() || usuario?.email.split("@")[0].replace(/[._]/g, " ") || "";

  return (
    <MenuMovilContexto.Provider value={{ abrir: abrirMenuMovil, registrar: registrarMenuMovil, irAInicio, registrarInicio }}>
      <div className="min-h-screen">
        {/* La cabecera: el logo, de qué va esta parte, el buscador en el
            centro y, a la derecha, los avisos y quién eres. Se queda fija
            arriba porque el buscador y la campana se usan desde cualquier
            sitio sin tener que subir la página. */}
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5">
            {/* La hamburguesa, lo primero y sólo en móvil: es donde la mano
                la busca, y así no se va con el desplazamiento. */}
            {usuario && abrirMenuMovil && (
              <button
                onClick={() => abrirMenuMovil()}
                aria-label="Abrir menú"
                className="-ml-1 shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 md:hidden"
              >
                <IconMenu className="h-5 w-5" />
              </button>
            )}

            {/* Exactamente el ancho de la barra lateral (15rem), para que lo
                que venga después —el buscador— empiece justo donde empieza la
                columna de contenido y no flotando en mitad de la cabecera. */}
            <div className="flex shrink-0 items-center gap-3 md:w-[15.55rem]">
              {/* El logo lleva al inicio, como en cualquier sitio. Si nadie ha
                  registrado un inicio (la pantalla de entrar, por ejemplo), se
                  queda como una imagen y no finge ser un botón. */}
              {irAInicio ? (
                <button
                  onClick={() => irAInicio()}
                  aria-label="Ir al inicio"
                  className="-m-1 shrink-0 rounded-lg p-1 transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  <img src={logoCuida} alt="CUIDA" className="block h-8 w-auto sm:h-9" />
                </button>
              ) : (
                <img src={logoCuida} alt="CUIDA" className="block h-8 w-auto sm:h-9" />
              )}
              {/* El rótulo del área ("Centro de coordinación") vivía aquí y
                  decía tres veces lo mismo: ya lo dice la chapa de la cuenta
                  —"Coordinadora"— y el título de cada pantalla. Al fijar este
                  bloque al ancho de la barra para alinear el buscador ya no
                  cabía entero, y un rótulo cortado es peor que ninguno. */}
            </div>

            {/* La ranura del buscador. Cada panel mete aquí el suyo desde su
                propio árbol (ver lib/ranuras.ts): en la cabecera es donde se
                busca, pero quien sabe qué hay que buscar es cada panel.
                Ocupa exactamente la columna ancha del contenido: empieza donde
                empieza ésta y termina donde empieza la columna estrecha. */}
            <div id={RANURA_BUSCADOR} className="hidden w-full min-w-0 flex-1 md:block" />

            {/* La campana y la cuenta ocupan la columna estrecha: 22.5rem más
                el hueco de 1rem de la rejilla, menos los 0.75rem que separan
                los bloques de esta cabecera. Así el buscador corta justo donde
                corta el bloque ancho, medido y no a ojo. */}
            {usuario && (
              <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2 xl:w-[22.75rem]">
                <NotificationBell />
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuAbierto((v) => !v)}
                    className="flex min-w-0 items-center gap-2 rounded-xl py-1 pl-1 pr-1.5 text-sm transition hover:bg-slate-100 sm:pr-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {iniciales(usuario.email, usuario.nombre)}
                    </span>
                    <span className="hidden min-w-0 text-left leading-tight sm:block">
                      <span className="block truncate text-sm font-medium capitalize text-slate-800">{nombre}</span>
                      <span className="block truncate text-xs text-slate-400">{ROL_LABEL[usuario.rol] ?? usuario.rol}</span>
                    </span>
                    <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                  {menuAbierto && (
                    <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden tarjeta shadow-elevada">
                      <p className="truncate border-b border-slate-100 px-3 py-2 text-xs text-slate-400">{usuario.email}</p>
                      <button
                        onClick={() => {
                          setCuentaAbierta(true);
                          setMenuAbierto(false);
                        }}
                        className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        Mi cuenta
                      </button>
                      <button
                        onClick={logout}
                        className="block w-full border-t border-slate-100 px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px]">{children}</main>
        {cuentaAbierta && <MiCuentaModal onClose={() => setCuentaAbierta(false)} />}
      </div>
    </MenuMovilContexto.Provider>
  );
}

// El armazón de un panel: la barra de navegación pegada al borde y el
// contenido al lado, con su aire. Lo comparten los tres paneles para que la
// caja del contenido mida lo mismo en los tres.
export function Panel({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:flex-row">
      {nav}
      <div className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">{children}</div>
    </div>
  );
}

// La caja blanca de toda la vida, ahora con el radio y la sombra de la casa.
export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="tarjeta mb-4 p-4 sm:p-5">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
