import { prisma } from "../lib/prisma.js";
import { leerOCrear } from "../lib/primeraVez.js";

// ---------------------------------------------------------------------------
// Conservación de datos
//
// Qué se guarda, cuánto y por qué. Cada categoría lleva su base legal escrita
// al lado, porque un plazo sin la norma que lo sostiene es un número que
// nadie puede defender ante la Inspección ni ante la Agencia.
//
// Este módulo calcula; no borra nada por su cuenta. Un borrado automático mal
// configurado destruye justo la prueba que la ley obliga a conservar, así que
// la purga la pide una persona, viendo antes qué se lleva por delante.
// ---------------------------------------------------------------------------

export type Categoria =
  | "REGISTRO_JORNADA"
  | "DOCUMENTACION_LABORAL"
  | "FACTURACION"
  | "MANDATO_SEPA"
  | "DATOS_ASISTENCIALES"
  | "CERTIFICADO_PENALES"
  | "AUDITORIA"
  | "MENSAJES";

export interface FichaCategoria {
  categoria: Categoria;
  etiqueta: string;
  // Qué datos son, en una frase que entienda quien no ha escrito el código.
  queEs: string;
  baseLegal: string;
  // Si el plazo lo impone una norma de conservación (hay que guardarlo) o solo
  // lo limita el RGPD (no se puede guardar más). La diferencia importa: en el
  // primer caso borrar antes es la infracción.
  obligaAGuardar: boolean;
  campoMeses: keyof Meses;
  // Desde cuándo cuenta el plazo.
  desdeCuando: string;
}

export interface Meses {
  mesesRegistroJornada: number;
  mesesDocumentacionLaboral: number;
  mesesFacturacion: number;
  mesesMandatoSepa: number;
  mesesDatosAsistenciales: number;
  mesesCertificadoPenales: number;
  mesesAuditoria: number;
  mesesMensajes: number;
}

export const CATEGORIAS: FichaCategoria[] = [
  {
    categoria: "REGISTRO_JORNADA",
    etiqueta: "Registro de jornada",
    queEs: "Las horas de entrada y salida de cada profesional, mes a mes",
    baseLegal: "Art. 34.9 del Estatuto de los Trabajadores",
    obligaAGuardar: true,
    campoMeses: "mesesRegistroJornada",
    desdeCuando: "desde el cierre del mes registrado",
  },
  {
    categoria: "DOCUMENTACION_LABORAL",
    etiqueta: "Documentación laboral",
    queEs: "Contratos, altas en la Seguridad Social, titulaciones y sus archivos",
    baseLegal: "Art. 21 LISOS (prescripción de infracciones) y obligaciones frente a la TGSS",
    obligaAGuardar: true,
    campoMeses: "mesesDocumentacionLaboral",
    desdeCuando: "desde la baja del profesional",
  },
  {
    categoria: "FACTURACION",
    etiqueta: "Facturas y liquidaciones",
    queEs: "Las facturas emitidas a las familias y las liquidaciones a los profesionales",
    baseLegal: "Art. 30 del Código de Comercio (6 años), por encima de los 4 del art. 66 LGT",
    obligaAGuardar: true,
    campoMeses: "mesesFacturacion",
    desdeCuando: "desde la fecha de la factura",
  },
  {
    categoria: "MANDATO_SEPA",
    etiqueta: "Mandatos de domiciliación",
    queEs: "La autorización firmada para girar recibos a una cuenta",
    baseLegal: "Cuaderno SEPA: plazo de reclamación por adeudo no autorizado",
    obligaAGuardar: true,
    campoMeses: "mesesMandatoSepa",
    desdeCuando: "desde que el mandato se revocó o quedó sin uso",
  },
  {
    categoria: "DATOS_ASISTENCIALES",
    etiqueta: "Datos de la persona atendida",
    queEs: "Perfil, preferencias, medicación, solicitudes y jornadas de una persona sin servicio activo",
    baseLegal: "Art. 1964 del Código Civil (prescripción de acciones personales)",
    obligaAGuardar: false,
    campoMeses: "mesesDatosAsistenciales",
    desdeCuando: "desde la última jornada prestada",
  },
  {
    categoria: "CERTIFICADO_PENALES",
    etiqueta: "Certificados de delitos sexuales",
    queEs: "El certificado de antecedentes de profesionales que ya no trabajan aquí",
    baseLegal: "Sin plazo fijado: minimización del art. 5.1.c del RGPD",
    obligaAGuardar: false,
    campoMeses: "mesesCertificadoPenales",
    desdeCuando: "desde la baja del profesional",
  },
  {
    categoria: "AUDITORIA",
    etiqueta: "Registro de accesos",
    queEs: "Quién hizo qué y cuándo dentro de la aplicación",
    baseLegal: "Esquema Nacional de Seguridad: trazas de acceso",
    obligaAGuardar: false,
    campoMeses: "mesesAuditoria",
    desdeCuando: "desde que se registró el acceso",
  },
  {
    categoria: "MENSAJES",
    etiqueta: "Mensajes",
    queEs: "La conversación entre la familia y el profesional",
    baseLegal: "Sin obligación de conservar: minimización del art. 5.1.c del RGPD",
    obligaAGuardar: false,
    campoMeses: "mesesMensajes",
    desdeCuando: "desde que se envió el mensaje",
  },
];

// La política de la casa, con los plazos por defecto la primera vez que
// alguien la pide. El porqué de no usar un upsert está en leerOCrear.
export async function politicaDe(organizacionId: string) {
  return leerOCrear(
    () => prisma.politicaConservacion.findUnique({ where: { organizacionId } }),
    () => prisma.politicaConservacion.create({ data: { organizacionId } }),
  );
}

function haceMeses(meses: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d;
}

export interface Vencido {
  categoria: Categoria;
  etiqueta: string;
  queEs: string;
  baseLegal: string;
  obligaAGuardar: boolean;
  meses: number;
  desdeCuando: string;
  // Cuántos registros han pasado su plazo, y el más antiguo, para poder juzgar
  // si la cifra tiene sentido antes de borrar nada.
  cuantos: number;
  masAntiguo: Date | null;
}

// Qué ha pasado su plazo. Se cuenta, no se borra.
export async function vencidosDe(organizacionId: string): Promise<Vencido[]> {
  const politica = await politicaDe(organizacionId);
  const salida: Vencido[] = [];

  const base = (ficha: FichaCategoria, cuantos: number, masAntiguo: Date | null): Vencido => ({
    categoria: ficha.categoria,
    etiqueta: ficha.etiqueta,
    queEs: ficha.queEs,
    baseLegal: ficha.baseLegal,
    obligaAGuardar: ficha.obligaAGuardar,
    meses: politica[ficha.campoMeses] as number,
    desdeCuando: ficha.desdeCuando,
    cuantos,
    masAntiguo,
  });

  const ficha = (c: Categoria) => CATEGORIAS.find((x) => x.categoria === c)!;

  // Registro de jornada: el mes registrado es un "AAAA-MM", así que el corte
  // se compara como texto, que para ese formato ordena igual que la fecha.
  {
    const f = ficha("REGISTRO_JORNADA");
    const corte = haceMeses(politica.mesesRegistroJornada);
    const mesCorte = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, "0")}`;
    const filas = await prisma.registroJornada.findMany({
      where: { profesional: { organizacionId }, mes: { lt: mesCorte } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    salida.push(base(f, filas.length, filas[0]?.createdAt ?? null));
  }

  // Documentación laboral: cuenta desde la baja del profesional, así que solo
  // entran los que ya no están. A quien sigue trabajando no se le toca nada.
  {
    const f = ficha("DOCUMENTACION_LABORAL");
    const corte = haceMeses(politica.mesesDocumentacionLaboral);
    const cuantos = await prisma.documento.count({
      where: {
        tipo: { in: ["CONTRATO", "ALTA_SEGURIDAD_SOCIAL", "TITULACION"] },
        profesional: { organizacionId, fechaBaja: { not: null, lt: corte } },
      },
    });
    salida.push(base(f, cuantos, null));
  }

  {
    const f = ficha("FACTURACION");
    const corte = haceMeses(politica.mesesFacturacion);
    const filas = await prisma.factura.findMany({
      where: { organizacionId, fechaEmision: { lt: corte } },
      select: { fechaEmision: true },
      orderBy: { fechaEmision: "asc" },
    });
    salida.push(base(f, filas.length, filas[0]?.fechaEmision ?? null));
  }

  {
    const f = ficha("MANDATO_SEPA");
    const corte = haceMeses(politica.mesesMandatoSepa);
    const cuantos = await prisma.mandatoSepa.count({
      where: { datosFacturacion: { persona: { organizacionId } }, revocadoAt: { not: null, lt: corte } },
    });
    salida.push(base(f, cuantos, null));
  }

  // Datos asistenciales: personas archivadas cuya última jornada quedó fuera
  // de plazo. Una persona con cualquier servicio vivo nunca entra aquí.
  {
    const f = ficha("DATOS_ASISTENCIALES");
    const corte = haceMeses(politica.mesesDatosAsistenciales);
    const cuantos = await prisma.persona.count({
      where: {
        organizacionId,
        estado: "ARCHIVADA",
        solicitudes: { none: { servicio: { visitas: { some: { fecha: { gte: corte } } } } } },
      },
    });
    salida.push(base(f, cuantos, null));
  }

  {
    const f = ficha("CERTIFICADO_PENALES");
    const corte = haceMeses(politica.mesesCertificadoPenales);
    const cuantos = await prisma.documento.count({
      where: { tipo: "DELITOS_SEXUALES", profesional: { organizacionId, fechaBaja: { not: null, lt: corte } } },
    });
    salida.push(base(f, cuantos, null));
  }

  {
    const f = ficha("AUDITORIA");
    const corte = haceMeses(politica.mesesAuditoria);
    const filas = await prisma.auditLog.findMany({
      where: { organizacionId, createdAt: { lt: corte } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
    const cuantos = await prisma.auditLog.count({ where: { organizacionId, createdAt: { lt: corte } } });
    salida.push(base(f, cuantos, filas[0]?.createdAt ?? null));
  }

  {
    const f = ficha("MENSAJES");
    const corte = haceMeses(politica.mesesMensajes);
    const cuantos = await prisma.mensaje.count({
      where: { persona: { organizacionId }, createdAt: { lt: corte } },
    });
    salida.push(base(f, cuantos, null));
  }

  return salida;
}
