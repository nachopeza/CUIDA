// Vocabulario de incidencias, en un solo sitio: el motivo es lo que permite
// agrupar y filtrar ("¿cuántos problemas de acceso llevamos este mes?"),
// cosa que con la descripción en texto libre no se podía hacer.
export type MotivoIncidencia = "SALUD" | "ACCESO" | "AUSENCIA" | "RETRASO" | "TRATO" | "MATERIAL" | "HORARIO" | "OTRO";

export interface InfoMotivo {
  valor: MotivoIncidencia;
  etiqueta: string;
  icono: string;
  ayuda: string;
}

export const MOTIVOS_INCIDENCIA: InfoMotivo[] = [
  { valor: "SALUD", etiqueta: "Salud", icono: "🚑", ayuda: "Una caída, un malestar, un susto" },
  { valor: "ACCESO", etiqueta: "Acceso", icono: "🔑", ayuda: "No se puede entrar: llaves, portal, nadie abre" },
  { valor: "AUSENCIA", etiqueta: "Ausencia", icono: "🚪", ayuda: "El profesional o la persona no estaban" },
  { valor: "RETRASO", etiqueta: "Retraso", icono: "⏰", ayuda: "Se ha llegado tarde" },
  { valor: "TRATO", etiqueta: "Trato", icono: "💬", ayuda: "Una queja o un desacuerdo sobre el trato" },
  { valor: "MATERIAL", etiqueta: "Material", icono: "🧰", ayuda: "Falta material o algo está estropeado" },
  { valor: "HORARIO", etiqueta: "Horario", icono: "📅", ayuda: "Cambio o confusión con el horario" },
  { valor: "OTRO", etiqueta: "Otro", icono: "📌", ayuda: "Cualquier otra cosa" },
];

export function infoMotivo(motivo: string | null | undefined): InfoMotivo {
  return MOTIVOS_INCIDENCIA.find((m) => m.valor === motivo) ?? MOTIVOS_INCIDENCIA[MOTIVOS_INCIDENCIA.length - 1];
}
