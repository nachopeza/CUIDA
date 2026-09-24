import { prisma } from "../lib/prisma.js";
import { registrarAlta } from "./registroFacturacion.js";

// Todo lo que convierte una factura en un documento entregable: numeración
// correlativa, congelado de los datos de las partes y vencimiento. Vive
// aparte de la ruta porque la emisión, la rectificación y la remesa necesitan
// exactamente las mismas reglas.

export function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// El siguiente número libre de la serie dentro del ejercicio. Se consulta el
// máximo en vez de llevar un contador en la organización: un contador se
// desincroniza en cuanto alguien borra una fila a mano y deja huecos, que es
// justo lo que no puede pasar.
export async function siguienteNumero(organizacionId: string, serie: string, ejercicio: number): Promise<number> {
  const ultima = await prisma.factura.findFirst({
    where: { organizacionId, serie, ejercicio, numero: { gt: 0 } },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultima?.numero ?? 0) + 1;
}

// "A/2026/0007": lo que ve el cliente y lo que se declara. Un borrador todavía
// no tiene número, y decirlo es mejor que enseñar un "0000" que parece real.
export function referenciaFactura(serie: string, ejercicio: number, numero: number | null): string {
  if (numero == null) return `${serie}/${ejercicio}/borrador`;
  return `${serie}/${ejercicio}/${String(numero).padStart(4, "0")}`;
}

export function sumarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

// Cuándo vence. Domiciliado: el día de cobro pactado del mes siguiente, que
// es como trabajan las empresas del sector. Cualquier otra forma de pago:
// los días acordados desde la emisión.
export function calcularVencimiento(emision: Date, domiciliado: boolean, diaCobro: number, diasVencimiento: number): Date {
  if (!domiciliado) return sumarDias(emision, diasVencimiento);
  const vencimiento = new Date(emision);
  vencimiento.setMonth(vencimiento.getMonth() + 1);
  // Un día 31 en un mes de 30 se va al mes siguiente si no se corrige.
  const ultimoDia = new Date(vencimiento.getFullYear(), vencimiento.getMonth() + 1, 0).getDate();
  vencimiento.setDate(Math.min(diaCobro, ultimoDia));
  return vencimiento;
}

export interface PartesFactura {
  titularNombre: string;
  titularNif: string | null;
  titularDireccion: string | null;
  emisorNombre: string;
  emisorCif: string | null;
  emisorDireccion: string | null;
  emisorRegistro: string | null;
}

function direccionDe(d: { direccionFiscal?: string | null; codigoPostal?: string | null; municipio?: string | null; provincia?: string | null }): string | null {
  const partes = [d.direccionFiscal, [d.codigoPostal, d.municipio].filter(Boolean).join(" "), d.provincia].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

// Quién factura a quién, tal y como quedará escrito en el documento. Si el
// cliente no tiene datos de facturación se usa el nombre de la persona
// atendida: la factura sale igual, pero incompleta y marcada como tal.
export async function partesDeLaFactura(personaId: string, organizacionId: string): Promise<PartesFactura> {
  const [persona, datos, organizacion] = await Promise.all([
    prisma.persona.findUnique({ where: { id: personaId } }),
    prisma.datosFacturacion.findUnique({ where: { personaId } }),
    prisma.organizacion.findUnique({ where: { id: organizacionId } }),
  ]);
  return {
    titularNombre: datos?.titular ?? `${persona?.nombre ?? ""} ${persona?.apellidos ?? ""}`.trim(),
    titularNif: datos?.nif ?? null,
    titularDireccion: datos ? direccionDe(datos) : (persona?.direccion ?? null),
    emisorNombre: organizacion?.razonSocial ?? organizacion?.nombre ?? "",
    emisorCif: organizacion?.cif ?? null,
    emisorDireccion: organizacion ? direccionDe(organizacion) : null,
    emisorRegistro: organizacion ? registroDe(organizacion) : null,
  };
}

// Qué le falta a una factura para poder emitirse. Se devuelven todos los
// problemas juntos y no el primero: así se corrigen de una vez en vez de
// descubrirlos de uno en uno.
// "Registro Mercantil de Cantabria, tomo 412, folio 88, hoja S-9021". Si no hay
// datos registrales no se inventa nada: se devuelve null y el pie no aparece.
function registroDe(o: {
  registroMercantil?: string | null;
  registroTomo?: string | null;
  registroFolio?: string | null;
  registroHoja?: string | null;
}): string | null {
  if (!o.registroMercantil) return null;
  const partes = [
    o.registroTomo ? `tomo ${o.registroTomo}` : null,
    o.registroFolio ? `folio ${o.registroFolio}` : null,
    o.registroHoja ? `hoja ${o.registroHoja}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? `${o.registroMercantil}, ${partes.join(", ")}` : o.registroMercantil;
}

export function problemasParaEmitir(partes: PartesFactura, domiciliado: boolean, tieneMandato: boolean): string[] {
  const faltan: string[] = [];
  if (!partes.emisorNombre) faltan.push("la razón social de la empresa");
  if (!partes.emisorCif) faltan.push("el CIF de la empresa");
  if (!partes.titularNombre) faltan.push("el titular de la factura");
  if (!partes.titularNif) faltan.push("el NIF del titular");
  if (domiciliado && !tieneMandato) faltan.push("un mandato SEPA en vigor para poder domiciliar");
  return faltan;
}

// ---------------------------------------------------------------------------
// Emitir
//
// Vive aquí y no dentro de la ruta porque emitir es una operación con reglas
// —numeración correlativa, plazo de vencimiento, registro encadenado del
// RD 1007/2023— y esas reglas tienen que ser las mismas se entre por donde se
// entre: desde el panel de coordinación o desde el seed que prepara la demo.
// Duplicarlas era garantizar que un día dejaran de coincidir.
//
// Devuelve el motivo en vez de lanzar: quien llama decide si eso es un 409
// para la coordinadora o un aviso por consola.
// ---------------------------------------------------------------------------
export type ResultadoEmision =
  | { ok: true; factura: Awaited<ReturnType<typeof prisma.factura.update>>; registro: { huella: string; urlCotejo: string } }
  | { ok: false; motivo: string };

export async function emitirFactura(facturaId: string, organizacionId: string, incluir?: object): Promise<ResultadoEmision> {
  const factura = await prisma.factura.findUnique({ where: { id: facturaId } });
  if (!factura) return { ok: false, motivo: "Factura no encontrada" };
  if (factura.organizacionId !== organizacionId) return { ok: false, motivo: "Sin permiso" };
  if (factura.estado !== "BORRADOR") return { ok: false, motivo: `La factura ${factura.codigo} ya está emitida` };

  const partes = await partesDeLaFactura(factura.personaId, factura.organizacionId);
  const datos = await prisma.datosFacturacion.findUnique({
    where: { personaId: factura.personaId },
    include: { mandatos: true },
  });
  const domiciliado = factura.formaPago === "DOMICILIACION";
  const mandato = datos?.mandatos.find((m) => m.estado === "ACTIVO") ?? null;

  const faltan = problemasParaEmitir(partes, domiciliado, mandato != null);
  if (faltan.length > 0) return { ok: false, motivo: `No se puede emitir todavía: falta ${faltan.join(", ")}.` };

  const empresa = await prisma.organizacion.findUnique({
    where: { id: factura.organizacionId },
    select: { diasVencimiento: true, cif: true },
  });
  // Sin NIF no hay registro de facturación posible, y sin registro no se
  // puede emitir: el RD 1007/2023 no admite emitir primero y registrar luego.
  if (!empresa?.cif) {
    return { ok: false, motivo: "Falta el CIF de la empresa: sin él no se puede generar el registro de facturación obligatorio." };
  }

  const emision = new Date();
  const numero = await siguienteNumero(factura.organizacionId, factura.serie, factura.ejercicio);
  const emitida = await prisma.factura.update({
    where: { id: factura.id },
    data: {
      estado: "EMITIDA",
      numero,
      fechaEmision: emision,
      // Los días de plazo salen de lo pactado con este cliente y, si no hay
      // nada pactado, de lo que la empresa tenga puesto por defecto.
      fechaVencimiento: calcularVencimiento(emision, domiciliado, datos?.diaCobro ?? 5, datos?.diasVencimiento ?? empresa.diasVencimiento ?? 30),
      mandatoSepaId: domiciliado ? mandato!.id : null,
      ...partes,
    },
    ...(incluir ? { include: incluir as never } : {}),
  });

  // El registro va después del update porque necesita el número ya asignado, y
  // antes de dar por buena la emisión porque una factura emitida sin registro
  // es justo lo que el reglamento prohíbe.
  const registro = await registrarAlta(
    {
      id: emitida.id,
      organizacionId: emitida.organizacionId,
      serie: emitida.serie,
      numero,
      ejercicio: emitida.ejercicio,
      fechaEmision: emision,
      totalIva: emitida.ivaTotal,
      totalConIva: emitida.totalConIva,
      facturaRectificadaId: emitida.facturaRectificadaId,
    },
    empresa.cif,
  );

  return { ok: true, factura: emitida, registro };
}
