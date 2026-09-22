-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('DNI', 'DELITOS_SEXUALES', 'TITULACION', 'CONTRATO', 'ALTA_SEGURIDAD_SOCIAL', 'CARNE_CONDUCIR', 'SEGURO', 'FORMACION', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('INDEFINIDO', 'TEMPORAL', 'FIJO_DISCONTINUO', 'PRACTICAS', 'MERCANTIL');

-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('VACACIONES', 'BAJA_MEDICA', 'PERMISO_RETRIBUIDO', 'ASUNTOS_PROPIOS', 'EXCEDENCIA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoAusencia" AS ENUM ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "fechaCaducidad" TIMESTAMP(3),
ADD COLUMN     "fechaEmision" TIMESTAMP(3),
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "tipo" "TipoDocumento" NOT NULL DEFAULT 'OTRO';

-- AlterTable
ALTER TABLE "profesionales" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "fechaAlta" TIMESTAMP(3),
ADD COLUMN     "fechaBaja" TIMESTAMP(3),
ADD COLUMN     "tipoContrato" "TipoContrato";

-- CreateTable
CREATE TABLE "ausencias" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAusencia" NOT NULL,
    "estado" "EstadoAusencia" NOT NULL DEFAULT 'SOLICITADA',
    "profesionalId" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "respuesta" TEXT,
    "resueltaPorUsuarioId" TEXT,
    "resueltaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ausencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_jornada" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "minutosTrabajados" INTEGER NOT NULL DEFAULT 0,
    "minutosContrato" INTEGER,
    "diasTrabajados" INTEGER NOT NULL DEFAULT 0,
    "detalle" TEXT NOT NULL,
    "cerradoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conformeAt" TIMESTAMP(3),
    "conformeNota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_jornada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registros_jornada_codigo_key" ON "registros_jornada"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "registros_jornada_profesionalId_mes_key" ON "registros_jornada"("profesionalId", "mes");

-- AddForeignKey
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_jornada" ADD CONSTRAINT "registros_jornada_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

