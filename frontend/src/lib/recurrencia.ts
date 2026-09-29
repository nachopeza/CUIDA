// Cuántos días a la semana toca ir según cómo esté escrita la recurrencia.
//
// Mismo lector, tolerante, que usa el servidor para crear las jornadas: la
// recurrencia se escribió a mano durante mucho tiempo ("L-V", "todos los días",
// "J, V, S, D"), y la pantalla tiene que entender lo mismo que la agenda.
const NOMBRES: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const LETRAS: Record<string, number> = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 };

function sinTildes(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function diasDeLaSemana(recurrencia: string | null | undefined): number[] | null {
  if (!recurrencia) return null;
  const t = sinTildes(recurrencia);
  if (/(diario|todos los dias|cada dia|a diario)/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/(l\s*-\s*v|lunes a viernes|laborable|entre semana)/.test(t)) return [1, 2, 3, 4, 5];
  if (/(fin de semana|findes?)/.test(t)) return [6, 0];
  const dias = new Set<number>();
  for (const [n, d] of Object.entries(NOMBRES)) if (t.includes(n)) dias.add(d);
  if (dias.size === 0) {
    for (const letra of recurrencia.toUpperCase().split(/[^A-Z]+/).join("")) if (letra in LETRAS) dias.add(LETRAS[letra]);
  }
  return dias.size > 0 ? [...dias].sort() : null;
}

export function diasPorSemana(recurrencia: string | null | undefined): number | null {
  return diasDeLaSemana(recurrencia)?.length ?? null;
}
