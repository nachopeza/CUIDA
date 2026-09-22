-- AlterTable
ALTER TABLE "incidencias" ADD COLUMN     "creadoPorUsuarioId" TEXT;

-- AddForeignKey
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_creadoPorUsuarioId_fkey" FOREIGN KEY ("creadoPorUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
