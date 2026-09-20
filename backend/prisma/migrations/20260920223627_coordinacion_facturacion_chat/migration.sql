-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('BORRADOR', 'EMITIDA', 'PAGADA');

-- AlterTable
ALTER TABLE "empresas_colaboradoras" ADD COLUMN     "cif" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "numeroCuenta" TEXT;

-- AlterTable
ALTER TABLE "organizaciones" ADD COLUMN     "comisionPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "profesionales" ADD COLUMN     "bizum" TEXT,
ADD COLUMN     "dni" TEXT,
ADD COLUMN     "numeroCuenta" TEXT;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "comisionImporte" DECIMAL(10,2),
ADD COLUMN     "facturaId" TEXT,
ADD COLUMN     "importeProfesional" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "facturas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "importeTotal" DECIMAL(10,2) NOT NULL,
    "comisionTotal" DECIMAL(10,2) NOT NULL,
    "importeProfesionales" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "servicioId" TEXT NOT NULL,
    "autorUsuarioId" TEXT NOT NULL,
    "profesionalId" TEXT,

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facturas_codigo_key" ON "facturas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_personaId_mes_key" ON "facturas"("personaId", "mes");

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_autorUsuarioId_fkey" FOREIGN KEY ("autorUsuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
