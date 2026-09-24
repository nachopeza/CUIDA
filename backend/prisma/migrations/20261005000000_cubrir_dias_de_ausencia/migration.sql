-- Días que hay que cubrir en una incidencia de ausencia: un reemplazo de tres
-- días es de tres días, no un traspaso del servicio.
ALTER TABLE "incidencias" ADD COLUMN "cubrirDesde" TIMESTAMP(3);
ALTER TABLE "incidencias" ADD COLUMN "cubrirHasta" TIMESTAMP(3);
