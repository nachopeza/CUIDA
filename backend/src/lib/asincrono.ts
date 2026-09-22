import type { NextFunction, Request, Response, Router } from "express";

type Manejador = (req: Request, res: Response, next: NextFunction) => unknown;

// Express 4 no recoge el rechazo de un handler async: la promesa se rompe, el
// middleware de error no se entera y la petición se queda colgada para
// siempre. Al cliente eso le llega como una pantalla en "Cargando…" que nunca
// avanza, sin error ni pista de qué ha pasado (un include mal escrito en una
// consulta bastaba para dejar así toda la ficha).
//
// Esto envuelve los handlers ya registrados en un router para que el rechazo
// salga por next(err) y acabe en el middleware de error, que responde 500.
export function conErroresAsincronos(router: Router): Router {
  const capas = (router as unknown as { stack: { route?: { stack: { handle: Manejador }[] } }[] }).stack;
  for (const capa of capas) {
    if (!capa.route) continue;
    for (const paso of capa.route.stack) {
      const original = paso.handle;
      paso.handle = (req, res, next) => {
        try {
          const resultado = original(req, res, next);
          if (resultado instanceof Promise) resultado.catch(next);
        } catch (err) {
          next(err);
        }
      };
    }
  }
  return router;
}
