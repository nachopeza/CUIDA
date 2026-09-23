import { prisma } from "../lib/prisma.js";
import { CATEGORIAS, politicaDe } from "./conservacion.js";
import { CATALOGO as CATALOGO_CONSENTIMIENTOS } from "./consentimientos.js";

// ---------------------------------------------------------------------------
// Registro de actividades de tratamiento (art. 30 del RGPD)
//
// Es el documento que la Agencia pide primero en una inspección, y el que casi
// ninguna empresa pequeña tiene. No es un texto que haya que redactar: es una
// descripción de lo que la aplicación ya hace, así que se genera de lo que ya
// está configurado — los plazos de conservación con su norma, las finalidades
// y los consentimientos que se recogen — en vez de mantenerse a mano en un
// Word que se queda viejo en cuanto cambia algo.
//
// Lo que no puede salir de la configuración (las medidas de seguridad, las
// transferencias internacionales) va escrito aquí, describiendo lo que esta
// aplicación hace de verdad. Si mañana deja de ser cierto, hay que cambiarlo
// aquí: es una declaración, no un adorno.
// ---------------------------------------------------------------------------

export interface Tratamiento {
  nombre: string;
  finalidad: string;
  baseJuridica: string;
  interesados: string;
  categoriasDatos: string;
  categoriasEspeciales: string | null;
  destinatarios: string[];
  conservacion: string;
  transferencias: string;
}

export async function registroDeActividades(organizacionId: string) {
  const [organizacion, politica, empresas] = await Promise.all([
    prisma.organizacion.findUnique({ where: { id: organizacionId } }),
    politicaDe(organizacionId),
    prisma.empresaColaboradora.findMany({ where: { organizacionId }, select: { nombre: true, cif: true } }),
  ]);

  const plazo = (campo: keyof typeof politica) => {
    const meses = Number(politica[campo] ?? 0);
    if (meses % 12 === 0) return `${meses / 12} ${meses / 12 === 1 ? "año" : "años"}`;
    return `${meses} meses`;
  };
  const norma = (categoria: string) => CATEGORIAS.find((c) => c.categoria === categoria);

  const colaboradoras = empresas.map((e) => `${e.nombre}${e.cif ? ` (${e.cif})` : ""}`);

  const tratamientos: Tratamiento[] = [
    {
      nombre: "Prestación del servicio de ayuda a domicilio",
      finalidad: "Recibir la petición, planificar las visitas, asignar profesional y dejar constancia de lo que se hizo en cada una",
      baseJuridica: "Ejecución del contrato (art. 6.1.b RGPD)",
      interesados: "Personas atendidas y sus familiares autorizados",
      categoriasDatos: "Identificativos, contacto, domicilio, preferencias de cuidado y registro de las visitas prestadas",
      categoriasEspeciales:
        "Datos de salud imprescindibles para el cuidado (medicación, movilidad, alergias), recogidos con consentimiento explícito (art. 9.2.a RGPD)",
      destinatarios: ["La profesional asignada a cada servicio", ...colaboradoras.map((c) => `${c} — como encargada del tratamiento (art. 28 RGPD)`)],
      conservacion: `${plazo("mesesDatosAsistenciales")} desde el último servicio · ${norma("DATOS_ASISTENCIALES")?.baseLegal ?? ""}`,
      transferencias: "No se realizan transferencias internacionales de datos",
    },
    {
      nombre: "Facturación y cobro",
      finalidad: "Emitir las facturas del servicio, domiciliar los recibos y llevar la contabilidad",
      baseJuridica: "Ejecución del contrato (art. 6.1.b) y obligación legal (art. 6.1.c RGPD)",
      interesados: "Personas atendidas y quien figura como titular del pago",
      categoriasDatos: "Identificativos, NIF, domicilio de facturación, IBAN y mandato de domiciliación, importes y estado de cobro",
      categoriasEspeciales: null,
      destinatarios: ["Entidad bancaria que gestiona los adeudos", "Agencia Estatal de Administración Tributaria", "Asesoría contable y fiscal"],
      conservacion: `${plazo("mesesFacturacion")} desde la emisión · ${norma("FACTURACION")?.baseLegal ?? ""}`,
      transferencias: "No se realizan transferencias internacionales de datos",
    },
    {
      nombre: "Gestión de personal y registro de jornada",
      finalidad: "Contratar, pagar y acreditar la aptitud legal de quien presta el servicio, y registrar su jornada diaria",
      baseJuridica: "Ejecución del contrato de trabajo (art. 6.1.b) y obligación legal (art. 6.1.c RGPD)",
      interesados: "Profesionales en plantilla y profesionales autónomas colaboradoras",
      categoriasDatos: "Identificativos, contacto, titulación, contrato, altas en la Seguridad Social, horas de entrada y salida y ausencias",
      categoriasEspeciales:
        "Certificado negativo del Registro Central de Delincuentes Sexuales (datos penales, art. 10 RGPD), exigido por el art. 57 de la Ley Orgánica 8/2021",
      destinatarios: ["Tesorería General de la Seguridad Social", "Inspección de Trabajo y Seguridad Social", "Asesoría laboral"],
      conservacion: `Jornada: ${plazo("mesesRegistroJornada")} · ${norma("REGISTRO_JORNADA")?.baseLegal ?? ""}. Documentación laboral: ${plazo("mesesDocumentacionLaboral")}`,
      transferencias: "No se realizan transferencias internacionales de datos",
    },
    {
      nombre: "Comunicación con la persona y su familia",
      finalidad: "Avisar de los cambios del servicio, responder mensajes y notificar incidencias",
      baseJuridica: "Ejecución del contrato (art. 6.1.b) y, para los avisos que no son del servicio contratado, consentimiento (art. 6.1.a RGPD)",
      interesados: "Personas atendidas, familiares autorizados y profesionales",
      categoriasDatos: "Contacto y contenido de los mensajes intercambiados en la aplicación",
      categoriasEspeciales: null,
      destinatarios: ["Nadie fuera de la organización"],
      conservacion: `${plazo("mesesMensajes")} desde el envío · ${norma("MENSAJES")?.baseLegal ?? ""}`,
      transferencias: "No se realizan transferencias internacionales de datos",
    },
    {
      nombre: "Seguridad y trazabilidad de los accesos",
      finalidad: "Saber quién ha visto o cambiado cada dato, para poder investigar un incidente y responder de lo hecho",
      baseJuridica: "Interés legítimo en la seguridad del tratamiento (art. 6.1.f) y art. 32 RGPD",
      interesados: "Todas las personas usuarias de la aplicación",
      categoriasDatos: "Identificador de la cuenta, acción realizada, entidad afectada y momento",
      categoriasEspeciales: null,
      destinatarios: ["Nadie fuera de la organización"],
      conservacion: `${plazo("mesesAuditoria")} desde el registro · ${norma("AUDITORIA")?.baseLegal ?? ""}`,
      transferencias: "No se realizan transferencias internacionales de datos",
    },
  ];

  return {
    generado: new Date(),
    titulo: "Registro de actividades de tratamiento",
    normativa: "Artículo 30 del Reglamento (UE) 2016/679 y artículo 31 de la Ley Orgánica 3/2018",
    aviso:
      "Este registro se genera desde la configuración de la aplicación: los plazos de conservación son los que la aplicación aplica de verdad, no los que alguien escribió una vez en un documento.",
    responsable: {
      razonSocial: organizacion?.razonSocial ?? organizacion?.nombre ?? "—",
      cif: organizacion?.cif ?? "—",
      domicilio: [organizacion?.direccionFiscal, organizacion?.codigoPostal, organizacion?.municipio, organizacion?.provincia]
        .filter(Boolean)
        .join(", "),
      contacto: politica.responsableEmail ?? organizacion?.emailFacturacion ?? "—",
      representante: politica.responsableNombre ?? "—",
      delegadoProteccionDatos: politica.delegadoNombre
        ? `${politica.delegadoNombre}${politica.delegadoEmail ? ` · ${politica.delegadoEmail}` : ""}`
        : "No designado. Obligatorio si el tratamiento de datos de salud es a gran escala (art. 37.1.c RGPD); con una cartera pequeña normalmente no lo es, pero conviene revisarlo al crecer.",
    },
    tratamientos,
    encargados: colaboradoras.length
      ? colaboradoras
      : ["Ninguna empresa colaboradora dada de alta todavía"],
    medidasSeguridad: [
      "Acceso con cuenta personal y contraseña cifrada; cada rol ve sólo lo que necesita (la profesional no ve lo que se cobra, la persona no ve el margen).",
      "Registro de auditoría de los accesos y cambios, conservado con su plazo.",
      "Los archivos subidos se guardan con nombre generado por el servidor y sólo se sirven a quien tiene permiso sobre el documento al que acompañan.",
      "Los fichajes no se sobrescriben: una corrección guarda el valor anterior, el motivo y quién la hizo.",
      "Las facturas emitidas no se modifican: se rectifican con una factura nueva que referencia a la anterior.",
    ],
    consentimientosQueSeRecogen: CATALOGO_CONSENTIMIENTOS.map((c) => ({
      etiqueta: c.etiqueta,
      baseLegal: c.baseLegal,
      imprescindible: c.imprescindible,
    })),
    derechos:
      "Las personas interesadas pueden ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad dirigiéndose al responsable, y reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).",
  };
}
