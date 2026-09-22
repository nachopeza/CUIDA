// El dinero de CUIDA sale del tiempo: un precio por hora y unos minutos
// acordados. Todo lo demás —lo que cobra la profesional, lo que se factura a
// la familia, la comisión— se deriva de ahí. Antes cada sitio hacía su
// cuenta y podían no coincidir.

export interface Reparto {
  minutos: number;
  precioHora: number;
  comisionPorcentaje: number;
  ivaPorcentaje: number;
  // Lo que se le cobra a la familia por el trabajo, sin IVA.
  base: number;
  // La parte de CUIDA.
  comision: number;
  // Lo que se le liquida a la profesional: es lo que ella ve.
  importeProfesional: number;
  ivaImporte: number;
  // Lo que se factura, IVA incluido.
  totalConIva: number;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularReparto(opciones: {
  minutos: number;
  precioHora: number;
  comisionPorcentaje: number;
  ivaPorcentaje?: number;
}): Reparto {
  const minutos = Math.max(0, Math.round(opciones.minutos));
  const precioHora = Math.max(0, opciones.precioHora);
  const comisionPorcentaje = Math.min(100, Math.max(0, opciones.comisionPorcentaje));
  const ivaPorcentaje = Math.max(0, opciones.ivaPorcentaje ?? 0);

  const base = redondear((minutos / 60) * precioHora);
  const comision = redondear(base * (comisionPorcentaje / 100));
  // La profesional cobra el resto exacto: se resta en vez de volver a
  // multiplicar, para que comisión + importe nunca sumen un céntimo de más
  // o de menos que la base.
  const importeProfesional = redondear(base - comision);
  const ivaImporte = redondear(base * (ivaPorcentaje / 100));

  return {
    minutos,
    precioHora,
    comisionPorcentaje,
    ivaPorcentaje,
    base,
    comision,
    importeProfesional,
    ivaImporte,
    totalConIva: redondear(base + ivaImporte),
  };
}

// Minutos entre dos horas "HH:MM" del mismo día. Si la de fin es anterior,
// es un turno de noche y cae al día siguiente.
export function minutosEntre(horaInicio?: string | null, horaFin?: string | null): number | null {
  if (!horaInicio || !horaFin) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!m.test(horaInicio) || !m.test(horaFin)) return null;
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);
  let minutos = hf * 60 + mf - (hi * 60 + mi);
  if (minutos <= 0) minutos += 24 * 60;
  return minutos;
}

// Minutos realmente trabajados en una jornada ya fichada.
export function minutosFichados(inicio?: Date | null, fin?: Date | null): number | null {
  if (!inicio || !fin) return null;
  return Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60000));
}

export function formatearDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
