import { createContext, useContext } from "react";

// Abrir una ficha de página —persona, profesional, incidencia, empresa— desde
// donde se esté: la lista, la página de un servicio, la ventana de edición. Las
// páginas viven en el panel de coordinación; esto es el teléfono que llega hasta
// él, para no tener que pasar una función por cada componente intermedio.
interface Fichas {
  abrirPersona: (id: string) => void;
  abrirProfesional: (id: string) => void;
  abrirIncidencia: (id: string) => void;
  abrirEmpresa: (id: string) => void;
}

const nada = () => undefined;
const FichasContext = createContext<Fichas>({ abrirPersona: nada, abrirProfesional: nada, abrirIncidencia: nada, abrirEmpresa: nada });

export const FichasProvider = FichasContext.Provider;
export const useFichas = () => useContext(FichasContext);
