// Exportación CSV (sección "en todos los listados incluye selección y
// edición y descarga para exportación"): una función mínima y genérica,
// sin librería externa — un listado siempre cabe en filas de texto plano.

export interface ColumnaCSV<T> {
  encabezado: string;
  valor: (fila: T) => string | number | null | undefined;
}

function escaparCelda(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

export function exportarCSV<T>(filas: T[], columnas: ColumnaCSV<T>[], nombreArchivo: string): void {
  const cabecera = columnas.map((c) => escaparCelda(c.encabezado)).join(",");
  const lineas = filas.map((fila) => columnas.map((c) => escaparCelda(String(c.valor(fila) ?? ""))).join(","));
  const csv = [cabecera, ...lineas].join("\n");
  // BOM para que Excel detecte UTF-8 y no destroce los acentos.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
