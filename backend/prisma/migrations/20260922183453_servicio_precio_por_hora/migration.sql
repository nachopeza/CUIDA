-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "comisionPorcentaje" DECIMAL(5,2),
ADD COLUMN     "minutosPrevistos" INTEGER,
ADD COLUMN     "precioHora" DECIMAL(10,2);
