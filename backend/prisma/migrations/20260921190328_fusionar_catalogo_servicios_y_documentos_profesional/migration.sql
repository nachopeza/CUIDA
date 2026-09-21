/*
  Warnings:

  - You are about to drop the column `tipoServicioOfrecidoId` on the `servicios` table. All the data in the column will be lost.
  - You are about to drop the `tipos_servicio_ofrecido` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "servicios" DROP CONSTRAINT "servicios_tipoServicioOfrecidoId_fkey";

-- DropForeignKey
ALTER TABLE "tipos_servicio_ofrecido" DROP CONSTRAINT "tipos_servicio_ofrecido_organizacionId_fkey";

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "profesionalId" TEXT;

-- AlterTable
ALTER TABLE "necesidades_catalogo" ADD COLUMN     "ivaPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 4,
ADD COLUMN     "precioBase" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "servicios" DROP COLUMN "tipoServicioOfrecidoId";

-- DropTable
DROP TABLE "tipos_servicio_ofrecido";

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
