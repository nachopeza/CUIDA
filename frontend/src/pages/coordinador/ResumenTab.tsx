import { ActividadFeed } from "./ActividadTab.js";
import { IconAlert, IconBriefcase, IconCalendar, IconClipboard } from "../../components/icons.js";
import type { Incidencia, Servicio, Solicitud } from "../../lib/types.js";

interface Props {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  incidencias: Incidencia[];
  kpis: { label: string; valor: number; onClick: () => void }[];
  onIrA: (tab: string, filtro?: string) => void;
}

interface Atencion {
  label: string;
  detalle: string;
  valor: number;
  icon: (p: { className?: string }) => JSX.Element;
  tono: "rose" | "amber";
  onClick: () => void;
}

// Portada del panel de coordinación (sección "el panel de coordinación no
// es nada intuitivo"): de un vistazo, cuántas solicitudes hay, qué necesita
// acción ahora mismo, y qué ha pasado últimamente — en vez de aterrizar
// directamente en una lista sin contexto.
export function ResumenTab({ solicitudes, servicios, incidencias, kpis, onIrA }: Props) {
  const cancelacionesPendientes = incidencias.filter((i) => i.tipo === "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado)).length;
  const incidenciasAbiertas = incidencias.filter((i) => i.tipo !== "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado)).length;
  const serviciosDisponibles = servicios.filter((s) => s.estado === "PENDIENTE" && !s.profesionalId).length;
  const visitasPorVerificar = solicitudes.reduce(
    (acc, s) => acc + (s.servicio?.visitas?.filter((v) => v.estado === "FINALIZADA").length ?? 0),
    0,
  );

  const atencion: Atencion[] = [
    {
      label: "Cancelaciones pendientes",
      detalle: "esperando que las corrobores con la familia",
      valor: cancelacionesPendientes,
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("incidencias"),
    },
    {
      label: "Incidencias abiertas",
      detalle: "sin resolver",
      valor: incidenciasAbiertas,
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("incidencias"),
    },
    {
      label: "Servicios sin cubrir",
      detalle: "publicados, esperando un profesional",
      valor: serviciosDisponibles,
      icon: IconBriefcase,
      tono: "amber" as const,
      onClick: () => onIrA("solicitudes", "gestion"),
    },
    {
      label: "Visitas por verificar",
      detalle: "finalizadas, pendientes de archivar",
      valor: visitasPorVerificar,
      icon: IconCalendar,
      tono: "amber" as const,
      onClick: () => onIrA("calendario"),
    },
  ].filter((a) => a.valor > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={k.onClick}
            className="rounded-lg border border-slate-200 bg-white p-3 text-center transition hover:border-slate-400 hover:bg-slate-50"
          >
            <p className="text-2xl font-semibold text-slate-800">{k.valor}</p>
            <p className="text-xs text-slate-500">{k.label}</p>
          </button>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Necesita tu atención</h3>
        {atencion.length === 0 ? (
          <div className="rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">
            Todo al día — no hay nada pendiente de tu acción ahora mismo.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {atencion.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-slate-50 ${
                  a.tono === "rose" ? "border-rose-200 bg-rose-50/40" : "border-amber-200 bg-amber-50/40"
                }`}
              >
                <a.icon className={`mt-0.5 h-5 w-5 shrink-0 ${a.tono === "rose" ? "text-rose-600" : "text-amber-600"}`} />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {a.valor} {a.label.toLowerCase()}
                  </p>
                  <p className="text-xs text-slate-500">{a.detalle}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Actividad reciente</h3>
          <button onClick={() => onIrA("actividad")} className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-800">
            <IconClipboard className="h-3.5 w-3.5" /> Ver todo
          </button>
        </div>
        <ActividadFeed limit={6} sinTitulo />
      </div>
    </div>
  );
}
