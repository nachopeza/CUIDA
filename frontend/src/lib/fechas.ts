// Cuenta atrás visual (sección Usuario: "en los próximos servicios debe
// salirle la fecha o cuenta atrás de manera visual"), en palabras sencillas
// en vez de una fecha ISO o un número de días a secas.
export function cuentaAtras(fechaISO: string): string {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaISO);
  fecha.setHours(0, 0, 0, 0);
  const dias = Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias > 1 && dias <= 7) return `En ${dias} días`;
  if (dias < 0) return "Ya pasó";
  return new Date(fechaISO).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

export function proximosDias(n: number): Date[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function etiquetaDia(fecha: Date): string {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias === 2) return "Pasado mañana";
  return fecha.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

export function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
