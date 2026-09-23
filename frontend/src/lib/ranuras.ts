import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Ranuras
//
// Hay piezas que se pintan en la cabecera pero las arma cada panel: el
// buscador global sabe buscar personas y solicitudes porque el panel de
// coordinación ya las tiene cargadas, y la cabecera no tiene por qué
// enterarse de nada de eso.
//
// En vez de subir los datos hasta el Layout, el Layout deja un hueco con
// nombre y cada panel mete lo suyo ahí con un portal. Quien pinta sigue
// siendo el panel; dónde aparece lo decide la cabecera.
// ---------------------------------------------------------------------------

export const RANURA_BUSCADOR = "ranura-buscador";

// Devuelve el nodo de la ranura cuando ya está en el documento. Hace falta el
// estado porque en el primer render el Layout todavía no lo ha montado, y un
// portal a null no pinta nada y nunca se reintenta.
export function useRanura(id: string): HTMLElement | null {
  const [nodo, setNodo] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setNodo(document.getElementById(id));
  }, [id]);
  return nodo;
}
