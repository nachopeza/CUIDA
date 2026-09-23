import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// "Créalo la primera vez que alguien lo pida"
//
// Varias cosas de la casa —las reglas de negocio, la política de conservación—
// no existen hasta que alguien abre su pantalla, y entonces se crean con los
// valores por defecto. Hacerlo con un upsert parecía suficiente, pero una
// pantalla pide varias cosas a la vez: la primera visita lanzaba dos o tres
// creaciones en paralelo y la segunda en llegar reventaba con "unique
// constraint failed", o sea un 500 en la cara de quien sólo abrió una pestaña.
//
// Se lee, se crea si falta y, si alguien se nos adelantó, se vuelve a leer:
// que exista es justo lo que se quería.
// ---------------------------------------------------------------------------
export async function leerOCrear<T>(leer: () => Promise<T | null>, crear: () => Promise<T>): Promise<T> {
  const existente = await leer();
  if (existente) return existente;
  try {
    return await crear();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const creadoPorOtro = await leer();
      if (creadoPorOtro) return creadoPorOtro;
    }
    throw err;
  }
}
