/*
  Warnings:

  - You are about to drop the column `servicioId` on the `mensajes` table. All the data in the column will be lost.
  - Added the required column `personaId` to the `mensajes` table without a default value. This is not possible if the table is not empty.
  - Made the column `profesionalId` on table `mensajes` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "mensajes" DROP CONSTRAINT "mensajes_profesionalId_fkey";

-- DropForeignKey
ALTER TABLE "mensajes" DROP CONSTRAINT "mensajes_servicioId_fkey";

-- AlterTable
ALTER TABLE "mensajes" DROP COLUMN "servicioId",
ADD COLUMN     "personaId" TEXT NOT NULL,
ALTER COLUMN "profesionalId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "profesionales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
