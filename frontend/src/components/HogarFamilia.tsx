import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { euros } from "../lib/economia.js";
import type { ContratoHogar } from "../lib/types.js";
import { Avatar } from "./Avatar.js";
import { Hojas } from "./identidad.js";
import { IconBroom, IconCheck, IconClock, IconFile } from "./icons.js";

// Lo que ve la familia de su empleada de hogar: quién es, si ya puede empezar,
// qué trámites quedan y cómo va la nómina. Sin tener que llamar para preguntar.

const nombreMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-ES", { month: "long" });
};

export function HogarFamilia() {
  const { token } = useAuth();
  const [contratos, setContratos] = useState<ContratoHogar[]>([]);
  useEffect(() => {
    api.get<ContratoHogar[]>("/hogar", token).then((cs) => setContratos(cs.filter((c) => c.estado !== "FINALIZADO"))).catch(() => setContratos([]));
  }, [token]);
  if (contratos.length === 0) return null;

  return (
    <div className="space-y-3">
      {contratos.map((c) => {
        const contables = c.tramites.filter((t) => t.estado !== "NO_APLICA");
        const hechos = contables.filter((t) => t.estado === "HECHO").length;
        const pendientes = contables.filter((t) => t.estado !== "HECHO");
        const ultima = c.nominas[0];
        return (
          <section key={c.id} className="relative overflow-hidden rounded-tarjeta border border-brand-green-100 bg-gradient-to-br from-brand-green-50 via-white to-brand-50 p-5 shadow-tarjeta">
            <Hojas className="-right-4 -top-8 h-36" />
            <div className="relative flex items-start gap-4">
              <Avatar foto={c.profesional?.foto} nombre={c.trabajadoraNombre} apellidos={c.trabajadoraApellidos} className="h-14 w-14 !text-base ring-4 ring-white" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-green-700">
                  <IconBroom className="h-3.5 w-3.5" /> Empleada de hogar
                </p>
                <h3 className="text-lg font-bold text-brand-900">
                  {c.trabajadoraNombre} {c.trabajadoraApellidos}
                </h3>
                <p className="text-sm text-slate-600">
                  En casa de {c.persona.nombre} · {c.horasSemanales} h a la semana{c.horario ? ` · ${c.horario}` : ""}
                </p>
              </div>
            </div>

            <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/80 p-3">
                <p className="text-xs font-semibold text-brand-900">{c.estado === "ACTIVO" ? "Dada de alta y con contrato" : "Estamos con los trámites"}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-green-500" style={{ width: `${contables.length ? (hechos / contables.length) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-slate-500">
                    {hechos}/{contables.length}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {pendientes.slice(0, 3).map((t) => (
                    <li key={t.id} className="flex items-center gap-1.5">
                      <IconClock className="h-3.5 w-3.5 text-amber-500" /> {t.titulo}
                    </li>
                  ))}
                  {pendientes.length === 0 && (
                    <li className="flex items-center gap-1.5 text-brand-green-700">
                      <IconCheck className="h-3.5 w-3.5" /> Todo en regla
                    </li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl bg-white/80 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
                  <IconFile className="h-3.5 w-3.5" /> Nómina
                </p>
                {ultima ? (
                  <>
                    <p className="mt-1 text-lg font-bold tabular-nums text-brand-900">{euros(ultima.bruto)}</p>
                    <p className="text-xs text-slate-500">
                      {nombreMes(ultima.mes)} · {ultima.estado === "PAGADA" ? "pagada" : ultima.estado === "ENVIADA" ? "lista para pagar" : "la estamos preparando"}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">La primera nómina llegará cuando empiece a trabajar.</p>
                )}
                <p className="mt-2 text-[11px] text-slate-400">Nuestra gestión: {euros(c.cuotaGestionMensual)} al mes + IVA, en tu factura.</p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
