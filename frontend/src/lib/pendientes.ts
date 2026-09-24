import type { Ausencia, Factura, FichaProfesional, Incidencia, Persona, Servicio, Solicitud, Visita } from "./types.js";

type PersonaConCarencias = Persona;
import { duracion, minutosFichados } from "./economia.js";

// Qué requiere una decisión de Olga ahora mismo, en un único sitio y con un
// único criterio de prioridad.
//
// El documento de producto lo dice así: "no diseñar pensando primero en qué
// información podemos enseñar, sino en qué decisión necesita tomar la
// persona". Cada asunto de esta lista tiene una acción principal; si no la
// tiene, no es un pendiente, es un dato.

export type Prioridad = "critico" | "atencion" | "informativa";

export interface Asunto {
  id: string;
  prioridad: Prioridad;
  // La categoría, para poder filtrar: "Visita no iniciada", "Servicio sin
  // cubrir"…
  tipo: string;
  persona: string;
  // El servicio del que se trata, para leerlo debajo del nombre: "Herminia
  // Ruiz / Acompañamiento". El nombre solo no distingue dos servicios de la
  // misma persona.
  servicio?: string;
  // Qué pasa, en una línea.
  detalle: string;
  // La hora a la que es la cita, como se lee en un reloj. No es lo mismo que
  // `desde`: `desde` ordena, `cuando` sitúa.
  cuando?: string;
  // Desde cuándo espera. Ordena y explica por qué algo sube de prioridad.
  desde: number;
  accion: string;
  // A dónde lleva la acción.
  // A dónde lleva la acción. `foco` es lo que hay que abrir nada más llegar:
  // una pestaña con un listado de veinte filas no resuelve nada si la fila que
  // se venía a resolver hay que buscarla a ojo.
  destino:
    // Una jornada atascada no se resuelve navegando a ninguna parte: se
    // resuelve ahí mismo, con las cinco salidas posibles y lo que cuesta cada
    // una. Antes esto llevaba a la ficha de la solicitud, donde no había nada
    // con lo que resolverla.
    | { tipo: "jornada"; visitaId: string; codigo: string; profesional?: string | null; horaInicioProg?: string | null; horaFinProg?: string | null }
    | { tipo: "solicitud"; id: string }
    | { tipo: "incidencia"; id: string }
    | { tipo: "persona"; id: string }
    | { tipo: "tab"; tab: string; foco?: string };
}

export const INFO_PRIORIDAD: Record<Prioridad, { etiqueta: string; orden: number; punto: string; texto: string; fondo: string }> = {
  critico: { etiqueta: "Crítica", orden: 0, punto: "bg-rose-500", texto: "text-rose-700", fondo: "bg-rose-50" },
  atencion: { etiqueta: "Atención", orden: 1, punto: "bg-amber-500", texto: "text-amber-700", fondo: "bg-amber-50" },
  informativa: { etiqueta: "Informativa", orden: 2, punto: "bg-slate-400", texto: "text-slate-600", fondo: "bg-slate-50" },
};

// Margen antes de dar por no presentada una visita. Media hora es lo que se
// tarda en llamar y confirmar que hay un atasco, no un abandono.
const MARGEN_NO_PRESENTADO = 30;

// A partir de cuántas horas una jornada abierta deja de ser normal. El backend
// lo lee de las reglas de la casa; aquí basta un umbral prudente para que el
// aviso aparezca también en la lista, sin pedir otra llamada.
const HORAS_JORNADA_ABIERTA = 4;

function diaClave(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Cómo se nombra un día a media conversación: "Hoy", "Ayer", "Mañana" y, más
// allá, la fecha corta. Nadie dice "el 22 de septiembre" cuando quiere decir
// "ayer".
function nombreDelDia(dia: string): string | null {
  const hoy = new Date();
  const desplazado = (delta: number) => diaClave(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + delta));
  if (dia === desplazado(0)) return "Hoy";
  if (dia === desplazado(-1)) return "Ayer";
  if (dia === desplazado(1)) return "Mañana";
  return null;
}

function fechaCorta(dia: string): string {
  const [a, m, j] = dia.split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// La hora de la cita, tal como se lee en un reloj: "09:00" si es de hoy, y
// con el día delante si no ("Ayer 16:00", "Mañana 17:00"). Es lo que va en la
// columna "Hora" de la bandeja: no cuánto lleva esperando —eso lo ordena
// `desde`— sino a qué hora hay que estar.
//
// `hora` llega aparte cuando el dato es una fecha suelta con su "HH:MM" al
// lado, como en las visitas; si no viene, la hora se saca de la marca de
// tiempo.
function reloj(fecha: string | null | undefined, hora?: string | null): string | undefined {
  if (!fecha) return undefined;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return undefined;
  const hhmm = hora ?? d.toTimeString().slice(0, 5);
  const dia = hora ? fecha.slice(0, 10) : diaClave(d);
  const nombre = nombreDelDia(dia);
  if (nombre === "Hoy") return hhmm;
  return `${nombre ?? fechaCorta(dia)} ${hhmm}`;
}

// Cuando lo que hay es un día y no una hora —un vencimiento, por ejemplo—, el
// día solo. Poner "00:00" sería inventarse una hora que nadie ha fijado.
function soloDia(fecha: string | null | undefined): string | undefined {
  if (!fecha) return undefined;
  const dia = fecha.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return undefined;
  return nombreDelDia(dia) ?? fechaCorta(dia);
}

function nombreDe(s: Solicitud | undefined): string {
  return s ? `${s.persona.nombre} ${s.persona.apellidos}` : "—";
}

function minutosDesde(fecha: string, hora: string | null): number | null {
  if (!hora) return null;
  const [h, m] = hora.split(":").map(Number);
  const cuando = new Date(fecha);
  cuando.setHours(h, m, 0, 0);
  return Math.floor((Date.now() - cuando.getTime()) / 60000);
}

export function calcularPendientes(datos: {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  incidencias: Incidencia[];
  facturas: Factura[];
  plantilla: FichaProfesional[];
  personas?: PersonaConCarencias[];
  ausencias?: Ausencia[];
}): Asunto[] {
  const { solicitudes, servicios, incidencias, facturas, plantilla, personas = [], ausencias = [] } = datos;
  const asuntos: Asunto[] = [];
  const hoy = new Date().toISOString().slice(0, 10);
  const porServicio = new Map(solicitudes.filter((s) => s.servicio).map((s) => [s.servicio!.id, s]));

  for (const servicio of servicios) {
    const solicitud = porServicio.get(servicio.id);
    const persona = nombreDe(solicitud);
    const queServicio = solicitud?.necesidad.nombre;
    // La primera jornada por delante. Cuando lo que falla es el servicio
    // entero —nadie asignado, nadie que confirme—, la hora que importa no es
    // la de ahora sino la del día en que alguien tiene que presentarse.
    const proxima = (servicio.visitas ?? [])
      .filter((v) => v.fecha.slice(0, 10) >= hoy && !["REVISADA", "FINALIZADA", "CANCELADA"].includes(v.estado))
      .sort((a, b) => `${a.fecha}${a.horaInicioProg ?? ""}`.localeCompare(`${b.fecha}${b.horaInicioProg ?? ""}`))[0];

    for (const visita of servicio.visitas ?? []) {
      const esDeHoy = visita.fecha.slice(0, 10) === hoy;

      // Crítico: la hora ha pasado y nadie ha llegado a casa de la persona.
      if (esDeHoy && ["PROGRAMADA", "CONFIRMADA"].includes(visita.estado)) {
        const retraso = minutosDesde(visita.fecha, visita.horaInicioProg);
        if (retraso != null && retraso > MARGEN_NO_PRESENTADO) {
          asuntos.push({
            id: `noiniciada-${visita.id}`,
            prioridad: "critico",
            tipo: "Visita no iniciada",
            persona,
            servicio: queServicio,
            cuando: reloj(visita.fecha, visita.horaInicioProg),
            detalle: `Debía empezar a las ${visita.horaInicioProg} · ${retraso} min de retraso`,
            desde: retraso,
            accion: "Resolver ahora",
            destino: {
              tipo: "jornada",
              visitaId: visita.id,
              codigo: visita.codigo,
              profesional: visita.profesional ? `${visita.profesional.nombre} ${visita.profesional.apellidos}` : null,
              horaInicioProg: visita.horaInicioProg,
              horaFinProg: visita.horaFinProg,
            },
          });
        }
      }

      // Atención: trabajo hecho que todavía no se ha dado por bueno. Hasta
      // que no se verifica no se le paga a nadie ni se factura.
      if (visita.estado === "FINALIZADA") {
        const fichados = minutosFichados(visita.horaInicioReal, visita.horaFinReal);
        asuntos.push({
          id: `verificar-${visita.id}`,
          prioridad: "atencion",
          tipo: "Pendiente de verificar",
          persona,
          servicio: queServicio,
          cuando: reloj(visita.fecha, visita.horaFinProg ?? visita.horaInicioProg),
          detalle:
            fichados == null
              ? "Cerrada sin fichaje"
              // "3 h 18 min", no "3.3 h": el mismo vocabulario de duración que
              // el resto de la aplicación. Las horas decimales solo existen
              // dentro de los cálculos.
              : `${new Date(visita.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${duracion(fichados)} fichadas`,
          desde: Math.max(0, Math.floor((Date.now() - new Date(visita.fecha).getTime()) / 60000)),
          accion: "Verificar",
          destino: { tipo: "tab", tab: "verificacion", foco: visita.id },
        });
      }
    }

    // Crítico: una jornada abierta desde hace horas. Casi nunca son horas de
    // trabajo: es el botón de "finalizar" sin pulsar, y mientras siga abierta
    // no se puede facturar ni pagar.
    for (const visita of servicio.visitas ?? []) {
      if (visita.estado === "EN_CURSO" && visita.horaInicioReal) {
        const abierta = Math.floor((Date.now() - new Date(visita.horaInicioReal).getTime()) / 60000);
        if (abierta >= HORAS_JORNADA_ABIERTA * 60) {
          asuntos.push({
            id: `abierta-${visita.id}`,
            prioridad: "critico",
            tipo: "Jornada sin cerrar",
            persona,
            servicio: queServicio,
            cuando: reloj(visita.fecha, visita.horaInicioProg),
            detalle: `${visita.codigo} · fichó la entrada y nunca la salida`,
            desde: abierta,
            accion: "Cerrar o llamar",
            destino: {
              tipo: "jornada",
              visitaId: visita.id,
              codigo: visita.codigo,
              profesional: visita.profesional ? `${visita.profesional.nombre} ${visita.profesional.apellidos}` : null,
              horaInicioProg: visita.horaInicioProg,
              horaFinProg: visita.horaFinProg,
            },
          });
        }
      }

      // Atención: tiempo por encima de lo acordado que nadie ha decidido. La
      // factura del mes se detiene hasta resolverlo, así que no puede quedarse
      // ahí esperando a que alguien lo vea de casualidad.
      if (visita.ajusteEstado === "PENDIENTE") {
        asuntos.push({
          id: `ajuste-${visita.id}`,
          prioridad: "atencion",
          tipo: "Tiempo sin decidir",
          persona,
          servicio: queServicio,
          cuando: reloj(visita.fecha, visita.horaFinProg ?? visita.horaInicioProg),
          detalle: `${visita.codigo} · ${visita.desviacionMinutos ?? 0} min por encima de lo acordado, sin aprobar`,
          desde: Math.floor((Date.now() - new Date(visita.fecha).getTime()) / 60000),
          accion: "Decidir",
          destino: { tipo: "tab", tab: "verificacion", foco: visita.id },
        });
      }
    }

    // Atención: hay alguien esperando y no hay quien vaya.
    if (servicio.estado === "PENDIENTE") {
      asuntos.push({
        id: `sincubrir-${servicio.id}`,
        prioridad: "atencion",
        tipo: "Servicio sin cubrir",
        persona,
        servicio: queServicio,
        cuando: proxima ? reloj(proxima.fecha, proxima.horaInicioProg) : undefined,
        detalle: `${solicitud?.necesidad.nombre ?? servicio.codigo} · sin profesional asignado`,
        desde: Math.floor((Date.now() - new Date(servicio.createdAt ?? Date.now()).getTime()) / 60000),
        accion: "Asignar",
        destino: solicitud ? { tipo: "solicitud", id: solicitud.id } : { tipo: "tab", tab: "solicitudes" },
      });
    }

    // Atención: asignado pero sin confirmar. No es lo mismo que no tener a
    // nadie: aquí sólo hay que insistir.
    if (servicio.estado === "ASIGNADO") {
      asuntos.push({
        id: `confirmar-${servicio.id}`,
        prioridad: "atencion",
        tipo: "Sin confirmar",
        persona,
        servicio: queServicio,
        cuando: proxima ? reloj(proxima.fecha, proxima.horaInicioProg) : undefined,
        detalle: `${servicio.profesional ? `${servicio.profesional.nombre} ${servicio.profesional.apellidos}` : "El profesional"} todavía no ha aceptado`,
        desde: Math.floor((Date.now() - new Date(servicio.updatedAt ?? servicio.createdAt ?? Date.now()).getTime()) / 60000),
        accion: "Recordar",
        destino: solicitud ? { tipo: "solicitud", id: solicitud.id } : { tipo: "tab", tab: "solicitudes" },
      });
    }

    // Atención: el servicio está en marcha pero no hay ninguna jornada por
    // delante, así que la semana que viene no irá nadie.
    if (["CONFIRMADO", "EN_CURSO"].includes(servicio.estado)) {
      const hayFuturas = (servicio.visitas ?? []).some(
        (v) => v.fecha.slice(0, 10) >= hoy && !["REVISADA", "FINALIZADA"].includes(v.estado),
      );
      if (!hayFuturas) {
        asuntos.push({
          id: `sinagenda-${servicio.id}`,
          prioridad: "atencion",
          tipo: "Sin próximas visitas",
          persona,
          servicio: queServicio,
          detalle: `${solicitud?.necesidad.nombre ?? servicio.codigo} · en marcha y sin nada programado`,
          desde: 0,
          accion: "Programar",
          destino: solicitud ? { tipo: "solicitud", id: solicitud.id } : { tipo: "tab", tab: "calendario" },
        });
      }
    }
  }

  // Una solicitud recién enviada sin revisar: hay una familia esperando que
  // alguien le diga algo, y hasta que se acepta no existe ni servicio ni
  // agenda. Era el único hueco de la cadena que no aparecía como pendiente.
  for (const solicitud of solicitudes) {
    if (!["ENVIADA", "EN_REVISION"].includes(solicitud.estado)) continue;
    asuntos.push({
      id: `revisar-${solicitud.id}`,
      prioridad: "atencion",
      tipo: "Solicitud por revisar",
      persona: nombreDe(solicitud),
      servicio: solicitud.necesidad.nombre,
      cuando: reloj(solicitud.createdAt),
      detalle: `${solicitud.necesidad.nombre} · ${solicitud.descripcionLibre?.slice(0, 80) ?? "sin detalle"}`,
      desde: solicitud.createdAt ? Math.floor((Date.now() - new Date(solicitud.createdAt).getTime()) / 60000) : 0,
      accion: "Revisar",
      destino: { tipo: "solicitud", id: solicitud.id },
    });
  }

  // Incidencias abiertas. Una petición de cancelación es más urgente que una
  // observación: hay una familia esperando respuesta.
  for (const incidencia of incidencias) {
    if (["RESUELTA", "CERRADA"].includes(incidencia.estado)) continue;
    const esCancelacion = incidencia.tipo === "SOLICITUD_CANCELACION";
    const caso = incidencia.servicio?.solicitud ?? incidencia.visita?.servicio?.solicitud;
    asuntos.push({
      id: `incidencia-${incidencia.id}`,
      prioridad: esCancelacion || incidencia.prioridad === "ALTA" ? "critico" : "atencion",
      tipo: esCancelacion ? "Cancelación pedida" : "Incidencia abierta",
      persona: caso ? `${caso.persona.nombre} ${caso.persona.apellidos}` : incidencia.codigo,
      servicio: caso?.necesidad.nombre,
      cuando: reloj(incidencia.createdAt),
      detalle: incidencia.descripcion,
      desde: incidencia.createdAt ? Math.floor((Date.now() - new Date(incidencia.createdAt).getTime()) / 60000) : 0,
      accion: esCancelacion ? "Corroborar" : "Revisar",
      destino: { tipo: "incidencia", id: incidencia.id },
    });
  }

  // Nadie puede entrar en casa de una persona sin los papeles en regla. Y
  // quien acaba de apuntarse espera a que alguien mire su ficha: hasta que no
  // se revisa no puede trabajar, y ese "esperando" no tenía dónde verse.
  //
  // Una fila por persona, no dos: a quien está pendiente de alta, lo que le
  // falta es justo lo que hay que mirar para darla de alta.
  for (const miembro of plantilla) {
    const pendienteDeAlta = miembro.estado === "PENDIENTE";
    if (!miembro.bloqueado && !pendienteDeAlta) continue;
    const queFalta = miembro.carencias.map((c) => c.etiqueta).join(", ");
    asuntos.push({
      id: `papeles-${miembro.id}`,
      prioridad: pendienteDeAlta ? "atencion" : "critico",
      tipo: pendienteDeAlta ? "Alta por verificar" : "No puede trabajar",
      persona: `${miembro.nombre} ${miembro.apellidos}`,
      servicio: pendienteDeAlta ? "Alta de profesional" : "Documentación del expediente",
      detalle: pendienteDeAlta
        ? `${miembro.codigo} · espera tu revisión${queFalta ? ` · le falta: ${queFalta.toLowerCase()}` : ""}`
        : queFalta,
      desde: 0,
      accion: pendienteDeAlta ? "Revisar alta" : "Ver expediente",
      destino: { tipo: "tab", tab: "personal", foco: miembro.id },
    });
  }

  // Se está atendiendo a alguien sin haberle explicado qué se hace con sus
  // datos, o sin que haya autorizado lo que hace falta para cuidarla. No es
  // papeleo: es la obligación que la empresa tiene que poder demostrar, y la
  // única forma de que no se descubra el día de una reclamación es que salga
  // aquí, al lado de todo lo demás.
  for (const persona of personas) {
    const carencias = persona.carenciasRgpd ?? [];
    if (carencias.length === 0) continue;
    const sinPreguntar = carencias.filter((c) => c.motivo === "sin_preguntar");
    asuntos.push({
      id: `rgpd-${persona.id}`,
      prioridad: sinPreguntar.length > 0 ? "critico" : "atencion",
      tipo: "Protección de datos",
      persona: `${persona.nombre} ${persona.apellidos}`,
      servicio: "Información y consentimientos",
      detalle:
        sinPreguntar.length > 0
          ? `Sin informar ni autorizar: ${sinPreguntar.map((c) => c.etiqueta.toLowerCase()).join(", ")}`
          : `Hay que volver a informar: ${carencias.map((c) => c.etiqueta.toLowerCase()).join(", ")}`,
      desde: 0,
      accion: "Abrir ficha",
      destino: { tipo: "persona", id: persona.id },
    });
  }

  // Una persona del equipo ha pedido días y nadie le ha contestado. Quien lo
  // pide está haciendo planes: la respuesta tiene fecha de caducidad.
  for (const ausencia of ausencias) {
    if (ausencia.estado !== "SOLICITADA") continue;
    const quien = ausencia.profesional;
    asuntos.push({
      id: `ausencia-${ausencia.id}`,
      prioridad: "atencion",
      tipo: "Días por responder",
      persona: quien ? `${quien.nombre} ${quien.apellidos}` : "Alguien del equipo",
      servicio: "Vacaciones y permisos",
      cuando: soloDia(ausencia.desde),
      detalle: `Pide del ${soloDia(ausencia.desde) ?? ausencia.desde.slice(0, 10)} al ${soloDia(ausencia.hasta) ?? ausencia.hasta.slice(0, 10)}${ausencia.motivo ? ` · ${ausencia.motivo}` : ""}`,
      desde: Math.floor((Date.now() - new Date(ausencia.createdAt).getTime()) / 60000),
      accion: "Responder",
      destino: { tipo: "tab", tab: "disponibilidad", foco: ausencia.id },
    });
  }

  // Dinero vencido sin cobrar.
  for (const factura of facturas) {
    const vencida = factura.estado === "EMITIDA" && factura.fechaVencimiento && new Date(factura.fechaVencimiento).getTime() < Date.now();
    if (!vencida && factura.estado !== "IMPAGADA") continue;
    asuntos.push({
      id: `cobro-${factura.id}`,
      prioridad: "atencion",
      tipo: factura.estado === "IMPAGADA" ? "Recibo devuelto" : "Cobro vencido",
      persona: factura.titularNombre ?? `${factura.persona.nombre} ${factura.persona.apellidos}`,
      servicio: `Factura ${factura.codigo}`,
      cuando: soloDia(factura.fechaVencimiento),
      detalle: `${factura.codigo} · ${Number(factura.totalConIva).toFixed(2)} €${factura.motivoImpago ? ` · ${factura.motivoImpago}` : ""}`,
      desde: factura.fechaVencimiento ? Math.floor((Date.now() - new Date(factura.fechaVencimiento).getTime()) / 60000) : 0,
      accion: "Gestionar cobro",
      destino: { tipo: "tab", tab: "facturacion", foco: factura.id },
    });
  }

  // Primero lo crítico; dentro de cada nivel, lo que lleva más tiempo
  // esperando.
  return asuntos.sort(
    (a, b) => INFO_PRIORIDAD[a.prioridad].orden - INFO_PRIORIDAD[b.prioridad].orden || b.desde - a.desde,
  );
}

export function hace(minutos: number): string {
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} d`;
}
