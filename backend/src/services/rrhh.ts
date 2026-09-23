import type { TipoDocumento } from "@prisma/client";

// Reglas de personal: qué papeles hacen falta para poder trabajar, cuándo
// dejan de valer y qué se considera "a punto de caducar".

// Documentos sin los cuales alguien no debería pisar el domicilio de una
// persona mayor. El certificado de delincuentes sexuales no es una política
// interna de la empresa: en España es obligatorio para cualquier trabajo con
// personas vulnerables, así que su ausencia es un impedimento legal.
export const DOCUMENTOS_OBLIGATORIOS: TipoDocumento[] = ["DNI", "DELITOS_SEXUALES"];

export const ETIQUETA_DOCUMENTO: Record<string, string> = {
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

// Con cuánto margen se avisa. Un mes da tiempo a pedir cita y renovar; menos
// es enterarse tarde.
export const DIAS_DE_AVISO = 30;

export type EstadoVigencia = "vigente" | "por_caducar" | "caducado" | "sin_fecha";

export function vigenciaDe(fechaCaducidad: Date | null | undefined, hoy = new Date()): EstadoVigencia {
  if (!fechaCaducidad) return "sin_fecha";
  const dias = Math.floor((fechaCaducidad.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return "caducado";
  if (dias <= DIAS_DE_AVISO) return "por_caducar";
  return "vigente";
}

export interface Carencia {
  tipo: TipoDocumento;
  etiqueta: string;
  // "sin_archivo" se distingue de "falta" a propósito: no es lo mismo que
  // nadie haya anotado el documento que tenerlo anotado y no tener el papel.
  // El segundo caso es el que engañaba, porque parecía resuelto.
  motivo: "falta" | "sin_archivo" | "caducado" | "por_caducar";
  fechaCaducidad?: Date | null;
}

// Qué le falta a alguien para estar en regla. Se devuelve todo junto, no el
// primer problema: así se reclama de una vez.
// Un documento obligatorio solo cuenta si de verdad está: con su fichero
// subido, o al menos con un enlace a dónde vive. Una fila con el nombre del
// papel y nada detrás dejaba desbloqueado a un profesional sin que CUIDA
// tuviera el certificado que la ley obliga a tener.
function estaDeVerdad(d: { archivoId?: string | null; url?: string | null }): boolean {
  return Boolean(d.archivoId) || Boolean(d.url && d.url.trim());
}

export function carenciasDe(
  documentos: { tipo: TipoDocumento; fechaCaducidad: Date | null; archivoId?: string | null; url?: string | null }[],
  hoy = new Date(),
): Carencia[] {
  const carencias: Carencia[] = [];

  for (const obligatorio of DOCUMENTOS_OBLIGATORIOS) {
    // Vale el más nuevo de cada tipo: renovar aporta uno nuevo, no borra el
    // anterior, y el expediente debe quedarse con los dos.
    const delTipo = documentos.filter((d) => d.tipo === obligatorio && estaDeVerdad(d));
    if (delTipo.length === 0) {
      const anotadoSinPapel = documentos.some((d) => d.tipo === obligatorio);
      carencias.push({
        tipo: obligatorio,
        etiqueta: ETIQUETA_DOCUMENTO[obligatorio],
        motivo: anotadoSinPapel ? "sin_archivo" : "falta",
      });
      continue;
    }
    const vigente = delTipo.some((d) => vigenciaDe(d.fechaCaducidad, hoy) !== "caducado");
    if (!vigente) {
      const ultimo = delTipo.reduce((a, b) => ((a.fechaCaducidad ?? 0) > (b.fechaCaducidad ?? 0) ? a : b));
      carencias.push({ tipo: obligatorio, etiqueta: ETIQUETA_DOCUMENTO[obligatorio], motivo: "caducado", fechaCaducidad: ultimo.fechaCaducidad });
    }
  }

  // Cualquier documento a punto de caducar, obligatorio o no: renovar a
  // tiempo un carné de conducir también evita un problema.
  for (const d of documentos) {
    if (vigenciaDe(d.fechaCaducidad, hoy) === "por_caducar") {
      carencias.push({ tipo: d.tipo, etiqueta: ETIQUETA_DOCUMENTO[d.tipo], motivo: "por_caducar", fechaCaducidad: d.fechaCaducidad });
    }
  }

  return carencias;
}

// ¿Está alguien de baja o de vacaciones ese día? Los extremos cuentan.
export function ausenteEse(dia: Date, ausencias: { desde: Date; hasta: Date; estado: string }[]): boolean {
  const d = new Date(dia);
  d.setHours(12, 0, 0, 0);
  return ausencias.some((a) => {
    if (a.estado !== "APROBADA") return false;
    const desde = new Date(a.desde);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(a.hasta);
    hasta.setHours(23, 59, 59, 999);
    return d >= desde && d <= hasta;
  });
}

export function diasEntre(desde: Date, hasta: Date): number {
  const a = new Date(desde);
  a.setHours(0, 0, 0, 0);
  const b = new Date(hasta);
  b.setHours(0, 0, 0, 0);
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

// Cuántos días laborables del mes caen dentro del periodo. Sirve para estimar
// las horas de contrato que tocaban: no es una nómina, es una referencia para
// poder ver de un vistazo si alguien va corto o pasado de horas.
export function minutosDeContratoDelMes(mes: string, horasSemanales: number | null | undefined): number | null {
  if (!horasSemanales) return null;
  const [anio, mesNum] = mes.split("-").map(Number);
  let laborables = 0;
  const cursor = new Date(anio, mesNum - 1, 1);
  while (cursor.getMonth() === mesNum - 1) {
    const dia = cursor.getDay();
    if (dia >= 1 && dia <= 5) laborables += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  // Jornada diaria = horas semanales repartidas en cinco días.
  return Math.round((horasSemanales / 5) * laborables * 60);
}
