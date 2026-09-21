import { infoEstadoUnificado, type ClaveEstadoUnificado } from "../lib/estadoUnificado.js";

// Colores diferenciados por estado (sección "diferenciar color en curso,
// validado, confirmado — deben diferenciarse y simplificarse"): antes
// EN_CURSO/FINALIZADO/VALIDADO compartían el mismo verde y eran
// indistinguibles de un vistazo. Cada fase real tiene ahora su propio color.
const COLORES: Record<string, string> = {
  BORRADOR: "bg-slate-200 text-slate-700",
  ENVIADA: "bg-blue-100 text-blue-700",
  EN_REVISION: "bg-blue-100 text-blue-700",
  BUSCANDO: "bg-amber-100 text-amber-700",
  PROPUESTA: "bg-amber-100 text-amber-700",
  ACEPTADA: "bg-brand-green-100 text-brand-green-700",
  PENDIENTE: "bg-slate-200 text-slate-700",
  ASIGNADO: "bg-amber-100 text-amber-700",
  CONFIRMADO: "bg-indigo-100 text-indigo-700",
  EN_CURSO: "bg-brand-green-100 text-brand-green-700",
  // Finalizado por el profesional pero todavía no verificado por
  // coordinación: naranja de aviso, no verde de "ya está resuelto".
  FINALIZADO: "bg-orange-100 text-orange-700",
  FINALIZADA: "bg-orange-100 text-orange-700",
  // Verificado por coordinación pero todavía no cerrado/facturado: color
  // propio (teal), distinto del verde de "en curso" y del naranja de
  // "por verificar".
  VALIDADO: "bg-teal-100 text-teal-700",
  CERRADO: "bg-slate-300 text-slate-800",
  CERRADA: "bg-slate-300 text-slate-800",
  CANCELADA: "bg-rose-100 text-rose-700",
  CANCELADO: "bg-rose-100 text-rose-700",
  PAGADO: "bg-brand-green-100 text-brand-green-700",
  PROGRAMADA: "bg-slate-200 text-slate-700",
  INCIDENCIA: "bg-rose-100 text-rose-700",
  REVISADA: "bg-slate-300 text-slate-800",
  NUEVA: "bg-rose-100 text-rose-700",
  ASIGNADA: "bg-amber-100 text-amber-700",
  EN_RESOLUCION: "bg-amber-100 text-amber-700",
  RESUELTA: "bg-brand-green-100 text-brand-green-700",
};

export function EstadoBadge({ estado }: { estado: string }) {
  const clase = COLORES[estado] ?? "bg-slate-200 text-slate-700";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${clase}`}>{estado.replace(/_/g, " ")}</span>;
}

// Badge del estado unificado (sección "un desplegable con cada estado
// unificado... simple, minimalista"): muestra la fase visible en vez del
// enum en crudo de Solicitud/Servicio.
export function EstadoUnificadoBadge({ clave }: { clave: ClaveEstadoUnificado }) {
  const info = infoEstadoUnificado(clave);
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${info.badge}`}>{info.etiqueta}</span>;
}
