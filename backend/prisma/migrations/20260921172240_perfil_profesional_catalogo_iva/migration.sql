-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "ivaTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalConIva" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "profesionales" ADD COLUMN     "biografia" TEXT,
ADD COLUMN     "foto" TEXT;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "ivaImporte" DECIMAL(10,2),
ADD COLUMN     "ivaPorcentaje" DECIMAL(5,2),
ADD COLUMN     "tipoServicioOfrecidoId" TEXT,
ADD COLUMN     "totalConIva" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "tipos_servicio_ofrecido" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "ivaPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 4,
    "precioBase" DECIMAL(10,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizacionId" TEXT NOT NULL,

    CONSTRAINT "tipos_servicio_ofrecido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_servicio_ofrecido_codigo_key" ON "tipos_servicio_ofrecido"("codigo");

-- AddForeignKey
ALTER TABLE "tipos_servicio_ofrecido" ADD CONSTRAINT "tipos_servicio_ofrecido_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_tipoServicioOfrecidoId_fkey" FOREIGN KEY ("tipoServicioOfrecidoId") REFERENCES "tipos_servicio_ofrecido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
