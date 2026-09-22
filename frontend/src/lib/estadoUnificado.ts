import type { Solicitud } from "./types.js";

// Un único vocabulario de estado para toda la coordinación (sección
// "simplifica estados de solicitudes, que sea más práctico y visual").
// Antes convivían dos sistemas solapados —ocho "estados unificados" y cinco
// "grupos"— y además una incidencia abierta tapaba el estado real: una
// solicitud en curso con incidencia desaparecía de "En proceso". Ahora hay
// cinco fases de trabajo más "Cancelada", y la incidencia es una marca
// transversal (ver `tieneIncidencia`), no un estado.
export type ClaveEstado = "nueva" | "buscando" | "en_curso" | "por_verificar" | "finalizada" | "cancelada";

export interface InfoEstado {
  clave: ClaveEstado;
  etiqueta: string;
  // Qué tiene que hacer coordinación en esta fase: es lo que convierte el
  // color en algo accionable en vez de decorativo.
  ayuda: string;
  badge: string;
  dot: string;
  borde: string;
  fondo: string;
  texto: string;
}

export const ESTADOS: InfoEstado[] = [
  {
    clave: "nueva",
    etiqueta: "Nueva",
    ayuda: "Pendiente de revisar y aceptar",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-400",
    borde: "border-blue-300",
    fondo: "bg-blue-50",
    texto: "text-blue-700",
  },
  {
    clave: "buscando",
    etiqueta: "Buscando",
    ayuda: "Aceptada, falta cerrar profesional",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400",
    borde: "border-amber-300",
    fondo: "bg-amber-50",
    texto: "text-amber-700",
  },
  {
    clave: "en_curso",
    etiqueta: "En curso",
    ayuda: "Con profesional, en marcha",
    badge: "bg-brand-green-100 text-brand-green-700",
    dot: "bg-brand-green-500",
    borde: "border-brand-green-300",
    fondo: "bg-brand-green-50",
    texto: "text-brand-green-700",
  },
  {
    clave: "por_verificar",
    etiqueta: "Por verificar",
    ayuda: "Terminada, falta tu visto bueno",
    badge: "bg-orange-100 text-orange-700",
    dot: "bg-orange-400",
    borde: "border-orange-300",
    fondo: "bg-orange-50",
    texto: "text-orange-700",
  },
  {
    clave: "finalizada",
    etiqueta: "Finalizada",
    ayuda: "Verificada y lista para facturar",
    badge: "bg-teal-100 text-teal-700",
    dot: "bg-teal-400",
    borde: "border-teal-300",
    fondo: "bg-teal-50",
    texto: "text-teal-700",
  },
  {
    clave: "cancelada",
    etiqueta: "Cancelada",
    ayuda: "Anulada por la familia o por coordinación",
    badge: "bg-slate-200 text-slate-600",
    dot: "bg-slate-400",
    borde: "border-slate-300",
    fondo: "bg-slate-100",
    texto: "text-slate-600",
  },
];

const MAPA = new Map(ESTADOS.map((e) => [e.clave, e]));

export function estadoDeSolicitud(s: Solicitud): ClaveEstado {
  if (s.estado === "CANCELADA" || s.servicio?.estado === "CANCELADO") return "cancelada";
  if (!s.servicio) return "nueva";
  switch (s.servicio.estado) {
    case "PENDIENTE":
    case "ASIGNADO":
      return "buscando";
    case "CONFIRMADO":
    case "EN_CURSO":
      return "en_curso";
    case "FINALIZADO":
      return "por_verificar";
    case "VALIDADO":
    case "CERRADO":
      return "finalizada";
    default:
      return "nueva";
  }
}

// La incidencia no sustituye al estado: una solicitud puede estar en curso
// y además tener una incidencia abierta, y coordinación necesita ver las dos
// cosas a la vez.
export function tieneIncidencia(s: Solicitud): boolean {
  return Boolean(s.servicio?.incidencias?.some((i) => !["RESUELTA", "CERRADA"].includes(i.estado)));
}

export function infoEstado(clave: ClaveEstado): InfoEstado {
  return MAPA.get(clave)!;
}
