import { createContext, useContext } from "react";

// Abrir la ficha de una persona o de una profesional desde donde se esté: la
// lista, la página de un servicio, la ventana de edición. La página que las
// muestra vive en el panel de coordinación; esto es el teléfono que llega hasta
// ella, para no tener que pasar dos funciones por cada componente intermedio.
interface Fichas {
  abrirPersona: (id: string) => void;
  abrirProfesional: (id: string) => void;
}

const FichasContext = createContext<Fichas>({ abrirPersona: () => undefined, abrirProfesional: () => undefined });

export const FichasProvider = FichasContext.Provider;
export const useFichas = () => useContext(FichasContext);
