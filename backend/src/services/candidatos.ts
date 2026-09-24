import { prisma } from "../lib/prisma.js";
import { carenciasDe } from "./rrhh.js";
import { diasDeRecurrencia, estaAusente, hayConflicto, siguienteDia } from "./sesiones.js";

// ---------------------------------------------------------------------------
// ¿Quién puede cubrir este servicio?
//
// La pregunta se contestaba en dos sitios a la vez y con criterios distintos:
// la pantalla cruzaba la disponibilidad semanal declarada y el servidor
// comprobaba los papeles al asignar. Entre medias quedaba un hueco por el que
// se colaba lo peor que puede pasar: asignar a alguien que ya tenía otra
// jornada a esa hora. La asignación salía bien, el profesional la aceptaba y
// la jornada no se creaba nunca. La persona atendida se quedaba con un
// servicio confirmado y sin nadie que fuera, y lo único que lo decía era una
// línea del historial.
//
// Ahora se contesta aquí, una vez, con los tres filtros que de verdad
// importan y en el orden en que descartan: los papeles, lo que ha ofertado y
// lo que ya tiene en la agenda.
// ---------------------------------------------------------------------------

export interface Candidato {
  id: string;
  codigo: string;
  nombre: string;
  apellidos: string;
  zona: string | null;
  comunidad: string | null;
  municipio: string | null;
  vehiculoPropio: boolean;
  titulacion: string | null;
  foto: string | null;
  // Si encaja, se puede asignar. Si está bloqueado, ni siquiera se ofrece.
  encaja: boolean;
  bloqueado: boolean;
  motivo: string;
  // Para ordenar: primero quien encaja, al final quien no puede trabajar.
  orden: number;
  // Un "no" que no se puede saltar. Los papeles y la agenda lo son: asignar
  // igualmente no crea la jornada y deja a la persona esperando. Que alguien
  // no haya puesto su disponibilidad, en cambio, es un aviso: se puede
  // asignar igual y llamarle.
  impide: boolean;
}

interface Disponibilidad {
  dias: string[];
  franja: string;
}

function leerDisponibilidad(raw: string | null): Disponibilidad {
  if (!raw) return { dias: [], franja: "Mañana" };
  try {
    const d = JSON.parse(raw);
    return { dias: Array.isArray(d.dias) ? d.dias : [], franja: typeof d.franja === "string" ? d.franja : "Mañana" };
  } catch {
    return { dias: [], franja: "Mañana" };
  }
}

const NOMBRE_DIA: Record<string, string> = { L: "lunes", M: "martes", X: "miércoles", J: "jueves", V: "viernes", S: "sábado", D: "domingo" };
const LETRA_DE_DIA = ["D", "L", "M", "X", "J", "V", "S"];

function aMedianoche(f: Date) {
  const d = new Date(f);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Los días que el plan va a ocupar de verdad, como mucho los seis primeros:
// con eso basta para saber si alguien está libre, y evita recorrer un plan
// indefinido entero por cada profesional de la lista.
function diasDelPlan(plan: { fechaInicio: Date; fechaFin: Date | null; recurrencia: string | null }, recurrente: boolean): Date[] {
  const inicio = aMedianoche(plan.fechaInicio);
  if (!recurrente) return [inicio];
  const dias = diasDeRecurrencia(plan.recurrencia, aMedianoche(plan.fechaInicio).getDay());
  const tope = plan.fechaFin ? aMedianoche(plan.fechaFin) : null;
  const salida: Date[] = [];
  let cursor = new Date(Math.max(inicio.getTime(), aMedianoche(new Date()).getTime()));
  for (let i = 0; i < 6; i++) {
    const siguiente = siguienteDia(cursor, dias);
    if (!siguiente) break;
    if (tope && siguiente > tope) break;
    salida.push(siguiente);
    cursor = new Date(siguiente.getTime() + 86400000);
  }
  return salida.length > 0 ? salida : [inicio];
}

export async function candidatosParaServicio(servicioId: string): Promise<Candidato[]> {
  const servicio = await prisma.servicio.findUnique({
    where: { id: servicioId },
    include: { solicitud: { include: { plan: true } } },
  });
  if (!servicio) return [];

  const plan = servicio.solicitud.plan;
  const franjaPedida = plan?.franjaHoraria ?? "Mañana";
  const recurrente = servicio.tipoServicio === "RECURRENTE";
  const dias = plan ? diasDelPlan(plan, recurrente) : [];
  const letrasPedidas = plan?.recurrencia
    ? plan.recurrencia
        .split(/[\s,]+/)
        .map((x) => x.trim().toUpperCase())
        .filter((x) => x.length === 1 && LETRA_DE_DIA.includes(x))
    : dias.map((d) => LETRA_DE_DIA[d.getDay()]);

  const profesionales = await prisma.profesional.findMany({
    where: { organizacionId: servicio.organizacionId, estado: "ACTIVO" },
    orderBy: { apellidos: "asc" },
  });

  const documentos = await prisma.documento.findMany({
    where: { profesionalId: { in: profesionales.map((p) => p.id) } },
    select: { profesionalId: true, tipo: true, fechaCaducidad: true, archivoId: true, url: true },
  });

  const candidatos: Candidato[] = [];
  for (const pro of profesionales) {
    const base = {
      id: pro.id,
      codigo: pro.codigo,
      nombre: pro.nombre,
      apellidos: pro.apellidos,
      zona: pro.zona,
      comunidad: pro.comunidad,
      municipio: pro.municipio,
      vehiculoPropio: pro.vehiculoPropio,
      titulacion: pro.titulacion,
      foto: pro.foto,
    };

    // 1. Los papeles. Es lo primero porque es lo único que no se negocia: sin
    //    el certificado de delitos sexuales no se entra en casa de nadie.
    const suyos = documentos.filter((d) => d.profesionalId === pro.id);
    const impedimentos = carenciasDe(suyos).filter((c: { motivo: string }) => c.motivo !== "por_caducar");
    if (impedimentos.length > 0) {
      candidatos.push({
        ...base,
        encaja: false,
        bloqueado: true,
        impide: true,
        orden: 5,
        motivo: `Le falta ${impedimentos.map((c: { etiqueta: string }) => c.etiqueta.toLowerCase()).join(", ")}`,
      });
      continue;
    }

    // 2. Lo que ha ofertado: qué días y en qué franja dice que trabaja.
    const disp = leerDisponibilidad(pro.disponibilidad);
    if (disp.dias.length === 0) {
      candidatos.push({ ...base, encaja: false, bloqueado: false, impide: false, orden: 3, motivo: "Sin disponibilidad puesta" });
      continue;
    }
    const faltan = letrasPedidas.filter((l) => !disp.dias.includes(l));
    if (faltan.length > 0) {
      candidatos.push({
        ...base,
        encaja: false,
        bloqueado: false,
        impide: false,
        orden: 4,
        motivo: `No trabaja ${faltan.map((l) => NOMBRE_DIA[l] ?? l).join(", ")}`,
      });
      continue;
    }
    const franjaEncaja = disp.franja === "Todo el día" || franjaPedida === "Todo el día" || disp.franja === franjaPedida;
    if (!franjaEncaja) {
      candidatos.push({ ...base, encaja: false, bloqueado: false, impide: false, orden: 4, motivo: `Solo por la ${disp.franja.toLowerCase()}` });
      continue;
    }

    // 3. Y la agenda de verdad. Decir que trabaja los martes por la tarde no
    //    quiere decir que este martes por la tarde esté libre.
    let ocupado: string | null = null;
    for (const dia of dias) {
      if (await estaAusente(pro.id, dia)) {
        ocupado = `De ausencia el ${dia.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
        break;
      }
      if (await hayConflicto(pro.id, dia, plan?.horaInicio ?? null, plan?.horaFin ?? null)) {
        ocupado = `Ocupado el ${dia.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} a esa hora`;
        break;
      }
    }
    if (ocupado) {
      candidatos.push({ ...base, encaja: false, bloqueado: false, impide: true, orden: 2, motivo: ocupado });
      continue;
    }

    candidatos.push({ ...base, encaja: true, bloqueado: false, impide: false, orden: 0, motivo: "Le encaja" });
  }

  return candidatos.sort((a, b) => a.orden - b.orden || a.apellidos.localeCompare(b.apellidos, "es"));
}
