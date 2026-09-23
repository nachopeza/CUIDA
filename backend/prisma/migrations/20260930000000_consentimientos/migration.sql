-- CreateEnum
CREATE TYPE "TipoConsentimiento" AS ENUM ('INFORMACION', 'DATOS_SALUD', 'CESION_PROFESIONAL', 'IMAGEN', 'COMUNICACIONES');

-- CreateEnum
CREATE TYPE "CanalConsentimiento" AS ENUM ('PRESENCIAL', 'TELEFONO', 'APLICACION', 'PAPEL_FIRMADO');

-- CreateTable
CREATE TABLE "consentimientos" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "tipo" "TipoConsentimiento" NOT NULL,
    "otorgado" BOOLEAN NOT NULL,
    "version" TEXT NOT NULL,
    "canal" "CanalConsentimiento" NOT NULL DEFAULT 'PRESENCIAL',
    "recogidoPorId" TEXT,
    "archivoId" TEXT,
    "nota" TEXT,
    "otorgadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadoAt" TIMESTAMP(3),
    "revocadoPorId" TEXT,
    "motivoRevocacion" TEXT,

    CONSTRAINT "consentimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consentimientos_personaId_tipo_idx" ON "consentimientos"("personaId", "tipo");

-- AddForeignKey
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_recogidoPorId_fkey" FOREIGN KEY ("recogidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_archivoId_fkey" FOREIGN KEY ("archivoId") REFERENCES "archivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_revocadoPorId_fkey" FOREIGN KEY ("revocadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

