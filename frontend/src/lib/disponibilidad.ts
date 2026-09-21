export interface Disponibilidad {
  dias: string[];
  franja: string;
}

export const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"] as const;
export const FRANJAS_DISPONIBILIDAD = ["Mañana", "Tarde", "Todo el día"] as const;

const VACIA: Disponibilidad = { dias: [], franja: "Mañana" };

// Disponibilidad del profesional (sección "incluir disponibilidad"): se
// guarda como JSON en un campo de texto (Profesional.disponibilidad) para
// no tener que migrar otra vez si la forma cambia; aquí solo se
// parsea/serializa de forma tolerante a datos ausentes o corruptos.
export function parsearDisponibilidad(raw: string | null | undefined): Disponibilidad {
  if (!raw) return VACIA;
  try {
    const d = JSON.parse(raw);
    return { dias: Array.isArray(d.dias) ? d.dias : [], franja: typeof d.franja === "string" ? d.franja : "Mañana" };
  } catch {
    return VACIA;
  }
}

export function serializarDisponibilidad(d: Disponibilidad): string {
  return JSON.stringify(d);
}
