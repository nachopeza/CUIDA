import type { SVGProps } from "react";
import { IconCalendar, IconChat, IconClock, IconDoor, IconKey, IconMedical, IconPin, IconTool } from "../components/icons.js";

// Vocabulario de incidencias, en un solo sitio: el motivo es lo que permite
// agrupar y filtrar ("¿cuántos problemas de acceso llevamos este mes?"),
// cosa que con la descripción en texto libre no se podía hacer.
export type MotivoIncidencia = "SALUD" | "ACCESO" | "AUSENCIA" | "RETRASO" | "TRATO" | "MATERIAL" | "HORARIO" | "HORAS" | "OTRO";

export interface InfoMotivo {
  valor: MotivoIncidencia;
  etiqueta: string;
  Icono: (p: SVGProps<SVGSVGElement>) => JSX.Element;
  ayuda: string;
}

export const MOTIVOS_INCIDENCIA: InfoMotivo[] = [
  { valor: "SALUD", etiqueta: "Salud", Icono: IconMedical, ayuda: "Una caída, un malestar, un susto" },
  { valor: "ACCESO", etiqueta: "Acceso", Icono: IconKey, ayuda: "No se puede entrar: llaves, portal, nadie abre" },
  { valor: "AUSENCIA", etiqueta: "Ausencia", Icono: IconDoor, ayuda: "El profesional o la persona no estaban" },
  { valor: "RETRASO", etiqueta: "Retraso", Icono: IconClock, ayuda: "Se ha llegado tarde" },
  { valor: "TRATO", etiqueta: "Trato", Icono: IconChat, ayuda: "Una queja o un desacuerdo sobre el trato" },
  { valor: "MATERIAL", etiqueta: "Material", Icono: IconTool, ayuda: "Falta material o algo está estropeado" },
  { valor: "HORARIO", etiqueta: "Horario", Icono: IconCalendar, ayuda: "Cambio o confusión con el horario" },
  { valor: "HORAS", etiqueta: "Horas", Icono: IconClock, ayuda: "Lo fichado no cuadra con lo acordado" },
  { valor: "OTRO", etiqueta: "Otro", Icono: IconPin, ayuda: "Cualquier otra cosa" },
];

export function infoMotivo(motivo: string | null | undefined): InfoMotivo {
  return MOTIVOS_INCIDENCIA.find((m) => m.valor === motivo) ?? MOTIVOS_INCIDENCIA[MOTIVOS_INCIDENCIA.length - 1];
}
