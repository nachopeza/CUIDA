import type { SVGProps } from "react";
import {
  IconBox,
  IconBroom,
  IconCart,
  IconChat,
  IconHandshake,
  IconHelp,
  IconMeal,
  IconStethoscope,
  IconTree,
  IconUsers,
  IconWalk,
} from "../components/icons.js";

type Pinta = (p: SVGProps<SVGSVGElement>) => JSX.Element;

// Icono del catálogo de servicios por código. Un código nuevo creado desde
// coordinación no tiene icono propio y cae en el interrogante, en vez de
// dejar el hueco.
const POR_CODIGO: Record<string, Pinta> = {
  compra: IconCart,
  acompanamiento: IconUsers,
  compania: IconChat,
  tareas_domesticas: IconBroom,
  comida: IconMeal,
  recados: IconBox,
  paseo: IconTree,
  citas: IconStethoscope,
  apoyo_puntual: IconHandshake,
  aseo: IconWalk,
};

export function iconoNecesidad(codigo: string | null | undefined): Pinta {
  return (codigo && POR_CODIGO[codigo]) || IconHelp;
}

// Atajo para pintarlo directamente: <IconoNecesidad codigo={...} className="h-4 w-4" />
export function IconoNecesidad({ codigo, ...props }: { codigo: string | null | undefined } & SVGProps<SVGSVGElement>) {
  const Pinta = iconoNecesidad(codigo);
  return <Pinta {...props} />;
}
