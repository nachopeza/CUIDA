-- CreateEnum
CREATE TYPE "EstadoPagoProfesional" AS ENUM ('PENDIENTE', 'PAGADO');

-- AlterTable
ALTER TABLE "notificaciones" ADD COLUMN     "entidadId" TEXT,
ADD COLUMN     "entidadTipo" TEXT;

-- AlterTable
ALTER TABLE "planes" ADD COLUMN     "horaFin" TEXT,
ADD COLUMN     "horaInicio" TEXT;

-- AlterTable
ALTER TABLE "profesionales" ADD COLUMN     "empresaColaboradoraId" TEXT;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "pagoProfesionalEstado" "EstadoPagoProfesional" NOT NULL DEFAULT 'PENDIENTE';

-- AddForeignKey
ALTER TABLE "profesionales" ADD CONSTRAINT "profesionales_empresaColaboradoraId_fkey" FOREIGN KEY ("empresaColaboradoraId") REFERENCES "empresas_colaboradoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
