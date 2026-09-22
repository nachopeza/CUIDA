-- CreateEnum
CREATE TYPE "TipoFactura" AS ENUM ('ORDINARIA', 'RECTIFICATIVA');

-- CreateEnum
CREATE TYPE "FormaPago" AS ENUM ('DOMICILIACION', 'TRANSFERENCIA', 'EFECTIVO', 'TARJETA');

-- CreateEnum
CREATE TYPE "EstadoMandato" AS ENUM ('ACTIVO', 'REVOCADO');

-- CreateEnum
CREATE TYPE "EstadoRemesa" AS ENUM ('BORRADOR', 'GENERADA', 'ENVIADA', 'COBRADA');

-- CreateEnum
CREATE TYPE "TipoRelacionProfesional" AS ENUM ('LABORAL', 'AUTONOMO');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('BORRADOR', 'APROBADA', 'PAGADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoFactura" ADD VALUE 'IMPAGADA';
ALTER TYPE "EstadoFactura" ADD VALUE 'ANULADA';

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "ejercicio" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "emisorCif" TEXT,
ADD COLUMN     "emisorDireccion" TEXT,
ADD COLUMN     "emisorNombre" TEXT,
ADD COLUMN     "facturaRectificadaId" TEXT,
ADD COLUMN     "fechaCobro" TIMESTAMP(3),
ADD COLUMN     "fechaEmision" TIMESTAMP(3),
ADD COLUMN     "fechaVencimiento" TIMESTAMP(3),
ADD COLUMN     "formaPago" "FormaPago" NOT NULL DEFAULT 'DOMICILIACION',
ADD COLUMN     "mandatoSepaId" TEXT,
ADD COLUMN     "motivoImpago" TEXT,
ADD COLUMN     "motivoRectificacion" TEXT,
ADD COLUMN     "numero" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "remesaId" TEXT,
ADD COLUMN     "serie" TEXT NOT NULL DEFAULT 'A',
ADD COLUMN     "tipo" "TipoFactura" NOT NULL DEFAULT 'ORDINARIA',
ADD COLUMN     "titularDireccion" TEXT,
ADD COLUMN     "titularNif" TEXT,
ADD COLUMN     "titularNombre" TEXT;

-- AlterTable
ALTER TABLE "organizaciones" ADD COLUMN     "cif" TEXT,
ADD COLUMN     "codigoPostal" TEXT,
ADD COLUMN     "direccionFiscal" TEXT,
ADD COLUMN     "emailFacturacion" TEXT,
ADD COLUMN     "ibanCobro" TEXT,
ADD COLUMN     "identificadorAcreedor" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "provincia" TEXT,
ADD COLUMN     "razonSocial" TEXT,
ADD COLUMN     "serieFactura" TEXT NOT NULL DEFAULT 'A',
ADD COLUMN     "telefono" TEXT;

-- AlterTable
ALTER TABLE "profesionales" ADD COLUMN     "horasSemanales" INTEGER,
ADD COLUMN     "irpfPorcentaje" DECIMAL(5,2),
ADD COLUMN     "tipoRelacion" "TipoRelacionProfesional" NOT NULL DEFAULT 'AUTONOMO';

-- CreateTable
CREATE TABLE "datos_facturacion" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "nif" TEXT,
    "direccionFiscal" TEXT,
    "codigoPostal" TEXT,
    "municipio" TEXT,
    "provincia" TEXT,
    "email" TEXT,
    "formaPago" "FormaPago" NOT NULL DEFAULT 'DOMICILIACION',
    "diaCobro" INTEGER NOT NULL DEFAULT 5,
    "diasVencimiento" INTEGER NOT NULL DEFAULT 30,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datos_facturacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandatos_sepa" (
    "id" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "datosFacturacionId" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "fechaFirma" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoMandato" NOT NULL DEFAULT 'ACTIVO',
    "primerCobroHecho" BOOLEAN NOT NULL DEFAULT false,
    "revocadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mandatos_sepa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_factura" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "concepto" TEXT NOT NULL,
    "minutos" INTEGER,
    "cantidad" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "ivaPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ivaImporte" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "visitaId" TEXT,

    CONSTRAINT "lineas_factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remesas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "fechaCargo" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoRemesa" NOT NULL DEFAULT 'BORRADOR',
    "ficheroXml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizacionId" TEXT NOT NULL,

    CONSTRAINT "remesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "tipoRelacion" "TipoRelacionProfesional" NOT NULL,
    "minutos" INTEGER NOT NULL DEFAULT 0,
    "bruto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "irpfPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "irpfImporte" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "neto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'BORRADOR',
    "fechaPago" TIMESTAMP(3),
    "referenciaPago" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_liquidacion" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "visitaId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "minutos" INTEGER NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "lineas_liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datos_facturacion_personaId_key" ON "datos_facturacion"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "mandatos_sepa_referencia_key" ON "mandatos_sepa"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "remesas_codigo_key" ON "remesas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_codigo_key" ON "liquidaciones"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_profesionalId_mes_key" ON "liquidaciones"("profesionalId", "mes");

-- Las facturas que ya existían nacieron sin numeración: todas tendrían el
-- número 0 y chocarían contra el índice único. Se les da un correlativo por
-- organización siguiendo su orden de creación, que es el orden real en que
-- se emitieron, y se rellenan emisión y vencimiento con lo que se sabe.
UPDATE "facturas" f
SET "numero" = n."orden",
    "ejercicio" = COALESCE(NULLIF(SPLIT_PART(f."mes", '-', 1), '')::int, EXTRACT(YEAR FROM f."createdAt")::int),
    "fechaEmision" = COALESCE(f."fechaEmision", f."createdAt"),
    "fechaVencimiento" = COALESCE(f."fechaVencimiento", f."createdAt" + INTERVAL '30 days')
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organizacionId" ORDER BY "createdAt", "id") AS "orden"
  FROM "facturas"
) n
WHERE f."id" = n."id";

-- CreateIndex
CREATE UNIQUE INDEX "facturas_organizacionId_serie_ejercicio_numero_key" ON "facturas"("organizacionId", "serie", "ejercicio", "numero");

-- AddForeignKey
ALTER TABLE "datos_facturacion" ADD CONSTRAINT "datos_facturacion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandatos_sepa" ADD CONSTRAINT "mandatos_sepa_datosFacturacionId_fkey" FOREIGN KEY ("datosFacturacionId") REFERENCES "datos_facturacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_facturaRectificadaId_fkey" FOREIGN KEY ("facturaRectificadaId") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_mandatoSepaId_fkey" FOREIGN KEY ("mandatoSepaId") REFERENCES "mandatos_sepa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_remesaId_fkey" FOREIGN KEY ("remesaId") REFERENCES "remesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_factura" ADD CONSTRAINT "lineas_factura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remesas" ADD CONSTRAINT "remesas_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_liquidacion" ADD CONSTRAINT "lineas_liquidacion_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

