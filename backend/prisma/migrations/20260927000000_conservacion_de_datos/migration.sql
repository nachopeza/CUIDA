-- CreateTable
CREATE TABLE "politicas_conservacion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "mesesRegistroJornada" INTEGER NOT NULL DEFAULT 48,
    "mesesDocumentacionLaboral" INTEGER NOT NULL DEFAULT 48,
    "mesesFacturacion" INTEGER NOT NULL DEFAULT 72,
    "mesesMandatoSepa" INTEGER NOT NULL DEFAULT 14,
    "mesesDatosAsistenciales" INTEGER NOT NULL DEFAULT 60,
    "mesesCertificadoPenales" INTEGER NOT NULL DEFAULT 12,
    "mesesAuditoria" INTEGER NOT NULL DEFAULT 24,
    "mesesMensajes" INTEGER NOT NULL DEFAULT 12,
    "responsableNombre" TEXT,
    "responsableEmail" TEXT,
    "delegadoNombre" TEXT,
    "delegadoEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "politicas_conservacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "politicas_conservacion_organizacionId_key" ON "politicas_conservacion"("organizacionId");

-- AddForeignKey
ALTER TABLE "politicas_conservacion" ADD CONSTRAINT "politicas_conservacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

