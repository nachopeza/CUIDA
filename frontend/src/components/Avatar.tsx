import { useEffect, useState } from "react";

// Foto de una persona, con sus iniciales cuando no hay foto o cuando la foto
// no carga. Lo segundo pasa de verdad: una URL que ya no existe, un archivo
// borrado o un momento sin conexión dejaban el icono de imagen rota en medio
// de la tabla. Las iniciales se ven siempre igual de bien.
export function Avatar({
  foto,
  nombre,
  apellidos,
  className = "h-7 w-7",
}: {
  foto?: string | null;
  nombre: string;
  apellidos?: string | null;
  className?: string;
}) {
  const [rota, setRota] = useState(false);
  // Si cambia la foto (se sube otra), se vuelve a intentar.
  useEffect(() => setRota(false), [foto]);

  const iniciales = `${nombre?.[0] ?? ""}${apellidos?.[0] ?? ""}`.toUpperCase();

  if (foto && !rota) {
    return <img src={foto} alt="" onError={() => setRota(true)} className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500`}
      aria-hidden
    >
      {iniciales}
    </div>
  );
}
