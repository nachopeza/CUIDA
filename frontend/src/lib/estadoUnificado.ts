import type { Solicitud } from "./types.js";

// Estado unificado visible para coordinación (sección "un desplegable con
// cada estado unificado... los estados siguen dando equivocaciones... no
// puede haber 15 estados"): reduce los ~20 valores en crudo de
// Solicitud/Servicio a un pequeño conjunto de fases con color propio,
// reutilizado en la tabla de Solicitudes, las casillas de conteo y la
// ficha — en vez de mostrar el enum de base de datos tal cual.
export type ClaveEstadoUnificado = "revision" | "buscando" | "confirmado" | "en_curso" | "por_verificar" | "validado" | "cerrado" | "cancelado";

export const ESTADOS_UNIFICADOS: { clave: ClaveEstadoUnificado; etiqueta: string; badge: string; dot: string; borde: string; fondo: string }[] = [
  { clave: "revision", etiqueta: "En revisión", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-400", borde: "border-blue-300", fondo: "bg-blue-50" },
  { clave: "buscando", etiqueta: "Buscando profesional", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400", borde: "border-amber-300", fondo: "bg-amber-50" },
  { clave: "confirmado", etiqueta: "Confirmado", badge: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-400", borde: "border-indigo-300", fondo: "bg-indigo-50" },
  { clave: "en_curso", etiqueta: "En curso", badge: "bg-brand-green-100 text-brand-green-700", dot: "bg-brand-green-500", borde: "border-brand-green-300", fondo: "bg-brand-green-50" },
  { clave: "por_verificar", etiqueta: "Por verificar", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-400", borde: "border-orange-300", fondo: "bg-orange-50" },
  { clave: "validado", etiqueta: "Validado", badge: "bg-teal-100 text-teal-700", dot: "bg-teal-400", borde: "border-teal-300", fondo: "bg-teal-50" },
  { clave: "cerrado", etiqueta: "Cerrado", badge: "bg-slate-200 text-slate-700", dot: "bg-slate-400", borde: "border-slate-300", fondo: "bg-slate-50" },
  { clave: "cancelado", etiqueta: "Cancelado", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-400", borde: "border-rose-300", fondo: "bg-rose-50" },
];

const MAPA = new Map(ESTADOS_UNIFICADOS.map((e) => [e.clave, e]));

export function estadoUnificadoDeSolicitud(s: Solicitud): ClaveEstadoUnificado {
  if (s.estado === "CANCELADA" || s.servicio?.estado === "CANCELADO") return "cancelado";
  if (!s.servicio) return "revision";
  switch (s.servicio.estado) {
    case "PENDIENTE":
    case "ASIGNADO":
      return "buscando";
    case "CONFIRMADO":
      return "confirmado";
    case "EN_CURSO":
      return "en_curso";
    case "FINALIZADO":
      return "por_verificar";
    case "VALIDADO":
      return "validado";
    case "CERRADO":
      return "cerrado";
    default:
      return "revision";
  }
}

export function infoEstadoUnificado(clave: ClaveEstadoUnificado) {
  return MAPA.get(clave)!;
}
