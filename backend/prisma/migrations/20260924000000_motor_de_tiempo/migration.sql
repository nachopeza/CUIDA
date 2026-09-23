-- CreateEnum
CREATE TYPE "BaseTiempo" AS ENUM ('PROGRAMADO', 'REAL', 'MENOR', 'MAYOR');

-- CreateEnum
CREATE TYPE "ModoRedondeo" AS ENUM ('NINGUNO', 'ARRIBA', 'ABAJO', 'CERCANO');

-- CreateEnum
CREATE TYPE "MotivoDesviacion" AS ENUM ('PETICION_CLIENTE', 'NECESIDAD_DEL_SERVICIO', 'INCIDENCIA', 'ERROR_DE_FICHAJE', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoAjuste" AS ENUM ('SIN_AJUSTE', 'PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoVisita" ADD VALUE 'CANCELADA';
ALTER TYPE "EstadoVisita" ADD VALUE 'NO_PRESENTADO';
ALTER TYPE "EstadoVisita" ADD VALUE 'LIQUIDADA';

-- AlterTable
ALTER TABLE "visitas" ADD COLUMN     "ajusteDecididoAt" TIMESTAMP(3),
ADD COLUMN     "ajusteDecididoPorId" TEXT,
ADD COLUMN     "ajusteEstado" "EstadoAjuste" NOT NULL DEFAULT 'SIN_AJUSTE',
ADD COLUMN     "ajusteMotivo" "MotivoDesviacion",
ADD COLUMN     "ajusteNota" TEXT,
ADD COLUMN     "cerradoPorUsuarioId" TEXT,
ADD COLUMN     "cierreManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "desviacionMinutos" INTEGER,
ADD COLUMN     "explicacionTiempo" TEXT,
ADD COLUMN     "importeCliente" DECIMAL(10,2),
ADD COLUMN     "importeCuida" DECIMAL(10,2),
ADD COLUMN     "importeProfesional" DECIMAL(10,2),
ADD COLUMN     "minutosFacturables" INTEGER,
ADD COLUMN     "minutosLiquidables" INTEGER,
ADD COLUMN     "minutosProgramados" INTEGER,
ADD COLUMN     "minutosReales" INTEGER,
ADD COLUMN     "precioHoraCliente" DECIMAL(10,2),
ADD COLUMN     "precioHoraProfesional" DECIMAL(10,2),
ADD COLUMN     "retrasoMinutos" INTEGER,
ADD COLUMN     "tarifaId" TEXT;

-- CreateTable
CREATE TABLE "reglas_negocio" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "baseCobro" "BaseTiempo" NOT NULL DEFAULT 'PROGRAMADO',
    "baseLiquidacion" "BaseTiempo" NOT NULL DEFAULT 'PROGRAMADO',
    "redondeoMinutos" INTEGER NOT NULL DEFAULT 0,
    "redondeoModo" "ModoRedondeo" NOT NULL DEFAULT 'NINGUNO',
    "minimoMinutos" INTEGER NOT NULL DEFAULT 0,
    "toleranciaRetrasoMinutos" INTEGER NOT NULL DEFAULT 10,
    "toleranciaExcesoMinutos" INTEGER NOT NULL DEFAULT 10,
    "aprobarTiempoExtra" BOOLEAN NOT NULL DEFAULT true,
    "horasVisitaAbierta" INTEGER NOT NULL DEFAULT 4,
    "cancelacionAvisoHoras" INTEGER NOT NULL DEFAULT 24,
    "cancelacionTardiaCobro" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "cancelacionTardiaPago" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "noPresentadoCobro" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "noPresentadoPago" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglas_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifas" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "necesidadId" TEXT,
    "precioHoraCliente" DECIMAL(10,2) NOT NULL,
    "precioHoraProfesional" DECIMAL(10,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "vigenteHasta" TIMESTAMP(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correcciones_fichaje" (
    "id" TEXT NOT NULL,
    "visitaId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TIMESTAMP(3),
    "valorNuevo" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correcciones_fichaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reglas_negocio_organizacionId_key" ON "reglas_negocio"("organizacionId");

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_ajusteDecididoPorId_fkey" FOREIGN KEY ("ajusteDecididoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_cerradoPorUsuarioId_fkey" FOREIGN KEY ("cerradoPorUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_negocio" ADD CONSTRAINT "reglas_negocio_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_necesidadId_fkey" FOREIGN KEY ("necesidadId") REFERENCES "necesidades_catalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correcciones_fichaje" ADD CONSTRAINT "correcciones_fichaje_visitaId_fkey" FOREIGN KEY ("visitaId") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correcciones_fichaje" ADD CONSTRAINT "correcciones_fichaje_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

