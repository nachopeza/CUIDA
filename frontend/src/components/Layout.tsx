import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth.js";
import { NotificationBell } from "./NotificationBell.js";
import { MiCuentaModal } from "./MiCuentaModal.js";
import logoCuida from "../assets/logo-cuida.svg";

const ROL_LABEL: Record<string, string> = {
  PERSONA: "Persona atendida",
  FAMILIAR: "Familiar autorizado",
  PROFESIONAL: "Profesional",
  COORDINADOR: "Coordinador",
  ORGANIZACION: "Organización",
  ADMIN: "Administrador",
  SUPERADMIN: "Superadmin",
};

// Subtítulo del área según el rol, para que quede claro en qué parte de la
// app está cada quien (sustituye a la etiqueta genérica "prototipo · fase 1").
const AREA_LABEL: Record<string, string> = {
  PERSONA: "Tu espacio",
  FAMILIAR: "Seguimiento familiar",
  PROFESIONAL: "Panel profesional",
  COORDINADOR: "Coordinación",
  ORGANIZACION: "Coordinación",
  ADMIN: "Coordinación",
  SUPERADMIN: "Coordinación",
};

// El filete que separa el logo de la denominación de la interfaz solo se
// pone donde esa denominación es parte del trabajo (sección "esto solo se ve
// en los perfiles de coordinación y de profesionales; en el resto se ve
// solamente el logo").
const CON_DENOMINACION = ["PROFESIONAL", "COORDINADOR", "ORGANIZACION", "ADMIN", "SUPERADMIN"];

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const muestraDenominacion = usuario ? CON_DENOMINACION.includes(usuario.rol) : false;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logoCuida} alt="CUIDA" className="h-9 w-auto sm:h-10" />
            {muestraDenominacion && (
              <>
                <span className="h-6 w-px bg-slate-200" aria-hidden />
                <span className="text-sm font-medium text-slate-500">{AREA_LABEL[usuario!.rol] ?? ""}</span>
              </>
            )}
          </div>
          {usuario && (
            <div className="flex items-center gap-3 text-sm">
              <NotificationBell />
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuAbierto((v) => !v)}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
                    {usuario.email.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">
                    {usuario.email} <span className="text-slate-400">· {ROL_LABEL[usuario.rol] ?? usuario.rol}</span>
                  </span>
                  <span className="text-xs text-slate-400">▾</span>
                </button>
                {menuAbierto && (
                  <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                    <button
                      onClick={() => {
                        setCuentaAbierta(true);
                        setMenuAbierto(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Mi cuenta
                    </button>
                    <button onClick={logout} className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      {cuentaAbierta && <MiCuentaModal onClose={() => setCuentaAbierta(false)} />}
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-slate-700">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
