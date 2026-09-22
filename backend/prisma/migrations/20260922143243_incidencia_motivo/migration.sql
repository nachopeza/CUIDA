-- CreateEnum
CREATE TYPE "MotivoIncidencia" AS ENUM ('SALUD', 'ACCESO', 'AUSENCIA', 'RETRASO', 'TRATO', 'MATERIAL', 'HORARIO', 'OTRO');

-- AlterTable
ALTER TABLE "incidencias" ADD COLUMN     "motivo" "MotivoIncidencia" NOT NULL DEFAULT 'OTRO';
