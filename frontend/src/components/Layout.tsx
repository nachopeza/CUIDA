import type { ReactNode } from "react";
import { useAuth } from "../lib/auth.js";

const ROL_LABEL: Record<string, string> = {
  PERSONA: "Persona atendida",
  FAMILIAR: "Familiar autorizado",
  PROFESIONAL: "Profesional",
  COORDINADOR: "Coordinador",
  ORGANIZACION: "Organización",
  ADMIN: "Administrador",
  SUPERADMIN: "Superadmin",
};

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <span className="text-lg font-semibold tracking-tight">CUIDA</span>
            <span className="ml-2 text-sm text-slate-500">prototipo · fase 1</span>
          </div>
          {usuario && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600">
                {usuario.email} <span className="text-slate-400">· {ROL_LABEL[usuario.rol] ?? usuario.rol}</span>
              </span>
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
