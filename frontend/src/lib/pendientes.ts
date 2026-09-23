import type { Factura, FichaProfesional, Incidencia, Servicio, Solicitud, Visita } from "./types.js";
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
  // Qué pasa, en una línea.
  detalle: string;
  // Desde cuándo espera. Ordena y explica por qué algo sube de prioridad.
  desde: number;
  accion: string;
  // A dónde lleva la acción.
  destino:
    | { tipo: "solicitud"; id: string }
    | { tipo: "incidencia"; id: string }
    | { tipo: "tab"; tab: string };
}

export const INFO_PRIORIDAD: Record<Prioridad, { etiqueta: string; orden: number; punto: string; texto: string; fondo: string }> = {
  critico: { etiqueta: "Crítico", orden: 0, punto: "bg-rose-500", texto: "text-rose-700", fondo: "bg-rose-50" },
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
}): Asunto[] {
  const { solicitudes, servicios, incidencias, facturas, plantilla } = datos;
  const asuntos: Asunto[] = [];
  const hoy = new Date().toISOString().slice(0, 10);
  const porServicio = new Map(solicitudes.filter((s) => s.servicio).map((s) => [s.servicio!.id, s]));

  for (const servicio of servicios) {
    const solicitud = porServicio.get(servicio.id);
    const persona = nombreDe(solicitud);

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
            detalle: `Debía empezar a las ${visita.horaInicioProg} · ${retraso} min de retraso`,
            desde: retraso,
            accion: "Resolver ahora",
            destino: solicitud ? { tipo: "solicitud", id: solicitud.id } : { tipo: "tab", tab: "calendario" },
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
          detalle:
            fichados == null
              ? "Cerrada sin fichaje"
              // "3 h 18 min", no "3.3 h": el mismo vocabulario de duración que
              // el resto de la aplicación. Las horas decimales solo existen
              // dentro de los cálculos.
              : `${new Date(visita.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${duracion(fichados)} fichadas`,
          desde: Math.max(0, Math.floor((Date.now() - new Date(visita.fecha).getTime()) / 60000)),
          accion: "Verificar",
          destino: { tipo: "tab", tab: "verificacion" },
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
            detalle: `${visita.codigo} · fichó la entrada y nunca la salida`,
            desde: abierta,
            accion: "Cerrar o llamar",
            destino: { tipo: "tab", tab: "escritorio" },
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
          detalle: `${visita.codigo} · ${visita.desviacionMinutos ?? 0} min por encima de lo acordado, sin aprobar`,
          desde: Math.floor((Date.now() - new Date(visita.fecha).getTime()) / 60000),
          accion: "Decidir",
          destino: { tipo: "tab", tab: "verificacion" },
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
      detalle: incidencia.descripcion,
      desde: incidencia.createdAt ? Math.floor((Date.now() - new Date(incidencia.createdAt).getTime()) / 60000) : 0,
      accion: esCancelacion ? "Corroborar" : "Revisar",
      destino: { tipo: "incidencia", id: incidencia.id },
    });
  }

  // Nadie puede entrar en casa de una persona sin los papeles en regla.
  for (const miembro of plantilla) {
    if (!miembro.bloqueado) continue;
    asuntos.push({
      id: `papeles-${miembro.id}`,
      prioridad: "critico",
      tipo: "No puede trabajar",
      persona: `${miembro.nombre} ${miembro.apellidos}`,
      detalle: miembro.carencias.map((c) => c.etiqueta).join(", "),
      desde: 0,
      accion: "Ver expediente",
      destino: { tipo: "tab", tab: "personal" },
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
      detalle: `${factura.codigo} · ${Number(factura.totalConIva).toFixed(2)} €${factura.motivoImpago ? ` · ${factura.motivoImpago}` : ""}`,
      desde: factura.fechaVencimiento ? Math.floor((Date.now() - new Date(factura.fechaVencimiento).getTime()) / 60000) : 0,
      accion: "Gestionar cobro",
      destino: { tipo: "tab", tab: "facturacion" },
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
