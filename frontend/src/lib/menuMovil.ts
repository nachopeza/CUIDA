import { createContext, useContext, useEffect } from "react";

// El botón de menú vive en la cabecera, que es lo cómodo en el móvil: está
// siempre en el mismo sitio, arriba, y no se va con el desplazamiento de la
// página. Pero quien sabe abrir el cajón es cada panel, no la cabecera, así
// que el panel registra aquí su forma de abrirlo y la cabecera la usa.
interface MenuMovil {
  abrir: (() => void) | null;
  registrar: (abrir: (() => void) | null) => void;
  // Lo mismo para el logo: pulsarlo lleva al inicio, pero quién sabe cuál es
  // "el inicio" es cada panel —el escritorio de coordinación, el de hoy del
  // profesional— y no la cabecera.
  irAInicio: (() => void) | null;
  registrarInicio: (ir: (() => void) | null) => void;
}

export const MenuMovilContexto = createContext<MenuMovil>({
  abrir: null,
  registrar: () => {},
  irAInicio: null,
  registrarInicio: () => {},
});

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

// El logo de CUIDA lleva al inicio, como en cualquier sitio web. Cada panel
// dice aquí cuál es su inicio.
export function useRegistrarInicio(ir: () => void) {
  const { registrarInicio } = useContext(MenuMovilContexto);
  useEffect(() => {
    registrarInicio(ir);
    return () => registrarInicio(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
