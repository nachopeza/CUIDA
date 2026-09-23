import type { TipoDocumento } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { carenciasDe } from "./rrhh.js";

// ---------------------------------------------------------------------------
// ¿Puede esta persona ir a esa casa, ese día?
//
// Tres preguntas que hay que hacerse siempre, se asigne desde donde se asigne
// —desde la ficha del servicio, buscando un reemplazo de urgencia o repasando
// por adelantado lo que viene—: si los papeles están en regla, si la empresa
// para la que trabaja tiene firmado el encargo de tratamiento, y si ese día
// está de baja o de vacaciones.
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

interface Expediente {
  profesional: { id: string; nombre: string; empresaColaboradoraId: string | null };
  documentos: { tipo: TipoDocumento; fechaCaducidad: Date | null; archivoId: string | null; url: string | null }[];
  empresa: { nombre: string; encargoFirmado: boolean } | null;
  ausencias: { desde: Date; hasta: Date }[];
}

// La frase es la que verá quien está asignando, así que dice qué falta y qué
// hacer, no un código.
function evaluar(e: Expediente, fecha?: Date | null): string | null {
  // Papeles. El certificado de delitos sexuales es obligatorio por ley para
  // trabajar con personas vulnerables: no es una política interna que se pueda
  // saltar con prisa.
  const impedimentos = carenciasDe(e.documentos).filter((c) => c.motivo !== "por_caducar");
  if (impedimentos.length > 0) {
    const comoSeDice = (c: (typeof impedimentos)[number]) => {
      const nombre = c.etiqueta.toLowerCase();
      if (c.motivo === "falta") return `falta ${nombre}`;
      if (c.motivo === "sin_archivo") return `${nombre} anotado pero sin el documento subido`;
      return `${nombre} caducado`;
    };
    return `No se puede asignar a ${e.profesional.nombre}: ${impedimentos.map(comoSeDice).join("; ")}.`;
  }

  // Encargo de tratamiento con su empresa (art. 28 RGPD): asignarle el
  // servicio le entrega a esa empresa los datos de la persona.
  if (e.empresa && !e.empresa.encargoFirmado) {
    return `${e.profesional.nombre} trabaja para ${e.empresa.nombre} y no consta el contrato de encargo de tratamiento. Fírmalo y márcalo en la ficha de la empresa antes de asignarle el servicio (art. 28 del RGPD).`;
  }

  // Y que ese día esté. Descubrirlo cuando nadie aparece en casa de la
  // persona es exactamente lo que hay que evitar.
  if (fecha && ausenteEse(fecha, e.ausencias)) {
    return `${e.profesional.nombre} está de ausencia el ${fecha.toLocaleDateString("es-ES")}. Elige a otra persona o cambia la fecha.`;
  }

  return null;
}

// Devuelve el motivo por el que NO se le puede asignar, o null si se puede.
export async function motivoParaNoAsignar(profesionalId: string, organizacionId: string, fecha?: Date | null): Promise<string | null> {
  const profesional = await prisma.profesional.findUnique({ where: { id: profesionalId } });
  if (!profesional || profesional.organizacionId !== organizacionId) return "Profesional no válido para esta organización";

  const documentos = await prisma.documento.findMany({
    where: { profesionalId },
    select: { tipo: true, fechaCaducidad: true, archivoId: true, url: true },
  });
  const empresa = profesional.empresaColaboradoraId
    ? await prisma.empresaColaboradora.findUnique({
        where: { id: profesional.empresaColaboradoraId },
        select: { nombre: true, encargoFirmado: true },
      })
    : null;
  const ausencias = fecha
    ? await prisma.ausencia.findMany({ where: { profesionalId, estado: "APROBADA" }, select: { desde: true, hasta: true } })
    : [];

  return evaluar({ profesional, documentos, empresa, ausencias }, fecha);
}

// La misma comprobación, pero preparada de una vez para toda la plantilla.
// Repasar dos semanas de jornadas son cientos de preguntas, y hacerlas de una
// en una contra la base de datos convertía un repaso en una espera.
export async function revisorDeAsignacion(organizacionId: string): Promise<(profesionalId: string, fecha?: Date | null) => string | null> {
  const [profesionales, documentos, empresas, ausencias] = await Promise.all([
    prisma.profesional.findMany({
      where: { organizacionId },
      select: { id: true, nombre: true, empresaColaboradoraId: true },
    }),
    prisma.documento.findMany({
      where: { profesional: { organizacionId } },
      select: { profesionalId: true, tipo: true, fechaCaducidad: true, archivoId: true, url: true },
    }),
    prisma.empresaColaboradora.findMany({ where: { organizacionId }, select: { id: true, nombre: true, encargoFirmado: true } }),
    prisma.ausencia.findMany({
      where: { estado: "APROBADA", profesional: { organizacionId } },
      select: { profesionalId: true, desde: true, hasta: true },
    }),
  ]);

  const porEmpresa = new Map(empresas.map((e) => [e.id, e]));
  const expedientes = new Map<string, Expediente>(
    profesionales.map((p) => [
      p.id,
      {
        profesional: p,
        documentos: documentos.filter((d) => d.profesionalId === p.id),
        empresa: p.empresaColaboradoraId ? porEmpresa.get(p.empresaColaboradoraId) ?? null : null,
        ausencias: ausencias.filter((a) => a.profesionalId === p.id),
      },
    ]),
  );

  return (profesionalId: string, fecha?: Date | null) => {
    const e = expedientes.get(profesionalId);
    if (!e) return "Profesional no válido para esta organización";
    return evaluar(e, fecha);
  };
}
