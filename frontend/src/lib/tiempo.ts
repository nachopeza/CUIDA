// Vocabulario del motor de tiempo, en un solo sitio.
//
// Una jornada tiene cuatro tiempos y confundirlos es lo que rompe estos
// sistemas: lo acordado no es lo fichado, y lo fichado no tiene por qué ser
// lo que se cobra. Cada uno se nombra siempre igual en toda la aplicación.

export const NOMBRE_TIEMPO = {
  programados: "Acordado",
  reales: "Fichado",
  facturables: "Se cobra",
  liquidables: "Se paga",
} as const;

export const AYUDA_TIEMPO = {
  programados: "Lo que se pactó en el plan del servicio",
  reales: "Lo que marcó el fichaje de entrada y salida",
  facturables: "El tiempo que entra en la factura de la familia",
  liquidables: "El tiempo que entra en la liquidación del profesional",
} as const;

export const NOMBRE_BASE: Record<string, string> = {
  PROGRAMADO: "el tiempo acordado",
  REAL: "el tiempo fichado",
  MENOR: "el menor de los dos",
  MAYOR: "el mayor de los dos",
};

export const NOMBRE_REDONDEO: Record<string, string> = {
  NINGUNO: "sin redondear",
  ARRIBA: "hacia arriba",
  ABAJO: "hacia abajo",
  CERCANO: "al más cercano",
};

export const MOTIVOS_DESVIACION = [
  { valor: "PETICION_CLIENTE", etiqueta: "Lo pidió la familia" },
  { valor: "NECESIDAD_DEL_SERVICIO", etiqueta: "Lo necesitaba el servicio" },
  { valor: "INCIDENCIA", etiqueta: "Hubo una incidencia" },
  { valor: "ERROR_DE_FICHAJE", etiqueta: "Error de fichaje" },
  { valor: "OTRO", etiqueta: "Otro" },
] as const;

export function duracion(minutos: number | null | undefined): string {
  if (minutos == null) return "—";
  const h = Math.floor(Math.abs(minutos) / 60);
  const m = Math.abs(minutos) % 60;
  const signo = minutos < 0 ? "−" : "";
  if (h === 0) return `${signo}${m} min`;
  if (m === 0) return `${signo}${h} h`;
  return `${signo}${h} h ${m} min`;
}

export function euros(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2).replace(".", ",")} €`;
}

export interface Desglose {
  visita: {
    id: string;
    codigo: string;
    fecha: string;
    estado: string;
    horaInicioProg: string | null;
    horaFinProg: string | null;
    horaInicioReal: string | null;
    horaFinReal: string | null;
    cierreManual: boolean;
  };
  tiempos: {
    programados: number | null;
    reales: number | null;
    facturables: number | null;
    liquidables: number | null;
    retrasoMinutos: number | null;
    desviacionMinutos: number | null;
    explicacion: string | null;
  };
  regla: {
    baseCobro: string;
    baseLiquidacion: string;
    redondeoMinutos: number;
    redondeoModo: string;
    minimoMinutos: number;
  };
  tarifa: { origen: string; precioHoraCliente?: number; precioHoraProfesional?: number } | null;
  economia: {
    cliente?: { minutos: number; precioHora: number; importe: number; cuenta: string };
    profesional?: { minutos: number; precioHora: number; importe: number; cuenta: string };
    cuida?: { importe: number; precioHora: number; cuenta: string };
  } | null;
  definitivo: boolean;
  ajuste: { estado: string; motivo: string | null; nota: string | null; decididoAt: string | null };
  // Dónde está ya documentada esta jornada. Si está en una factura emitida o
  // en una liquidación aprobada, lo que se decida ahora no cambia esos
  // documentos: entra como regularización en los siguientes.
  documentada?: { facturada: string | null; liquidada: boolean };
  correcciones: { campo: string; valorAnterior: string | null; valorNuevo: string | null; motivo: string; quien: string; cuando: string }[];
}
