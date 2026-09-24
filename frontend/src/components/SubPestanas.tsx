// Las pestañas de dentro de una pantalla.
//
// El menú lateral se lee entero cada vez que se busca algo, así que cuantas
// menos entradas, mejor. Pero "menos entradas" no puede significar "menos
// sitios donde mirar": lo que había en dos entradas del menú pasa a ser dos
// pestañas de la misma pantalla, y la diferencia es que ahora se ve que son
// la misma cosa mirada desde dos preguntas.
//
// Visitas y Verificaciones ya compartían pantalla y aun así ocupaban dos
// líneas del menú, que es justo la confusión que esto quita.
export function SubPestanas<T extends string>({
  valor,
  onCambiar,
  opciones,
}: {
  valor: T;
  onCambiar: (v: T) => void;
  // El número es opcional: sólo lo lleva la pestaña donde hay algo que hacer.
  opciones: { clave: T; etiqueta: string; cuenta?: number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opciones.map((o) => {
        const activa = o.clave === valor;
        return (
          <button
            key={o.clave}
            onClick={() => onCambiar(o.clave)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              activa
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o.etiqueta}
            {o.cuenta != null && o.cuenta > 0 && (
              <span className={`ml-1.5 ${activa ? "text-white/70" : "text-slate-400"}`}>{o.cuenta}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
