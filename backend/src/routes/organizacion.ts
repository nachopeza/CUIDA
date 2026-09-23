import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { autenticar, requiereRol } from "../middleware/auth.js";
import { registrarAuditoria } from "../services/audit.js";
import { ibanValido } from "../services/sepa.js";

// ---------------------------------------------------------------------------
// La ficha de la empresa
//
// Hasta ahora la identidad fiscal existía solo porque el seed la escribía
// directamente en la base: la factura la imprimía, pero nadie podía verla ni
// cambiarla desde la aplicación. Una empresa que no puede corregir su propio
// CIF no es un producto.
//
// Además de guardar, esta ruta se comprueba a sí misma: un dato que falta no
// se descubre al configurar, se descubre el día que no se puede emitir una
// factura o generar el fichero del banco.
// ---------------------------------------------------------------------------
export const organizacionRouter = Router();
organizacionRouter.use(autenticar);

const soloGestion = requiereRol("COORDINADOR", "ORGANIZACION", "ADMIN");

export interface Carencia {
  campo: string;
  etiqueta: string;
  // Qué no se puede hacer sin esto. Lo que de verdad importa no es que el
  // campo esté vacío, es lo que se queda bloqueado.
  impide: string | null;
  porque: string;
}

type Org = Awaited<ReturnType<typeof prisma.organizacion.findUniqueOrThrow>>;

function revisar(org: Org): { bloqueantes: Carencia[]; recomendadas: Carencia[]; avisos: string[] } {
  const bloqueantes: Carencia[] = [];
  const recomendadas: Carencia[] = [];
  const avisos: string[] = [];

  const falta = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

  if (falta(org.razonSocial)) {
    bloqueantes.push({
      campo: "razonSocial",
      etiqueta: "Razón social",
      impide: "Emitir facturas",
      porque: "Toda factura debe identificar a quien la expide",
    });
  }
  if (falta(org.cif)) {
    bloqueantes.push({
      campo: "cif",
      etiqueta: "CIF",
      impide: "Emitir facturas",
      porque: "Es el NIF del expedidor, obligatorio en la factura",
    });
  }
  if (falta(org.direccionFiscal) || falta(org.municipio)) {
    bloqueantes.push({
      campo: "direccionFiscal",
      etiqueta: "Domicilio fiscal",
      impide: "Emitir facturas",
      porque: "El domicilio del expedidor es una mención obligatoria de la factura",
    });
  }
  if (falta(org.ibanCobro)) {
    bloqueantes.push({
      campo: "ibanCobro",
      etiqueta: "IBAN de cobro",
      impide: "Generar el fichero de remesas para el banco",
      porque: "Es la cuenta donde entra el dinero de los recibos",
    });
  } else if (!ibanValido(String(org.ibanCobro))) {
    bloqueantes.push({
      campo: "ibanCobro",
      etiqueta: "IBAN de cobro",
      impide: "Generar el fichero de remesas para el banco",
      porque: "El IBAN que hay guardado no pasa el dígito de control: está mal escrito",
    });
  }
  if (falta(org.identificadorAcreedor)) {
    bloqueantes.push({
      campo: "identificadorAcreedor",
      etiqueta: "Identificador de acreedor SEPA",
      impide: "Generar el fichero de remesas para el banco",
      porque: "Lo asigna el banco y va en cada adeudo; sin él el fichero se rechaza",
    });
  }

  // Los datos del Registro Mercantil son obligatorios en la factura de una
  // sociedad (art. 24 de la Ley de Sociedades de Capital), pero no para una
  // persona física, así que solo se reclaman cuando procede.
  const esSociedad = /S\.?\s?L|S\.?\s?A|SOCIEDAD|COOPERATIVA/i.test(String(org.formaJuridica ?? org.razonSocial ?? ""));
  if (esSociedad && (falta(org.registroMercantil) || falta(org.registroTomo))) {
    recomendadas.push({
      campo: "registroMercantil",
      etiqueta: "Datos del Registro Mercantil",
      impide: null,
      porque: "Una sociedad debe hacerlos constar en sus facturas (art. 24 de la Ley de Sociedades de Capital)",
    });
  }
  if (falta(org.epigrafeIae)) {
    recomendadas.push({
      campo: "epigrafeIae",
      etiqueta: "Epígrafe de IAE",
      impide: null,
      porque: "Es el alta censal con la que se factura la actividad",
    });
  }
  if (falta(org.seguroPoliza)) {
    recomendadas.push({
      campo: "seguroPoliza",
      etiqueta: "Seguro de responsabilidad civil",
      impide: null,
      porque: "En ayuda a domicilio se exige para poder prestar el servicio en casi toda España",
    });
  }
  if (falta(org.registroEntidadesNumero)) {
    recomendadas.push({
      campo: "registroEntidadesNumero",
      etiqueta: "Registro de entidades de servicios sociales",
      impide: null,
      porque: "La autorización administrativa para operar como entidad de servicios sociales",
    });
  }

  // La póliza caduca, y descubrirlo el día que hay un percance es tarde.
  if (org.seguroVencimiento) {
    const dias = Math.ceil((org.seguroVencimiento.getTime() - Date.now()) / 86400000);
    if (dias < 0) {
      bloqueantes.push({
        campo: "seguroVencimiento",
        etiqueta: "Seguro de responsabilidad civil",
        impide: "Prestar el servicio con cobertura",
        porque: `La póliza venció hace ${Math.abs(dias)} días`,
      });
    } else if (dias <= 60) {
      avisos.push(`La póliza de responsabilidad civil vence en ${dias} días: renuévala antes de que caduque.`);
    }
  }

  return { bloqueantes, recomendadas, avisos };
}

organizacionRouter.get("/", soloGestion, async (req, res) => {
  const org = await prisma.organizacion.findUniqueOrThrow({ where: { id: req.usuario!.organizacionId! } });
  // Cuántas facturas lleva emitidas la serie en curso: es lo que explica por
  // qué la serie y el ejercicio no se tocan a la ligera.
  const ejercicio = new Date().getFullYear();
  const emitidas = await prisma.factura.count({
    where: { organizacionId: org.id, serie: org.serieFactura, ejercicio, numero: { not: null } },
  });
  res.json({
    organizacion: {
      ...org,
      comisionPorcentaje: Number(org.comisionPorcentaje),
      ivaPorDefecto: Number(org.ivaPorDefecto),
      seguroCobertura: org.seguroCobertura == null ? null : Number(org.seguroCobertura),
    },
    ...revisar(org),
    numeracion: { serie: org.serieFactura, ejercicio, emitidas },
  });
});

const schema = z.object({
  nombre: z.string().min(2),
  razonSocial: z.string().optional().nullable(),
  cif: z.string().optional().nullable(),
  formaJuridica: z.string().optional().nullable(),
  direccionFiscal: z.string().optional().nullable(),
  codigoPostal: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  emailFacturacion: z.string().optional().nullable(),
  web: z.string().optional().nullable(),
  registroMercantil: z.string().optional().nullable(),
  registroTomo: z.string().optional().nullable(),
  registroFolio: z.string().optional().nullable(),
  registroHoja: z.string().optional().nullable(),
  cnae: z.string().optional().nullable(),
  epigrafeIae: z.string().optional().nullable(),
  ibanCobro: z.string().optional().nullable(),
  bicCobro: z.string().optional().nullable(),
  identificadorAcreedor: z.string().optional().nullable(),
  serieFactura: z.string().min(1).max(4),
  ivaPorDefecto: z.number().min(0).max(100),
  diasVencimiento: z.number().int().min(0).max(365),
  comisionPorcentaje: z.number().min(0).max(100),
  seguroAseguradora: z.string().optional().nullable(),
  seguroPoliza: z.string().optional().nullable(),
  seguroCobertura: z.number().min(0).optional().nullable(),
  seguroVencimiento: z.string().optional().nullable(),
  registroEntidadesNumero: z.string().optional().nullable(),
  registroEntidadesOrgano: z.string().optional().nullable(),
});

organizacionRouter.put("/", soloGestion, async (req, res) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const organizacionId = req.usuario!.organizacionId!;
  const antes = await prisma.organizacion.findUniqueOrThrow({ where: { id: organizacionId } });

  const iban = parsed.data.ibanCobro?.replace(/\s+/g, "").toUpperCase() || null;
  if (iban && !ibanValido(iban)) {
    return res.status(400).json({ error: "Ese IBAN no es válido: revisa que esté completo y bien copiado" });
  }

  // La serie de facturación no se cambia con facturas ya emitidas dentro del
  // ejercicio: la numeración tiene que ser correlativa y sin huecos dentro de
  // cada serie, y cambiarla a mitad de año rompe justamente eso.
  const ejercicio = new Date().getFullYear();
  if (parsed.data.serieFactura !== antes.serieFactura) {
    const emitidas = await prisma.factura.count({
      where: { organizacionId, serie: antes.serieFactura, ejercicio, numero: { not: null } },
    });
    if (emitidas > 0) {
      return res.status(409).json({
        error: `No se puede cambiar la serie "${antes.serieFactura}" a mitad de ejercicio: ya hay ${emitidas} factura${emitidas === 1 ? "" : "s"} emitida${emitidas === 1 ? "" : "s"} en ${ejercicio}. La numeración debe ser correlativa dentro de cada serie.`,
      });
    }
  }

  const org = await prisma.organizacion.update({
    where: { id: organizacionId },
    data: {
      ...parsed.data,
      ibanCobro: iban,
      seguroVencimiento: parsed.data.seguroVencimiento ? new Date(parsed.data.seguroVencimiento) : null,
      seguroCobertura: parsed.data.seguroCobertura ?? null,
    },
  });

  // Se anota qué cambió, no solo que se guardó: el CIF o el IBAN de cobro de
  // una empresa no son un campo cualquiera.
  const sensibles = ["razonSocial", "cif", "ibanCobro", "identificadorAcreedor", "serieFactura"] as const;
  const cambios = sensibles.filter((c) => String(antes[c] ?? "") !== String((org as Record<string, unknown>)[c] ?? ""));
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    organizacionId,
    accion: "editar_empresa",
    entidadTipo: "Organizacion",
    entidadId: org.id,
    detalle: cambios.length > 0 ? `Cambia ${cambios.join(", ")}` : undefined,
  });

  res.json({
    organizacion: {
      ...org,
      comisionPorcentaje: Number(org.comisionPorcentaje),
      ivaPorDefecto: Number(org.ivaPorDefecto),
      seguroCobertura: org.seguroCobertura == null ? null : Number(org.seguroCobertura),
    },
    ...revisar(org),
  });
});
