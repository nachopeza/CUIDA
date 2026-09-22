-- CreateEnum
CREATE TYPE "CarneConducir" AS ENUM ('NO', 'B', 'A', 'C', 'D');

-- CreateEnum
CREATE TYPE "Titulacion" AS ENUM ('SIN_TITULACION', 'ATENCION_SOCIOSANITARIA', 'AUXILIAR_ENFERMERIA', 'ENFERMERIA', 'TRABAJO_SOCIAL', 'FISIOTERAPIA', 'TERAPIA_OCUPACIONAL', 'PSICOLOGIA', 'OTRA');

-- AlterTable
ALTER TABLE "profesionales" ADD COLUMN     "carneConducir" "CarneConducir" NOT NULL DEFAULT 'NO',
ADD COLUMN     "comunidad" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "titulacion" "Titulacion",
ADD COLUMN     "vehiculoPropio" BOOLEAN NOT NULL DEFAULT false;
