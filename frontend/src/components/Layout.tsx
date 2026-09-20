import type { ReactNode } from "react";
import { useAuth } from "../lib/auth.js";
import { NotificationBell } from "./NotificationBell.js";
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

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logoCuida} alt="CUIDA" className="h-9 w-auto sm:h-10" />
            {usuario && <span className="text-sm font-medium text-slate-500">{AREA_LABEL[usuario.rol] ?? ""}</span>}
          </div>
          {usuario && (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-slate-600 sm:inline">
                {usuario.email} <span className="text-slate-400">· {ROL_LABEL[usuario.rol] ?? usuario.rol}</span>
              </span>
              <NotificationBell />
              <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-100">
                Salir
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
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
