import { useEffect, useRef } from "react";

// Que lo que se ve se ponga al día solo.
//
// Coordinación le da un servicio a una profesional, o le mueve la jornada, y
// ella lo tenía que descubrir recargando la página una vez, y otra, hasta que
// aparecía. La campana ya se refrescaba sola; lo que no lo hacía era la lista
// que se mira de verdad.
//
// Se vuelve a pedir en tres momentos: cada cierto tiempo mientras la pestaña
// está a la vista, al volver a ella después de haber estado en otra cosa (que
// es cuando más probable es que haya cambiado algo) y al recuperar la conexión.
// Con la pestaña oculta no se pide nada: nadie lo está mirando.
export function useRefrescoAutomatico(cargar: () => void | Promise<void>, cadaMs = 20000) {
  // La última versión de `cargar`, sin reiniciar el temporizador cada vez que
  // el componente se vuelve a pintar.
  const ultima = useRef(cargar);
  ultima.current = cargar;

  useEffect(() => {
    const pedir = () => {
      if (document.visibilityState === "hidden") return;
      void Promise.resolve(ultima.current()).catch(() => undefined);
    };
    const intervalo = setInterval(pedir, cadaMs);
    document.addEventListener("visibilitychange", pedir);
    window.addEventListener("online", pedir);
    window.addEventListener("focus", pedir);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", pedir);
      window.removeEventListener("online", pedir);
      window.removeEventListener("focus", pedir);
    };
  }, [cadaMs]);
}
