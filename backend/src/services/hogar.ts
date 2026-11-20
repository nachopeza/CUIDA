import { prisma } from "../lib/prisma.js";
import { notificarUsuario } from "./notificaciones.js";

// ---------------------------------------------------------------------------
// Empleo de hogar gestionado: los trámites y la nómina
//
// La familia es la empleadora; CUIDA hace el papeleo. Lo que tiene que estar
// hecho antes de que la trabajadora empiece es el alta en la Seguridad Social
// —el alta es previa, nunca el mismo día después— y el contrato firmado. El
// resto se va completando, pero queda a la vista hasta que esté.
// ---------------------------------------------------------------------------

interface PlantillaTramite {
  clave: string;
  titulo: string;
  ayuda: string;
  imprescindible?: boolean;
}

export const TRAMITES_ALTA: PlantillaTramite[] = [
  {
    clave: "DOCUMENTACION",
    titulo: "Documentación de la trabajadora",
    ayuda: "DNI o NIE, número de afiliación a la Seguridad Social y cuenta bancaria para la nómina.",
  },
  {
    clave: "ALTA_EMPLEADOR",
    titulo: "Alta de la familia como empleadora",
    ayuda: "Código de cuenta de cotización del hogar en la Tesorería General de la Seguridad Social. Sólo la primera vez.",
  },
  {
    clave: "ALTA_TRABAJADORA",
    titulo: "Alta de la trabajadora en la Seguridad Social",
    ayuda: "En el Sistema Especial de Empleados de Hogar, antes del primer día de trabajo.",
    imprescindible: true,
  },
  {
    clave: "CONTRATO",
    titulo: "Contrato de trabajo firmado",
    ayuda: "Por escrito, con jornada, horario, salario y periodo de prueba. Una copia para cada parte.",
    imprescindible: true,
  },
  {
    clave: "DOMICILIACION",
    titulo: "Domiciliación de las cuotas",
    ayuda: "La Tesorería gira cada mes el recibo de las cotizaciones a la cuenta de la familia.",
  },
  {
    clave: "PREVENCION",
    titulo: "Evaluación de riesgos del domicilio",
    ayuda: "Revisión de los riesgos del puesto en la casa y la información a la trabajadora.",
  },
  {
    clave: "CALENDARIO",
    titulo: "Vacaciones y descansos acordados",
    ayuda: "Calendario del año: vacaciones, festivos y descanso semanal.",
  },
];

export const TRAMITES_BAJA: PlantillaTramite[] = [
  {
    clave: "BAJA_TRABAJADORA",
    titulo: "Baja en la Seguridad Social",
    ayuda: "Se comunica en los días siguientes al último día de trabajo.",
    imprescindible: true,
  },
  {
    clave: "FINIQUITO",
    titulo: "Finiquito",
    ayuda: "Salario de los días trabajados, vacaciones no disfrutadas y la parte de las pagas extra.",
    imprescindible: true,
  },
  {
    clave: "CERTIFICADO_EMPRESA",
    titulo: "Certificado de empresa",
    ayuda: "Para que la trabajadora pueda pedir la prestación por desempleo, si le corresponde.",
  },
];

export function crearTramites(plantillas: PlantillaTramite[], desde = 0) {
  return plantillas.map((t, i) => ({ clave: t.clave, titulo: t.titulo, ayuda: t.ayuda, imprescindible: !!t.imprescindible, orden: desde + i }));
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// Lo que cobra la trabajadora un mes, en bruto. Con las pagas prorrateadas cada
// mes lleva su parte; sin prorratear, junio y diciembre llevan una paga más.
export function brutoDelMes(c: { salarioBrutoMensual: unknown; pagasExtra: number; prorrateaPagas: boolean }, mes: string): number {
  const salario = Number(c.salarioBrutoMensual);
  if (c.prorrateaPagas) return redondear((salario * (12 + c.pagasExtra)) / 12);
  const m = Number(mes.slice(5, 7));
  const extra = c.pagasExtra >= 2 && (m === 6 || m === 12) ? salario : c.pagasExtra === 1 && m === 12 ? salario : 0;
  return redondear(salario + extra);
}

async function avisarHogar(personaId: string, mensaje: string, contratoId: string) {
  const ref = { tipo: "ContratoHogar" as const, id: contratoId };
  const cuenta = await prisma.usuario.findFirst({ where: { personaId, activo: true }, select: { id: true } });
  if (cuenta) await notificarUsuario(cuenta.id, "hogar", mensaje, ref).catch(() => undefined);
  const familiares = await prisma.familiarRelacion.findMany({ where: { personaId, revocadoAt: null }, select: { usuarioId: true } });
  for (const f of familiares) await notificarUsuario(f.usuarioId, "hogar", mensaje, ref).catch(() => undefined);
}

// En trámite hasta que lo imprescindible está hecho; entonces, activo. Un
// contrato terminado ya no vuelve atrás por tocar un trámite.
export async function recalcularEstado(contratoId: string): Promise<void> {
  const c = await prisma.contratoHogar.findUnique({ where: { id: contratoId }, include: { tramites: true } });
  if (!c || c.estado === "FINALIZADO") return;
  const imprescindibles = c.tramites.filter((t) => t.imprescindible && t.estado !== "NO_APLICA");
  const listo = imprescindibles.length > 0 && imprescindibles.every((t) => t.estado === "HECHO");
  const nuevo = listo ? "ACTIVO" : "EN_TRAMITE";
  if (nuevo === c.estado) return;
  await prisma.contratoHogar.update({ where: { id: c.id }, data: { estado: nuevo } });
  if (nuevo === "ACTIVO") {
    await avisarHogar(c.personaId, `${c.trabajadoraNombre} ya está dada de alta y con contrato firmado: puede empezar a trabajar.`, c.id);
  }
}

export async function avisarNomina(contratoId: string, mes: string) {
  const c = await prisma.contratoHogar.findUnique({ where: { id: contratoId } });
  if (!c) return;
  await avisarHogar(c.personaId, `Ya tienes la nómina de ${c.trabajadoraNombre} de ${mes}: revísala y págala antes de fin de mes.`, c.id);
}
