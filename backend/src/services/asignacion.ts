import { prisma } from "../lib/prisma.js";
import { carenciasDe } from "./rrhh.js";

// ---------------------------------------------------------------------------
// ¿Puede esta persona ir a esa casa, ese día?
//
// Tres preguntas que hay que hacerse siempre, se asigne desde donde se asigne
// —desde la ficha del servicio o buscando un reemplazo de urgencia—: si los
// papeles están en regla, si la empresa para la que trabaja tiene firmado el
// encargo de tratamiento, y si ese día está de baja o de vacaciones.
//
// Vive aquí y no dentro de una ruta porque un reemplazo hecho con prisa es
// justo cuando más fácil es saltarse un requisito, y el requisito no depende
// de por qué pantalla se entró.
// ---------------------------------------------------------------------------

export function ausenteEse(fecha: Date, ausencias: { desde: Date; hasta: Date }[]): boolean {
  const dia = new Date(fecha);
  dia.setHours(12, 0, 0, 0);
  return ausencias.some((a) => {
    const desde = new Date(a.desde);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(a.hasta);
    hasta.setHours(23, 59, 59, 999);
    return dia >= desde && dia <= hasta;
  });
}

// Devuelve el motivo por el que NO se le puede asignar, o null si se puede.
// La frase es la que verá quien está asignando, así que dice qué falta y qué
// hacer, no un código.
export async function motivoParaNoAsignar(profesionalId: string, organizacionId: string, fecha?: Date | null): Promise<string | null> {
  const profesional = await prisma.profesional.findUnique({ where: { id: profesionalId } });
  if (!profesional || profesional.organizacionId !== organizacionId) return "Profesional no válido para esta organización";

  // Papeles. El certificado de delitos sexuales es obligatorio por ley para
  // trabajar con personas vulnerables: no es una política interna que se pueda
  // saltar con prisa.
  const documentos = await prisma.documento.findMany({
    where: { profesionalId },
    select: { tipo: true, fechaCaducidad: true, archivoId: true, url: true },
  });
  const impedimentos = carenciasDe(documentos).filter((c) => c.motivo !== "por_caducar");
  if (impedimentos.length > 0) {
    const comoSeDice = (c: (typeof impedimentos)[number]) => {
      const nombre = c.etiqueta.toLowerCase();
      if (c.motivo === "falta") return `falta ${nombre}`;
      if (c.motivo === "sin_archivo") return `${nombre} anotado pero sin el documento subido`;
      return `${nombre} caducado`;
    };
    return `No se puede asignar a ${profesional.nombre}: ${impedimentos.map(comoSeDice).join("; ")}.`;
  }

  // Encargo de tratamiento con su empresa (art. 28 RGPD): asignarle el
  // servicio le entrega a esa empresa los datos de la persona.
  if (profesional.empresaColaboradoraId) {
    const empresa = await prisma.empresaColaboradora.findUnique({ where: { id: profesional.empresaColaboradoraId } });
    if (empresa && !empresa.encargoFirmado) {
      return `${profesional.nombre} trabaja para ${empresa.nombre} y no consta el contrato de encargo de tratamiento. Fírmalo y márcalo en la ficha de la empresa antes de asignarle el servicio (art. 28 del RGPD).`;
    }
  }

  // Y que ese día esté. Descubrirlo cuando nadie aparece en casa de la
  // persona es exactamente lo que hay que evitar.
  if (fecha) {
    const ausencias = await prisma.ausencia.findMany({
      where: { profesionalId, estado: "APROBADA" },
      select: { desde: true, hasta: true },
    });
    if (ausenteEse(fecha, ausencias)) {
      return `${profesional.nombre} está de ausencia el ${fecha.toLocaleDateString("es-ES")}. Elige a otra persona o cambia la fecha.`;
    }
  }

  return null;
}
