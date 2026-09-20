-- CreateEnum
CREATE TYPE "EstadoEmpresaColaboradora" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "TipoTarifa" AS ENUM ('PAGADO', 'VOLUNTARIO');

-- AlterTable
ALTER TABLE "familiar_relaciones" ADD COLUMN     "puedeVerImportes" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "empresaColaboradoraId" TEXT,
ADD COLUMN     "tarifaImporte" DECIMAL(10,2),
ADD COLUMN     "tarifaNotas" TEXT,
ADD COLUMN     "tarifaTipo" "TipoTarifa";

-- CreateTable
CREATE TABLE "empresas_colaboradoras" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "estado" "EstadoEmpresaColaboradora" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizacionId" TEXT NOT NULL,

    CONSTRAINT "empresas_colaboradoras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_colaboradoras_codigo_key" ON "empresas_colaboradoras"("codigo");

-- AddForeignKey
ALTER TABLE "empresas_colaboradoras" ADD CONSTRAINT "empresas_colaboradoras_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_empresaColaboradoraId_fkey" FOREIGN KEY ("empresaColaboradoraId") REFERENCES "empresas_colaboradoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
