-- CreateEnum
CREATE TYPE "EstadoContratoHogar" AS ENUM ('EN_TRAMITE', 'ACTIVO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "JornadaHogar" AS ENUM ('EXTERNA', 'INTERNA');

-- CreateEnum
CREATE TYPE "EstadoTramite" AS ENUM ('PENDIENTE', 'EN_CURSO', 'HECHO', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "EstadoNominaHogar" AS ENUM ('PREPARADA', 'ENVIADA', 'PAGADA');

-- AlterTable
ALTER TABLE "lineas_factura" ADD COLUMN     "contratoHogarId" TEXT;

-- CreateTable
CREATE TABLE "contratos_hogar" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "estado" "EstadoContratoHogar" NOT NULL DEFAULT 'EN_TRAMITE',
    "organizacionId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "titularNombre" TEXT NOT NULL,
    "titularNif" TEXT,
    "solicitudId" TEXT,
    "trabajadoraNombre" TEXT NOT NULL,
    "trabajadoraApellidos" TEXT NOT NULL,
    "trabajadoraDni" TEXT,
    "trabajadoraNaf" TEXT,
    "trabajadoraTelefono" TEXT,
    "trabajadoraIban" TEXT,
    "profesionalId" TEXT,
    "jornada" "JornadaHogar" NOT NULL DEFAULT 'EXTERNA',
    "horasSemanales" INTEGER NOT NULL,
    "horario" TEXT,
    "salarioBrutoMensual" DECIMAL(10,2) NOT NULL,
    "pagasExtra" INTEGER NOT NULL DEFAULT 2,
    "prorrateaPagas" BOOLEAN NOT NULL DEFAULT false,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "motivoFin" TEXT,
    "cuotaGestionMensual" DECIMAL(10,2) NOT NULL,
    "cuotaAlta" DECIMAL(10,2),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_hogar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tramites_hogar" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "ayuda" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "imprescindible" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoTramite" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3),
    "notas" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tramites_hogar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nominas_hogar" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "bruto" DECIMAL(10,2) NOT NULL,
    "neto" DECIMAL(10,2),
    "estado" "EstadoNominaHogar" NOT NULL DEFAULT 'PREPARADA',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nominas_hogar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contratos_hogar_codigo_key" ON "contratos_hogar"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_hogar_solicitudId_key" ON "contratos_hogar"("solicitudId");

-- CreateIndex
CREATE UNIQUE INDEX "nominas_hogar_contratoId_mes_key" ON "nominas_hogar"("contratoId", "mes");

-- AddForeignKey
ALTER TABLE "lineas_factura" ADD CONSTRAINT "lineas_factura_contratoHogarId_fkey" FOREIGN KEY ("contratoHogarId") REFERENCES "contratos_hogar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_hogar" ADD CONSTRAINT "contratos_hogar_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_hogar" ADD CONSTRAINT "contratos_hogar_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_hogar" ADD CONSTRAINT "contratos_hogar_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramites_hogar" ADD CONSTRAINT "tramites_hogar_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos_hogar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nominas_hogar" ADD CONSTRAINT "nominas_hogar_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos_hogar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
