import type { Carencia, DocumentoProfesional, TipoAusencia, TipoContrato, TipoDocumento } from "./types.js";

// Vocabulario de personal, en un solo sitio para que la pestaña de Equipo y
// el panel del profesional digan exactamente lo mismo.

export const ETIQUETA_DOCUMENTO: Record<TipoDocumento, string> = {
  DNI: "DNI o NIE",
  DELITOS_SEXUALES: "Certificado de delitos sexuales",
  TITULACION: "Titulación",
  CONTRATO: "Contrato",
  ALTA_SEGURIDAD_SOCIAL: "Alta en la Seguridad Social",
  CARNE_CONDUCIR: "Carné de conducir",
  SEGURO: "Seguro",
  FORMACION: "Formación",
  OTRO: "Otro documento",
};

// Los que impiden trabajar si faltan. No es una política de la empresa: el
// certificado de delitos sexuales es obligatorio por ley para trabajar con
// personas vulnerables.
export const DOCUMENTOS_OBLIGATORIOS: TipoDocumento[] = ["DNI", "DELITOS_SEXUALES"];

export const ETIQUETA_CONTRATO: Record<TipoContrato, string> = {
  INDEFINIDO: "Indefinido",
  TEMPORAL: "Temporal",
  FIJO_DISCONTINUO: "Fijo discontinuo",
  PRACTICAS: "Prácticas",
  MERCANTIL: "Mercantil (autónoma)",
};

export const ETIQUETA_AUSENCIA: Record<TipoAusencia, string> = {
  VACACIONES: "Vacaciones",
  BAJA_MEDICA: "Baja médica",
  PERMISO_RETRIBUIDO: "Permiso retribuido",
  ASUNTOS_PROPIOS: "Asuntos propios",
  EXCEDENCIA: "Excedencia",
  OTRO: "Otra ausencia",
};

export const DIAS_DE_AVISO = 30;

export type EstadoVigencia = "vigente" | "por_caducar" | "caducado" | "sin_fecha";

export function vigenciaDe(fechaCaducidad: string | null | undefined): EstadoVigencia {
  if (!fechaCaducidad) return "sin_fecha";
  const dias = Math.floor((new Date(fechaCaducidad).getTime() - Date.now()) / 86400000);
  if (dias < 0) return "caducado";
  if (dias <= DIAS_DE_AVISO) return "por_caducar";
  return "vigente";
}

export function diasHasta(fecha: string): number {
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
}

export const TONO_VIGENCIA: Record<EstadoVigencia, string> = {
  vigente: "bg-brand-green-100 text-brand-green-700",
  por_caducar: "bg-amber-100 text-amber-700",
  caducado: "bg-rose-100 text-rose-700",
  sin_fecha: "bg-slate-100 text-slate-600",
};

export function textoVigencia(d: DocumentoProfesional): string {
  const estado = vigenciaDe(d.fechaCaducidad);
  if (estado === "sin_fecha") return "Sin caducidad";
  const dias = diasHasta(d.fechaCaducidad!);
  if (estado === "caducado") return `Caducado hace ${Math.abs(dias)} días`;
  if (estado === "por_caducar") return `Caduca en ${dias} días`;
  return `Vigente hasta ${new Date(d.fechaCaducidad!).toLocaleDateString("es-ES")}`;
}

// Cómo se cuenta una carencia. Se separa "no puede trabajar" de "hay que
// renovar": mezclarlas haría que un carné de conducir a punto de caducar
// pareciera tan grave como no tener el certificado de delitos sexuales.
export function esImpedimento(c: Carencia): boolean {
  return c.motivo !== "por_caducar";
}

export function textoCarencia(c: Carencia): string {
  if (c.motivo === "falta") return `Falta ${c.etiqueta.toLowerCase()}`;
  // Anotado pero sin el papel detrás. Se dice distinto de "falta" a propósito:
  // en el expediente se ve la fila y parece que está, y no está.
  if (c.motivo === "sin_archivo") return `${c.etiqueta} sin el documento subido`;
  if (c.motivo === "caducado") return `${c.etiqueta} caducado`;
  return `${c.etiqueta} caduca pronto`;
}
