import { infoEstado, type ClaveEstado } from "../lib/estadoUnificado.js";

// Colores diferenciados por estado (sección "diferenciar color en curso,
// validado, confirmado — deben diferenciarse y simplificarse"): antes
// EN_CURSO/FINALIZADO/VALIDADO compartían el mismo verde y eran
// indistinguibles de un vistazo. Cada fase real tiene ahora su propio color.
const COLORES: Record<string, string> = {
  BORRADOR: "bg-slate-200 text-slate-700",
  ENVIADA: "bg-blue-100 text-blue-700",
  EN_REVISION: "bg-blue-100 text-blue-700",
  BUSCANDO: "bg-amber-100 text-amber-700",
  PROPUESTA: "bg-amber-100 text-amber-700",
  ACEPTADA: "bg-brand-green-100 text-brand-green-700",
  PENDIENTE: "bg-slate-200 text-slate-700",
  // Asignado no es "buscando": ya hay alguien elegido y lo que falta es que
  // lo confirme. Compartía el ámbar de "buscando" y no se distinguía.
  ASIGNADO: "bg-violet-100 text-violet-700",
  CONFIRMADO: "bg-indigo-100 text-indigo-700",
  EN_CURSO: "bg-brand-green-100 text-brand-green-700",
  // Finalizado por el profesional pero todavía no verificado por
  // coordinación: naranja de aviso, no verde de "ya está resuelto".
  FINALIZADO: "bg-orange-100 text-orange-700",
  FINALIZADA: "bg-orange-100 text-orange-700",
  // Verificado por coordinación pero todavía no cerrado/facturado: color
  // propio (teal), distinto del verde de "en curso" y del naranja de
  // "por verificar".
  VALIDADO: "bg-teal-100 text-teal-700",
  CERRADO: "bg-slate-300 text-slate-800",
  CERRADA: "bg-slate-300 text-slate-800",
  CANCELADA: "bg-rose-100 text-rose-700",
  // La jornada no se prestó, pero no es lo mismo avisar que no abrir la
  // puerta: el no presentado tiene su propia consecuencia económica.
  NO_PRESENTADO: "bg-rose-100 text-rose-700",
  // No fue nadie: lo más grave de los tres finales posibles de una jornada
  // que no se presta, y por eso el rojo más oscuro.
  FALTA_PROFESIONAL: "bg-rose-200 text-rose-800",
  // Verificada y ya pagada al profesional en una liquidación.
  LIQUIDADA: "bg-slate-300 text-slate-800",
  CANCELADO: "bg-rose-100 text-rose-700",
  PAGADO: "bg-brand-green-100 text-brand-green-700",
  PROGRAMADA: "bg-slate-200 text-slate-700",
  INCIDENCIA: "bg-rose-100 text-rose-700",
  REVISADA: "bg-slate-300 text-slate-800",
  NUEVA: "bg-rose-100 text-rose-700",
  ASIGNADA: "bg-amber-100 text-amber-700",
  EN_RESOLUCION: "bg-amber-100 text-amber-700",
  RESUELTA: "bg-brand-green-100 text-brand-green-700",
};

// Los estados cuyo nombre en la base de datos no se puede enseñar tal cual:
// "FALTA PROFESIONAL" no dice lo que pasó, "No fue nadie" sí.
const TEXTOS: Record<string, string> = {
  FALTA_PROFESIONAL: "No fue nadie",
  NO_PRESENTADO: "No presentado",
};

export function EstadoBadge({ estado }: { estado: string }) {
  const clase = COLORES[estado] ?? "bg-slate-100 text-slate-600";
  // En píldora y con la primera en mayúscula: "En curso", no "EN CURSO".
  // Un estado es una palabra, no una sigla a gritos.
  const texto = TEXTOS[estado] ?? estado.replace(/_/g, " ").toLowerCase();
  return <span className={`pastilla ${clase}`}>{texto.charAt(0).toUpperCase() + texto.slice(1)}</span>;
}

// Badge del estado de trabajo (sección "simplifica estados de solicitudes,
// que sea más práctico y visual"): una de las cinco fases reales, con la
// misma palabra y el mismo color que las casillas de conteo y los filtros —
// nunca el enum en crudo de la base de datos.
export function EstadoUnificadoBadge({ clave }: { clave: ClaveEstado }) {
  const info = infoEstado(clave);
  // Icono + palabra + color. Las tres cosas dicen lo mismo, así que quitar
  // una no deja el estado ilegible: impreso en gris, o para quien no
  // distingue el ámbar del verde, la etiqueta sigue funcionando.
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${info.badge}`} title={info.ayuda}>
      <info.Icono className="h-3 w-3 shrink-0" aria-hidden />
      {info.etiqueta}
    </span>
  );
}
