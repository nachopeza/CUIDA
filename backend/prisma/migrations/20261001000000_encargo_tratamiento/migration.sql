-- AlterTable
ALTER TABLE "empresas_colaboradoras" ADD COLUMN     "encargoArchivoId" TEXT,
ADD COLUMN     "encargoFecha" TIMESTAMP(3),
ADD COLUMN     "encargoFirmado" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "empresas_colaboradoras" ADD CONSTRAINT "empresas_colaboradoras_encargoArchivoId_fkey" FOREIGN KEY ("encargoArchivoId") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

