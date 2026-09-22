import type { Solicitud } from "./types.js";

// Un único vocabulario de estado para toda la coordinación (sección
// "simplifica estados de solicitudes, que sea más práctico y visual").
// Antes convivían dos sistemas solapados —ocho "estados unificados" y cinco
// "grupos"— y además una incidencia abierta tapaba el estado real: una
// solicitud en curso con incidencia desaparecía de "En proceso". Ahora hay
// cinco fases de trabajo más "Cancelada", y la incidencia es una marca
// transversal (ver `tieneIncidencia`), no un estado.
export type ClaveEstado = "nueva" | "buscando" | "por_confirmar" | "en_curso" | "por_verificar" | "finalizada" | "cancelada";

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
    // Ya hay alguien elegido pero todavía no ha dicho que sí. Antes caía en
    // "Buscando" junto a las que no tienen a nadie, y eran dos situaciones
    // muy distintas: en una hay que salir a buscar profesional y en la otra
    // sólo hay que esperar (o recordárselo).
    clave: "por_confirmar",
    etiqueta: "Por confirmar",
    ayuda: "Asignada a un profesional, pendiente de que la confirme",
    badge: "bg-violet-100 text-violet-700",
    dot: "bg-violet-400",
    borde: "border-violet-300",
    fondo: "bg-violet-50",
    texto: "text-violet-700",
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
    // Terminada del todo: el color no es otro verde. El teal que tenía se
    // confundía con el verde de "en curso" y las finalizadas parecían seguir
    // en marcha; el gris grafito se lee como "esto ya está cerrado".
    etiqueta: "Finalizada",
    ayuda: "Verificada y lista para facturar",
    badge: "bg-slate-700 text-white",
    dot: "bg-slate-600",
    borde: "border-slate-500",
    fondo: "bg-slate-100",
    texto: "text-slate-700",
  },
  {
    clave: "cancelada",
    // La cancelación no es un cierre normal: era gris, igual que cualquier
    // cosa apagada, y no decía que algo se había caído.
    etiqueta: "Cancelada",
    ayuda: "Anulada por la familia o por coordinación",
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-400",
    borde: "border-rose-300",
    fondo: "bg-rose-50",
    texto: "text-rose-700",
  },
];

const MAPA = new Map(ESTADOS.map((e) => [e.clave, e]));

export function estadoDeSolicitud(s: Solicitud): ClaveEstado {
  if (s.estado === "CANCELADA" || s.servicio?.estado === "CANCELADO") return "cancelada";
  if (!s.servicio) return "nueva";
  switch (s.servicio.estado) {
    case "PENDIENTE":
      return "buscando";
    case "ASIGNADO":
      return "por_confirmar";
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
