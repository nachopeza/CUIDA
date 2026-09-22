-- AlterTable
ALTER TABLE "visitas" ADD COLUMN     "facturaId" TEXT,
ADD COLUMN     "profesionalId" TEXT;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
