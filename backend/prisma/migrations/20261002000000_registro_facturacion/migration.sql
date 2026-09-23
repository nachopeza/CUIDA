-- CreateTable
CREATE TABLE "registros_facturacion" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "nifEmisor" TEXT NOT NULL,
    "numSerieFactura" TEXT NOT NULL,
    "fechaExpedicion" TEXT NOT NULL,
    "tipoFactura" TEXT NOT NULL,
    "cuotaTotal" DECIMAL(12,2) NOT NULL,
    "importeTotal" DECIMAL(12,2) NOT NULL,
    "huellaAnterior" TEXT,
    "huella" TEXT NOT NULL,
    "fechaHoraHusoGen" TEXT NOT NULL,
    "sistemaInformatico" TEXT NOT NULL,
    "versionSistema" TEXT NOT NULL,
    "urlCotejo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_facturacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registros_facturacion_facturaId_key" ON "registros_facturacion"("facturaId");

-- CreateIndex
CREATE INDEX "registros_facturacion_organizacionId_createdAt_idx" ON "registros_facturacion"("organizacionId", "createdAt");

-- AddForeignKey
ALTER TABLE "registros_facturacion" ADD CONSTRAINT "registros_facturacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_facturacion" ADD CONSTRAINT "registros_facturacion_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

