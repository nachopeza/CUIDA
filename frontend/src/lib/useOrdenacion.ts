import { useMemo, useState } from "react";

export type Direccion = "asc" | "desc";

// Ordenación por columna reutilizable (sección "un botón para ordenar...
// poder ver por columna que estén ordenados por id, fecha, persona,
// servicio, estado, profesional, y que esto se aplique en todas las
// listas"): cada tabla declara cómo se extrae el valor de cada columna y el
// hook se encarga del resto.
export function useOrdenacion<T>(filas: T[], valores: Record<string, (fila: T) => string | number | null | undefined>, campoInicial?: string) {
  const [campo, setCampo] = useState<string | null>(campoInicial ?? null);
  const [direccion, setDireccion] = useState<Direccion>("asc");

  function ordenarPor(nuevoCampo: string) {
    if (campo === nuevoCampo) {
      setDireccion((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCampo(nuevoCampo);
      setDireccion("asc");
    }
  }

  const ordenadas = useMemo(() => {
    if (!campo || !valores[campo]) return filas;
    const extraer = valores[campo];
    const copia = [...filas];
    copia.sort((a, b) => {
      const va = extraer(a);
      const vb = extraer(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
      return direccion === "asc" ? cmp : -cmp;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, campo, direccion]);

  return { ordenadas, campo, direccion, ordenarPor };
}
