import { useEffect, useState } from "react";

function formatear(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function horasTrabajadas(inicio?: string | null, fin?: string | null): number {
  if (!inicio || !fin) return 0;
  return (new Date(fin).getTime() - new Date(inicio).getTime()) / 3600000;
}

// Temporizador de la visita (sección "los profesionales lo contabilizan con
// un temporizador... lo que vale es el tiempo que pasan los profesionales
// con los usuarios"): mientras la visita está en curso cuenta en vivo desde
// la hora real de llegada; una vez cerrada muestra el tiempo total, que es
// lo que después se factura.
export function Cronometro({ inicio, fin }: { inicio?: string | null; fin?: string | null }) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!inicio || fin) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [inicio, fin]);

  if (!inicio) return null;

  const desde = new Date(inicio).getTime();
  const enCurso = !fin;
  const transcurrido = enCurso ? ahora - desde : new Date(fin).getTime() - desde;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ${
        enCurso ? "bg-brand-green-100 text-brand-green-700" : "bg-slate-100 text-slate-600"
      }`}
      title={enCurso ? "Tiempo en curso desde que llegaste" : "Tiempo total trabajado"}
    >
      {enCurso && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green-600" />}
      {formatear(transcurrido)}
    </span>
  );
}
