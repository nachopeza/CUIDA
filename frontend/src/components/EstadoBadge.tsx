const COLORES: Record<string, string> = {
  BORRADOR: "bg-slate-200 text-slate-700",
  ENVIADA: "bg-blue-100 text-blue-700",
  EN_REVISION: "bg-blue-100 text-blue-700",
  BUSCANDO: "bg-amber-100 text-amber-700",
  PROPUESTA: "bg-amber-100 text-amber-700",
  ACEPTADA: "bg-emerald-100 text-emerald-700",
  PENDIENTE: "bg-slate-200 text-slate-700",
  ASIGNADO: "bg-amber-100 text-amber-700",
  CONFIRMADO: "bg-blue-100 text-blue-700",
  EN_CURSO: "bg-emerald-100 text-emerald-700",
  FINALIZADO: "bg-emerald-100 text-emerald-700",
  FINALIZADA: "bg-emerald-100 text-emerald-700",
  VALIDADO: "bg-emerald-100 text-emerald-700",
  CERRADO: "bg-slate-300 text-slate-800",
  CERRADA: "bg-slate-300 text-slate-800",
  CANCELADA: "bg-rose-100 text-rose-700",
  PROGRAMADA: "bg-slate-200 text-slate-700",
  INCIDENCIA: "bg-rose-100 text-rose-700",
  REVISADA: "bg-slate-300 text-slate-800",
  NUEVA: "bg-rose-100 text-rose-700",
  ASIGNADA: "bg-amber-100 text-amber-700",
  EN_RESOLUCION: "bg-amber-100 text-amber-700",
  RESUELTA: "bg-emerald-100 text-emerald-700",
};

export function EstadoBadge({ estado }: { estado: string }) {
  const clase = COLORES[estado] ?? "bg-slate-200 text-slate-700";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${clase}`}>{estado.replace(/_/g, " ")}</span>;
}
