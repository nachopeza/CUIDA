-- CreateEnum
CREATE TYPE "TipoServicio" AS ENUM ('PUNTUAL', 'RECURRENTE');

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "tipoServicio" "TipoServicio" NOT NULL DEFAULT 'PUNTUAL';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "nombre" TEXT;

-- CreateTable
CREATE TABLE "servicio_interesados" (
    "id" TEXT NOT NULL,
    "mensaje" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "servicioId" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,

    CONSTRAINT "servicio_interesados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servicio_interesados_servicioId_profesionalId_key" ON "servicio_interesados"("servicioId", "profesionalId");

-- AddForeignKey
ALTER TABLE "servicio_interesados" ADD CONSTRAINT "servicio_interesados_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_interesados" ADD CONSTRAINT "servicio_interesados_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
