import { prisma } from "./prisma.js";

// Identificadores permanentes legibles (sección 5 del masterplan): CUI-000184,
// SOL-000582, SRV-000721, VIS-001923, PRO-00031, ORG-00017, INC-000045...
// Se generan por conteo de la tabla + 1, con padding fijo. Suficiente para
// fase 1 (volumen bajo); si hay escritura concurrente alta, migrar a una
// secuencia de base de datos dedicada.

const PREFIXES = {
  organizacion: "ORG",
  persona: "CUI",
  profesional: "PRO",
  solicitud: "SOL",
  servicio: "SRV",
  visita: "VIS",
  incidencia: "INC",
  empresaColaboradora: "EXT",
  factura: "FAC",
  mandato: "MND",
  remesa: "REM",
  liquidacion: "LIQ",
  registro: "REG",
} as const;

type Entidad = keyof typeof PREFIXES;

const PADDING: Record<Entidad, number> = {
  organizacion: 5,
  persona: 6,
  profesional: 5,
  solicitud: 6,
  servicio: 6,
  visita: 6,
  incidencia: 6,
  empresaColaboradora: 5,
  factura: 6,
  mandato: 6,
  remesa: 6,
  liquidacion: 6,
  registro: 6,
};

async function contar(entidad: Entidad): Promise<number> {
  switch (entidad) {
    case "organizacion":
      return prisma.organizacion.count();
    case "persona":
      return prisma.persona.count();
    case "profesional":
      return prisma.profesional.count();
    case "solicitud":
      return prisma.solicitud.count();
    case "servicio":
      return prisma.servicio.count();
    case "visita":
      return prisma.visita.count();
    case "incidencia":
      return prisma.incidencia.count();
    case "empresaColaboradora":
      return prisma.empresaColaboradora.count();
    case "factura":
      return prisma.factura.count();
    case "mandato":
      return prisma.mandatoSepa.count();
    case "remesa":
      return prisma.remesa.count();
    case "liquidacion":
      return prisma.liquidacion.count();
    case "registro":
      return prisma.registroJornada.count();
  }
}

export async function generarCodigo(entidad: Entidad): Promise<string> {
  const actual = await contar(entidad);
  const siguiente = actual + 1;
  const numero = String(siguiente).padStart(PADDING[entidad], "0");
  return `${PREFIXES[entidad]}-${numero}`;
}
