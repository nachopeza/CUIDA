import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";

// ---------------------------------------------------------------------------
// Registro de facturación (RD 1007/2023, el "reglamento Veri*factu")
//
// Desde 2026 el software de facturación tiene que generar, por cada factura
// emitida, un registro encadenado con el anterior mediante una huella
// SHA-256. La cadena es lo que hace que no se pueda borrar ni reordenar una
// factura sin que se note: cambiar cualquier cosa rompe todas las huellas
// posteriores.
//
// Lo que hace esta aplicación: generar el registro, encadenarlo, imprimir el
// QR de cotejo y poder comprobar la cadena entera. Lo que NO hace y hay que
// tener claro: no envía los registros a la AEAT (eso es la modalidad
// "Veri*factu" con su servicio web y su certificado) y no sustituye a la
// declaración responsable que el fabricante del software debe emitir. Está
// escrito también en la pantalla, para que nadie dé por hecho lo que no es.
// ---------------------------------------------------------------------------

export const SISTEMA = "CUIDA";
export const VERSION_SISTEMA = "1.0";

// URL de cotejo de la sede electrónica. En producción, con Veri*factu activo,
// apunta al validador de la AEAT; aquí se compone igual para que el QR lleve
// los mismos datos y el mismo formato.
const BASE_COTEJO = "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";

function dosDecimales(n: unknown) {
  return Number(n ?? 0).toFixed(2);
}

// dd-mm-aaaa, que es el formato que pide la orden ministerial para el campo
// de fecha de expedición dentro de la huella.
export function fechaEspanola(fecha: Date) {
  const d = String(fecha.getDate()).padStart(2, "0");
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${d}-${m}-${fecha.getFullYear()}`;
}

// Fecha y hora con huso horario, en ISO 8601 (2026-09-23T12:31:05+02:00).
export function fechaHoraConHuso(fecha: Date) {
  const desfase = -fecha.getTimezoneOffset();
  const signo = desfase >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(desfase) / 60)).padStart(2, "0");
  const mm = String(Math.abs(desfase) % 60).padStart(2, "0");
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  return `${local}${signo}${hh}:${mm}`;
}

export interface CamposHuella {
  nifEmisor: string;
  numSerieFactura: string;
  fechaExpedicion: string;
  tipoFactura: string;
  cuotaTotal: string;
  importeTotal: string;
  huellaAnterior: string;
  fechaHoraHusoGen: string;
}

// El orden y el nombre de los campos no son decorativos: la huella solo sirve
// si cualquiera puede recalcularla igual, y quien la recalcula sigue la orden
// ministerial, no nuestro criterio.
export function huellaDe(c: CamposHuella): string {
  const cadena = [
    `IDEmisorFactura=${c.nifEmisor}`,
    `NumSerieFactura=${c.numSerieFactura}`,
    `FechaExpedicionFactura=${c.fechaExpedicion}`,
    `TipoFactura=${c.tipoFactura}`,
    `CuotaTotal=${c.cuotaTotal}`,
    `ImporteTotal=${c.importeTotal}`,
    `Huella=${c.huellaAnterior}`,
    `FechaHoraHusoGenRegistro=${c.fechaHoraHusoGen}`,
  ].join("&");
  return createHash("sha256").update(cadena, "utf8").digest("hex").toUpperCase();
}

export function urlDeCotejo(nif: string, numSerie: string, fecha: string, total: string) {
  const p = new URLSearchParams({ nif, numserie: numSerie, fecha, importe: total });
  return `${BASE_COTEJO}?${p.toString()}`;
}

export async function qrSvg(url: string): Promise<string> {
  // Corrección de errores M y margen mínimo: lo que cabe en una esquina de la
  // factura sin comerse el resto del documento.
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 120 });
}

interface DatosFactura {
  id: string;
  organizacionId: string;
  serie: string;
  numero: number;
  ejercicio: number;
  fechaEmision: Date;
  totalIva: unknown;
  totalConIva: unknown;
  facturaRectificadaId?: string | null;
}

// Crea el registro de alta de una factura recién emitida, encadenado con el
// último registro de esta organización. Se llama dentro de la emisión: una
// factura emitida sin registro sería justo lo que el reglamento prohíbe.
export async function registrarAlta(factura: DatosFactura, nifEmisor: string) {
  const anterior = await prisma.registroFacturacion.findFirst({
    where: { organizacionId: factura.organizacionId },
    orderBy: { createdAt: "desc" },
  });

  const numSerieFactura = `${factura.serie}${factura.ejercicio}/${String(factura.numero).padStart(6, "0")}`;
  const fechaExpedicion = fechaEspanola(factura.fechaEmision);
  // F1 es la factura completa; R1 la rectificativa por error fundado en
  // derecho, que es el supuesto normal cuando se corrige una factura ya
  // emitida a un particular.
  const tipoFactura = factura.facturaRectificadaId ? "R1" : "F1";
  const cuotaTotal = dosDecimales(factura.totalIva);
  const importeTotal = dosDecimales(factura.totalConIva);
  const fechaHoraHusoGen = fechaHoraConHuso(new Date());
  const huella = huellaDe({
    nifEmisor,
    numSerieFactura,
    fechaExpedicion,
    tipoFactura,
    cuotaTotal,
    importeTotal,
    huellaAnterior: anterior?.huella ?? "",
    fechaHoraHusoGen,
  });

  return prisma.registroFacturacion.create({
    data: {
      organizacionId: factura.organizacionId,
      facturaId: factura.id,
      nifEmisor,
      numSerieFactura,
      fechaExpedicion,
      tipoFactura,
      cuotaTotal: Number(cuotaTotal),
      importeTotal: Number(importeTotal),
      huellaAnterior: anterior?.huella ?? null,
      huella,
      fechaHoraHusoGen,
      sistemaInformatico: SISTEMA,
      versionSistema: VERSION_SISTEMA,
      urlCotejo: urlDeCotejo(nifEmisor, numSerieFactura, fechaExpedicion, importeTotal),
    },
  });
}

export interface ResultadoCadena {
  total: number;
  correctos: number;
  rotos: Array<{ numSerieFactura: string; problema: string }>;
}

// Recalcular la cadena entera. Es lo que se enseña cuando alguien pregunta "¿y
// cómo sé que nadie ha tocado esto?": si un registro se borró, se cambió un
// importe o se reordenó, aquí sale.
export async function comprobarCadena(organizacionId: string): Promise<ResultadoCadena> {
  const registros = await prisma.registroFacturacion.findMany({
    where: { organizacionId },
    orderBy: { createdAt: "asc" },
  });
  const rotos: ResultadoCadena["rotos"] = [];
  let esperadaAnterior = "";
  for (const r of registros) {
    if ((r.huellaAnterior ?? "") !== esperadaAnterior) {
      rotos.push({ numSerieFactura: r.numSerieFactura, problema: "No encadena con el registro anterior" });
    }
    const recalculada = huellaDe({
      nifEmisor: r.nifEmisor,
      numSerieFactura: r.numSerieFactura,
      fechaExpedicion: r.fechaExpedicion,
      tipoFactura: r.tipoFactura,
      cuotaTotal: dosDecimales(r.cuotaTotal),
      importeTotal: dosDecimales(r.importeTotal),
      huellaAnterior: r.huellaAnterior ?? "",
      fechaHoraHusoGen: r.fechaHoraHusoGen,
    });
    if (recalculada !== r.huella) {
      rotos.push({ numSerieFactura: r.numSerieFactura, problema: "La huella no cuadra con los datos registrados" });
    }
    esperadaAnterior = r.huella;
  }
  return { total: registros.length, correctos: registros.length - rotos.length, rotos };
}
