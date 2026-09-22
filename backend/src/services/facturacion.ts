import { prisma } from "../lib/prisma.js";

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

// "A/2026/0007": lo que ve el cliente y lo que se declara.
export function referenciaFactura(serie: string, ejercicio: number, numero: number): string {
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
  };
}

// Qué le falta a una factura para poder emitirse. Se devuelven todos los
// problemas juntos y no el primero: así se corrigen de una vez en vez de
// descubrirlos de uno en uno.
export function problemasParaEmitir(partes: PartesFactura, domiciliado: boolean, tieneMandato: boolean): string[] {
  const faltan: string[] = [];
  if (!partes.emisorNombre) faltan.push("la razón social de la empresa");
  if (!partes.emisorCif) faltan.push("el CIF de la empresa");
  if (!partes.titularNombre) faltan.push("el titular de la factura");
  if (!partes.titularNif) faltan.push("el NIF del titular");
  if (domiciliado && !tieneMandato) faltan.push("un mandato SEPA en vigor para poder domiciliar");
  return faltan;
}
