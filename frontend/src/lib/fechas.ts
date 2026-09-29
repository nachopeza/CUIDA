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
  return diaDe(fecha);
}

// El día del calendario de una fecha, tal como lo ve quien mira.
//
// Cortar la cadena ISO en el décimo carácter da el día en UTC, y una jornada
// guardada a la medianoche de España (22:00 UTC de la víspera) salía con el día
// anterior: la del miércoles se trataba como de hoy el martes por la noche, con
// su botón de fichar y su "llevas 10 h de retraso". El día es el de la zona de
// quien lo mira, que es el que se lee en pantalla.
export function diaDe(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return typeof iso === "string" ? iso.slice(0, 10) : "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
