-- AlterTable
ALTER TABLE "organizaciones" ADD COLUMN     "bicCobro" TEXT,
ADD COLUMN     "cnae" TEXT,
ADD COLUMN     "diasVencimiento" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "epigrafeIae" TEXT,
ADD COLUMN     "formaJuridica" TEXT,
ADD COLUMN     "ivaPorDefecto" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "registroEntidadesNumero" TEXT,
ADD COLUMN     "registroEntidadesOrgano" TEXT,
ADD COLUMN     "registroFolio" TEXT,
ADD COLUMN     "registroHoja" TEXT,
ADD COLUMN     "registroMercantil" TEXT,
ADD COLUMN     "registroTomo" TEXT,
ADD COLUMN     "seguroAseguradora" TEXT,
ADD COLUMN     "seguroCobertura" DECIMAL(12,2),
ADD COLUMN     "seguroPoliza" TEXT,
ADD COLUMN     "seguroVencimiento" TIMESTAMP(3),
ADD COLUMN     "web" TEXT;

