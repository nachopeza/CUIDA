-- Un borrador no tiene número fiscal: se le asigna al emitir. Mientras tanto
-- el número queda nulo, y como PostgreSQL trata los nulos como distintos en un
-- índice único, pueden convivir varios borradores en la misma serie y
-- ejercicio. Antes el 0 por defecto los hacía chocar entre sí y solo cabía uno.
ALTER TABLE "facturas" ALTER COLUMN "numero" DROP NOT NULL;
ALTER TABLE "facturas" ALTER COLUMN "numero" DROP DEFAULT;
UPDATE "facturas" SET "numero" = NULL WHERE "numero" = 0 AND "estado" = 'BORRADOR';
