import { prisma } from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// Información y consentimientos
//
// El RGPD no se cumple colgando una política en la web. Hay que poder
// demostrar, persona a persona, que se le informó de qué se hace con sus datos
// (art. 13), qué autorizó y cuándo, y hay que poder retirarlo con la misma
// facilidad con la que se dio (art. 7.3).
//
// Aquí está el catálogo: qué se le pide a cada persona, con qué base jurídica
// y si el servicio se puede prestar sin ello. Dos aclaraciones que se olvidan
// a menudo en un servicio de ayuda a domicilio:
//
//   - El servicio en sí NO se presta "por consentimiento": se presta porque
//     hay un contrato (art. 6.1.b). Pedir consentimiento para lo que ya
//     sostiene el contrato confunde a la persona y no aporta nada.
//   - Los datos de salud son categoría especial (art. 9). Aquí se recogen por
//     consentimiento explícito (art. 9.2.a), que es lo que corresponde a una
//     empresa privada de ayuda a domicilio que no es centro sanitario.
// ---------------------------------------------------------------------------

export type TipoConsentimiento = "INFORMACION" | "DATOS_SALUD" | "CESION_PROFESIONAL" | "IMAGEN" | "COMUNICACIONES";

export interface FichaConsentimiento {
  tipo: TipoConsentimiento;
  etiqueta: string;
  // Lo que se le dice a la persona, en su idioma, no en el del reglamento.
  queSeLePide: string;
  baseLegal: string;
  // Sin esto no se puede empezar a atender. Lo que no es imprescindible se
  // pide igual, pero un "no" no impide el servicio: si lo impidiera, el
  // consentimiento no sería libre (art. 7.4) y por tanto no valdría.
  imprescindible: boolean;
  // Por qué es imprescindible, o qué se pierde si se dice que no.
  consecuencia: string;
}

// La versión del texto informativo. Cambiarla obliga a volver a informar: por
// eso se guarda en cada consentimiento, para saber dentro de dos años a qué
// estaba diciendo que sí esta persona.
export const VERSION_INFORMACION = "2026.1";

export const CATALOGO: FichaConsentimiento[] = [
  {
    tipo: "INFORMACION",
    etiqueta: "Información entregada",
    queSeLePide:
      "Se le ha explicado quién trata sus datos, para qué, cuánto tiempo se guardan y cómo ejercer sus derechos, y se le ha entregado por escrito.",
    baseLegal: "Arts. 12 y 13 del RGPD",
    imprescindible: true,
    consecuencia: "Informar no es opcional ni depende de que la persona quiera: es una obligación de la empresa antes de tratar un solo dato.",
  },
  {
    tipo: "DATOS_SALUD",
    etiqueta: "Datos de salud y cuidados",
    queSeLePide:
      "Anotar la medicación, la movilidad, las alergias y lo que haga falta saber para cuidarla bien, y que lo vea quien entra en su casa.",
    baseLegal: "Art. 9.2.a del RGPD (consentimiento explícito para categorías especiales)",
    imprescindible: true,
    consecuencia: "Sin esto no se puede preparar un plan de cuidados ni avisar de un riesgo a quien va a atenderla.",
  },
  {
    tipo: "CESION_PROFESIONAL",
    etiqueta: "Sus datos llegan a quien la atiende",
    queSeLePide:
      "Que su nombre, dirección, teléfono y lo necesario del plan de cuidados lleguen a la profesional asignada y, si procede, a la empresa colaboradora con la que trabaja.",
    baseLegal: "Art. 6.1.b del RGPD (ejecución del contrato) y art. 28 para la empresa colaboradora",
    imprescindible: true,
    consecuencia: "Nadie puede ir a su casa sin saber a dónde va ni a quién atiende.",
  },
  {
    tipo: "IMAGEN",
    etiqueta: "Imagen",
    queSeLePide: "Hacer fotografías o vídeos en actividades y poder usarlos en memorias, redes sociales o materiales de la empresa.",
    baseLegal: "Art. 6.1.a del RGPD (consentimiento) y LO 1/1982 sobre el derecho a la propia imagen",
    imprescindible: false,
    consecuencia: "Si dice que no, no se le hacen fotos. El servicio es exactamente el mismo.",
  },
  {
    tipo: "COMUNICACIONES",
    etiqueta: "Avisos y novedades",
    queSeLePide: "Recibir información sobre otros servicios, actividades o novedades de la empresa que no tienen que ver con lo que ha contratado.",
    baseLegal: "Art. 6.1.a del RGPD y art. 21 de la LSSI",
    imprescindible: false,
    consecuencia: "Si dice que no, sólo recibirá los avisos de su propio servicio.",
  },
];

export function fichaDe(tipo: TipoConsentimiento): FichaConsentimiento {
  const f = CATALOGO.find((c) => c.tipo === tipo);
  if (!f) throw new Error(`Tipo de consentimiento desconocido: ${tipo}`);
  return f;
}

export interface EstadoConsentimiento extends FichaConsentimiento {
  // "sin_preguntar" no es lo mismo que "denegado": la ausencia de respuesta es
  // una tarea pendiente de coordinación, la negativa es una decisión de la
  // persona que hay que respetar.
  estado: "otorgado" | "denegado" | "revocado" | "sin_preguntar";
  fecha: Date | null;
  version: string | null;
  canal: string | null;
  recogidoPor: string | null;
  // El texto vigente ha cambiado desde que se informó: hay que volver a
  // informar, porque lo que firmó ya no es lo que se hace.
  versionCaducada: boolean;
  nota: string | null;
}

// El estado actual de cada punto del catálogo para una persona: siempre las
// cinco filas, contestadas o no. Una pantalla que sólo enseña lo que hay en la
// base de datos deja invisible justo lo que falta.
export async function estadoDe(personaId: string): Promise<EstadoConsentimiento[]> {
  const filas = await prisma.consentimiento.findMany({
    where: { personaId },
    orderBy: { otorgadoAt: "desc" },
    include: { recogidoPor: { select: { nombre: true, email: true } } },
  });
  return CATALOGO.map((ficha) => {
    const ultimo = filas.find((f) => f.tipo === ficha.tipo);
    if (!ultimo) {
      return { ...ficha, estado: "sin_preguntar" as const, fecha: null, version: null, canal: null, recogidoPor: null, versionCaducada: false, nota: null };
    }
    const estado = ultimo.revocadoAt ? ("revocado" as const) : ultimo.otorgado ? ("otorgado" as const) : ("denegado" as const);
    return {
      ...ficha,
      estado,
      fecha: ultimo.revocadoAt ?? ultimo.otorgadoAt,
      version: ultimo.version,
      canal: ultimo.canal,
      recogidoPor: ultimo.recogidoPor?.nombre ?? ultimo.recogidoPor?.email ?? null,
      versionCaducada: estado === "otorgado" && ultimo.version !== VERSION_INFORMACION,
      nota: ultimo.nota,
    };
  });
}

// Lo que impide atender a esta persona con todas las garantías. Se usa igual
// que las carencias del expediente de un profesional: se ve en su ficha y se
// cuela en la bandeja de coordinación, en vez de descubrirse el día de una
// inspección.
export interface CarenciaRgpd {
  tipo: TipoConsentimiento;
  etiqueta: string;
  motivo: "sin_preguntar" | "version_caducada";
}

export async function carenciasDe(personaId: string): Promise<CarenciaRgpd[]> {
  const estado = await estadoDe(personaId);
  const carencias: CarenciaRgpd[] = [];
  for (const c of estado) {
    // Un "no" a lo que no es imprescindible es una respuesta válida, no una
    // carencia. Un "no" a lo imprescindible tampoco se arregla insistiendo:
    // lo que hay que resolver es la conversación, y eso ya se ve en la ficha.
    if (c.imprescindible && c.estado === "sin_preguntar") carencias.push({ tipo: c.tipo, etiqueta: c.etiqueta, motivo: "sin_preguntar" });
    else if (c.versionCaducada) carencias.push({ tipo: c.tipo, etiqueta: c.etiqueta, motivo: "version_caducada" });
  }
  return carencias;
}
