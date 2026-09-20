-- CreateEnum
CREATE TYPE "TipoIncidencia" AS ENUM ('GENERAL', 'SOLICITUD_CANCELACION');

-- AlterEnum
ALTER TYPE "EstadoServicio" ADD VALUE 'CANCELADO';

-- AlterTable
ALTER TABLE "incidencias" ADD COLUMN     "tipo" "TipoIncidencia" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "personas" ADD COLUMN     "contactos" TEXT,
ADD COLUMN     "medicacion" TEXT,
ADD COLUMN     "medico" TEXT,
ADD COLUMN     "recomendaciones" TEXT;

-- AlterTable
ALTER TABLE "profesionales" ADD COLUMN     "telefono" TEXT;
