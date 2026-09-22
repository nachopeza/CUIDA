// Mismo reparto que en el backend (backend/src/services/economia.ts), para
// poder enseñar las cifras mientras se teclea sin ir y volver al servidor.
// El backend sigue siendo el que manda: esto solo previsualiza.

export interface Reparto {
  minutos: number;
  precioHora: number;
  comisionPorcentaje: number;
  ivaPorcentaje: number;
  base: number;
  comision: number;
  importeProfesional: number;
  ivaImporte: number;
  totalConIva: number;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularReparto(o: {
  minutos: number;
  precioHora: number;
  comisionPorcentaje: number;
  ivaPorcentaje?: number;
}): Reparto {
  const minutos = Math.max(0, Math.round(o.minutos));
  const precioHora = Math.max(0, o.precioHora);
  const comisionPorcentaje = Math.min(100, Math.max(0, o.comisionPorcentaje));
  const ivaPorcentaje = Math.max(0, o.ivaPorcentaje ?? 0);

  const base = redondear((minutos / 60) * precioHora);
  const comision = redondear(base * (comisionPorcentaje / 100));
  const importeProfesional = redondear(base - comision);
  const ivaImporte = redondear(base * (ivaPorcentaje / 100));

  return { minutos, precioHora, comisionPorcentaje, ivaPorcentaje, base, comision, importeProfesional, ivaImporte, totalConIva: redondear(base + ivaImporte) };
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Minutos entre dos horas "HH:MM". Si la de fin es anterior, es turno de
// noche y cae al día siguiente.
export function minutosEntre(horaInicio?: string | null, horaFin?: string | null): number | null {
  if (!horaInicio || !horaFin || !HORA.test(horaInicio) || !HORA.test(horaFin)) return null;
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);
  let minutos = hf * 60 + mf - (hi * 60 + mi);
  if (minutos <= 0) minutos += 24 * 60;
  return minutos;
}

export function minutosFichados(inicio?: string | null, fin?: string | null): number | null {
  if (!inicio || !fin) return null;
  return Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000));
}

// Duración en horas y minutos, que es como se habla de una jornada. "2,5 h"
// obliga a traducir; "2 h 30 min" no.
export function duracion(minutos: number): string {
  const signo = minutos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${signo}${m} min`;
  if (m === 0) return `${signo}${h} h`;
  return `${signo}${h} h ${m} min`;
}

export function euros(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function horaDe(iso?: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type Desvio = "exacto" | "de_mas" | "de_menos";

// Cómo de lejos está lo fichado de lo acordado. El margen evita que un
// minuto de diferencia se lea como un problema: nadie ficha al segundo.
export function compararConAcordado(fichados: number, acordados: number, margenMinutos = 5): { desvio: Desvio; diferencia: number } {
  const diferencia = fichados - acordados;
  if (Math.abs(diferencia) <= margenMinutos) return { desvio: "exacto", diferencia };
  return { desvio: diferencia > 0 ? "de_mas" : "de_menos", diferencia };
}
