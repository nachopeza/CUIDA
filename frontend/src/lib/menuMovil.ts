import { createContext, useContext, useEffect } from "react";

// El botón de menú vive en la cabecera, que es lo cómodo en el móvil: está
// siempre en el mismo sitio, arriba, y no se va con el desplazamiento de la
// página. Pero quien sabe abrir el cajón es cada panel, no la cabecera, así
// que el panel registra aquí su forma de abrirlo y la cabecera la usa.
interface MenuMovil {
  abrir: (() => void) | null;
  registrar: (abrir: (() => void) | null) => void;
}

export const MenuMovilContexto = createContext<MenuMovil>({ abrir: null, registrar: () => {} });

export function useRegistrarMenuMovil(abrir: () => void) {
  const { registrar } = useContext(MenuMovilContexto);
  useEffect(() => {
    registrar(abrir);
    return () => registrar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useMenuMovil() {
  return useContext(MenuMovilContexto);
}
