import { prisma } from "../lib/prisma.js";
import { generarCodigo } from "../lib/codes.js";

// Una jornada de trabajo es la unidad que se cronometra y se factura, pero
// nadie tiene por qué pedirla: sale del plan del servicio. Un servicio puntual
// es una sola jornada — el servicio *es* la jornada. Uno recurrente las va
// generando según sus días, una por delante, para que la agenda nunca esté
// vacía ni llena de jornadas fantasma a meses vista.

// Índices de Date.getDay(): 0 = domingo.
const LETRA_A_DIA: Record<string, number> = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 };
const NOMBRE_A_DIA: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

const TODOS = [0, 1, 2, 3, 4, 5, 6];
const LABORABLES = [1, 2, 3, 4, 5];

function sinTildes(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// La recurrencia se escribió durante mucho tiempo a mano ("L-V", "todos los
// días", "lunes y miércoles"), así que el lector es deliberadamente tolerante.
// Si no reconoce nada, asume todos los días: es preferible proponer una
// jornada de más, que coordinación mueve, a dejar el servicio sin agenda.
export function diasDeRecurrencia(recurrencia: string | null | undefined): number[] {
  if (!recurrencia) return TODOS;
  const texto = sinTildes(recurrencia);

  if (/(diario|todos los dias|cada dia|a diario)/.test(texto)) return TODOS;
  if (/(l\s*-\s*v|lunes a viernes|laborable|entre semana|dias de diario)/.test(texto)) return LABORABLES;
  if (/(fin de semana|findes?)/.test(texto)) return [6, 0];

  const dias = new Set<number>();
  for (const [nombre, dia] of Object.entries(NOMBRE_A_DIA)) {
    if (texto.includes(sinTildes(nombre))) dias.add(dia);
  }
  // Letras sueltas (L, M, X, J, V, S, D) solo si no se reconoció ningún
  // nombre: "martes" no debe leerse como M + R + T + E + S.
  if (dias.size === 0) {
    for (const letra of recurrencia.toUpperCase().split(/[^A-Z]+/).join("")) {
      if (letra in LETRA_A_DIA) dias.add(LETRA_A_DIA[letra]);
    }
  }

  return dias.size > 0 ? Array.from(dias).sort() : TODOS;
}

function aMedianoche(fecha: Date) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Primer día a partir de `desde` (incluido) que cae en la recurrencia.
export function siguienteDia(desde: Date, dias: number[]): Date | null {
  const inicio = aMedianoche(desde);
  for (let i = 0; i < 7; i += 1) {
    const candidato = new Date(inicio);
    candidato.setDate(candidato.getDate() + i);
    if (dias.includes(candidato.getDay())) return candidato;
  }
  return null;
}

function seSolapan(aInicio: string | null, aFin: string | null, bInicio: string | null, bFin: string | null): boolean {
  if (!aInicio || !aFin || !bInicio || !bFin) return true;
  return aInicio < bFin && bInicio < aFin;
}

// ¿Tiene ya el profesional algo a esa hora ese día? Mismo criterio que el
// alta manual: la agenda de una persona es una sola, no una por servicio.
async function hayConflicto(profesionalId: string | null, fecha: Date, horaInicio: string | null, horaFin: string | null) {
  if (!profesionalId) return false;
  const inicioDia = aMedianoche(fecha);
  const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
  const delDia = await prisma.visita.findMany({
    where: { profesionalId, fecha: { gte: inicioDia, lt: finDia } },
  });
  return delDia.some((v) => seSolapan(v.horaInicioProg, v.horaFinProg, horaInicio, horaFin));
}

export interface ResultadoSesiones {
  creadas: string[];
  motivo?: string;
}

// Deja el servicio con la agenda que le corresponde. Es idempotente: se puede
// llamar en cada transición sin miedo a duplicar jornadas.
export async function asegurarSesiones(servicioId: string): Promise<ResultadoSesiones> {
  const servicio = await prisma.servicio.findUnique({
    where: { id: servicioId },
    include: { visitas: true, solicitud: { include: { plan: true, necesidad: true } } },
  });
  if (!servicio) return { creadas: [], motivo: "Servicio no encontrado" };

  // Solo tiene sentido cuando hay alguien que la vaya a hacer y el servicio
  // está vivo. Un servicio cerrado o cancelado no genera nada.
  if (!["CONFIRMADO", "EN_CURSO"].includes(servicio.estado)) return { creadas: [], motivo: "El servicio no está activo" };

  const plan = servicio.solicitud.plan;
  if (!plan) return { creadas: [], motivo: "El servicio no tiene plan (días y horas)" };

  const horaInicio = plan.horaInicio;
  const horaFin = plan.horaFin;

  // Lo que hay que hacer ese día. Coordinación lo escribe una vez en el plan
  // ("levantar, desayunar, duchar, vestir, limpiar la habitación") y baja a
  // cada jornada para que la profesional lo vaya marcando. Si no se ha
  // detallado nada, queda el nombre del servicio como tarea única.
  const tareas = (plan.tareasPrevistas ?? "")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const descripciones = tareas.length > 0 ? tareas : [servicio.solicitud.necesidad.nombre];

  async function crear(fecha: Date): Promise<string | null> {
    if (await hayConflicto(servicio!.profesionalId, fecha, horaInicio, horaFin)) return null;
    const visita = await prisma.visita.create({
      data: {
        codigo: await generarCodigo("visita"),
        fecha,
        horaInicioProg: horaInicio,
        horaFinProg: horaFin,
        servicioId: servicio!.id,
        // Snapshot de quién la hace: si el servicio se reasigna después, la
        // jornada ya creada sigue contando para quien de verdad la hizo.
        profesionalId: servicio!.profesionalId,
        estado: "PROGRAMADA",
        tareas: { create: descripciones.map((descripcion) => ({ descripcion })) },
      },
    });
    return visita.codigo;
  }

  // Puntual: una sola jornada, la del plan. El servicio es la jornada.
  if (servicio.tipoServicio !== "RECURRENTE") {
    if (servicio.visitas.length > 0) return { creadas: [], motivo: "Ya tiene su jornada" };
    const codigo = await crear(plan.fechaInicio);
    return codigo ? { creadas: [codigo] } : { creadas: [], motivo: "El profesional ya tiene algo a esa hora" };
  }

  // Recurrente: siempre una jornada por delante y ninguna más. Se genera al
  // confirmar y se vuelve a generar cada vez que se verifica la anterior.
  const hoy = aMedianoche(new Date());
  const pendiente = servicio.visitas.some((v) => aMedianoche(v.fecha) >= hoy && v.estado !== "REVISADA");
  if (pendiente) return { creadas: [], motivo: "Ya tiene una jornada por delante" };

  const ultima = servicio.visitas.reduce<Date | null>((max, v) => (max === null || v.fecha > max ? v.fecha : max), null);
  // Arranca desde el día siguiente a la última jornada, nunca antes de hoy ni
  // antes del comienzo del plan.
  const desde = new Date(Math.max(hoy.getTime(), aMedianoche(plan.fechaInicio).getTime(), ultima ? aMedianoche(ultima).getTime() + 86400000 : 0));

  const dia = siguienteDia(desde, diasDeRecurrencia(plan.recurrencia));
  if (!dia) return { creadas: [], motivo: "La recurrencia no señala ningún día" };
  // Un servicio indefinido (fechaFin null) nunca deja de generar jornadas;
  // uno con fecha de fin se para ahí solo.
  if (plan.fechaFin && dia > aMedianoche(plan.fechaFin)) return { creadas: [], motivo: "El plan ha llegado a su fecha de fin" };

  const codigo = await crear(dia);
  return codigo ? { creadas: [codigo] } : { creadas: [], motivo: "El profesional ya tiene algo a esa hora" };
}

export interface ResultadoSincronizacion {
  movidas: string[];
  reprogramadas: string[];
  retiradas: string[];
  cambios: string[];
}

function mismoDia(a: Date, b: Date) {
  return aMedianoche(a).getTime() === aMedianoche(b).getTime();
}

function comoFecha(f: Date) {
  return f.toLocaleDateString("es-ES", { day: "2-digit", month: "long" });
}

// Cambiar el plan tiene que mover lo que ya está en la agenda, no solo
// guardarse. `asegurarSesiones` es idempotente y por eso no tocaba nada: veía
// que la jornada ya existía y la dejaba donde estaba. El resultado era que
// coordinación cambiaba la fecha de una solicitud, lo veía en su ficha, y el
// profesional seguía con el día viejo en su panel.
//
// Solo se tocan las jornadas que aún no han empezado: una que ya se fichó es
// un hecho ocurrido y no se reescribe.
export async function sincronizarSesionesConPlan(servicioId: string): Promise<ResultadoSincronizacion> {
  const vacio: ResultadoSincronizacion = { movidas: [], reprogramadas: [], retiradas: [], cambios: [] };
  const servicio = await prisma.servicio.findUnique({
    where: { id: servicioId },
    include: { visitas: { orderBy: { fecha: "asc" }, include: { tareas: true } }, solicitud: { include: { plan: true, necesidad: true } } },
  });
  if (!servicio) return vacio;
  const plan = servicio.solicitud.plan;
  if (!plan) return vacio;

  // Sin empezar: ni fichada ni cerrada. Lo pasado no se reescribe.
  const porHacer = servicio.visitas.filter(
    (v) => ["PROGRAMADA", "CONFIRMADA"].includes(v.estado) && v.horaInicioReal == null,
  );
  if (porHacer.length === 0) return vacio;

  const resultado: ResultadoSincronizacion = { movidas: [], reprogramadas: [], retiradas: [], cambios: [] };
  const hoy = aMedianoche(new Date());
  const dias = diasDeRecurrencia(plan.recurrencia);

  const tareasDelPlan = (plan.tareasPrevistas ?? "")
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const descripciones = tareasDelPlan.length > 0 ? tareasDelPlan : [servicio.solicitud.necesidad.nombre];

  for (const visita of porHacer) {
    // A qué día le toca ahora esta jornada según el plan.
    let destino: Date | null;
    if (servicio.tipoServicio !== "RECURRENTE") {
      // Puntual: el servicio es la jornada, así que va donde diga el plan.
      destino = aMedianoche(plan.fechaInicio);
    } else if (aMedianoche(visita.fecha) < aMedianoche(plan.fechaInicio) || !dias.includes(visita.fecha.getDay())) {
      // Recurrente: si se ha quedado antes del comienzo o en un día que ya no
      // toca, se corre al primero válido.
      destino = siguienteDia(new Date(Math.max(hoy.getTime(), aMedianoche(plan.fechaInicio).getTime())), dias);
    } else {
      destino = aMedianoche(visita.fecha);
    }

    // Pasada la fecha de fin, esa jornada ya no existe: se retira en vez de
    // dejarla colgando en la agenda de alguien.
    if (destino && plan.fechaFin && destino > aMedianoche(plan.fechaFin)) {
      await prisma.visita.delete({ where: { id: visita.id } });
      resultado.retiradas.push(visita.codigo);
      continue;
    }

    const cambiaDia = destino != null && !mismoDia(destino, visita.fecha);
    const cambiaHora = visita.horaInicioProg !== plan.horaInicio || visita.horaFinProg !== plan.horaFin;
    if (cambiaDia || cambiaHora) {
      await prisma.visita.update({
        where: { id: visita.id },
        data: {
          ...(cambiaDia && destino ? { fecha: destino } : {}),
          horaInicioProg: plan.horaInicio,
          horaFinProg: plan.horaFin,
        },
      });
      if (cambiaDia && destino) {
        resultado.movidas.push(visita.codigo);
        resultado.cambios.push(`${comoFecha(visita.fecha)} pasa al ${comoFecha(destino)}`);
      }
      if (cambiaHora) {
        resultado.reprogramadas.push(visita.codigo);
        resultado.cambios.push(`nuevo horario ${plan.horaInicio ?? "?"}–${plan.horaFin ?? "?"}`);
      }
    }

    // Las tareas del día vienen del plan. Solo se reescriben si de verdad han
    // cambiado: recrearlas por gusto borraría lo ya marcado.
    const actuales = visita.tareas.map((t) => t.descripcion);
    const distintas = actuales.length !== descripciones.length || actuales.some((d, i) => d !== descripciones[i]);
    if (distintas) {
      await prisma.tarea.deleteMany({ where: { visitaId: visita.id } });
      await prisma.tarea.createMany({ data: descripciones.map((descripcion) => ({ visitaId: visita.id, descripcion })) });
      resultado.cambios.push("cambian las tareas previstas");
    }
  }

  return resultado;
}
