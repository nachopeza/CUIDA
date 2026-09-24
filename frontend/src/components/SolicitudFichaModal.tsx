import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { DesgloseVisitaModal } from "./DesgloseVisitaModal.js";
import { Avatar } from "./Avatar.js";
import { Modal } from "./Modal.js";
import {
  IconAlert,
  IconClock,
  IconBan,
  IconCheck,
  IconChevronDown,
  IconMail,
  IconPhone,
  IconRefresh,
  IconSearch,
  IconTarget,
} from "./icons.js";
import { EstadoBadge } from "./EstadoBadge.js";
import { Cronometro, horasTrabajadas } from "./Cronometro.js";
import { TiempoTrabajadoModal, formatearDuracion } from "./TiempoTrabajadoModal.js";
import { calcularReparto, duracion, euros, horaDe, minutosEntre, minutosFichados } from "../lib/economia.js";
import { PersonaDetalleModal } from "../pages/coordinador/PersonaDetalleModal.js";
import { ProfesionalFormModal } from "../pages/coordinador/ProfesionalFormModal.js";
import { IncidenciaFichaModal } from "../pages/coordinador/IncidenciaFichaModal.js";
import { parsearDisponibilidad } from "../lib/disponibilidad.js";
import { etiquetaTitulacion, zonaDe } from "../lib/territorio.js";
import { resumenDisponibilidad } from "./DisponibilidadPicker.js";
import type { EmpresaColaboradora, FichaProfesional, Necesidad, Profesional, Solicitud, TarifaVigente, Visita } from "../lib/types.js";

// Espejo de TRANSICIONES_SERVICIO del backend (backend/src/services/estados.ts):
// un desplegable solo debe ofrecer estados a los que realmente se pueda pasar
// desde el actual, para que la selección de estado sea segura y no un simple
// botón "avanzar" ciego.
const TRANSICIONES_SERVICIO_MANUAL: Record<string, string[]> = {
  PENDIENTE: [],
  ASIGNADO: [],
  CONFIRMADO: ["EN_CURSO"],
  EN_CURSO: ["FINALIZADO"],
  FINALIZADO: ["VALIDADO"],
  VALIDADO: ["CERRADO"],
  CERRADO: [],
  CANCELADO: [],
};

// Los estados que cierran o archivan el servicio quedan bloqueados mientras
// haya una incidencia general sin resolver (mismo bug fix que en el
// backend): así el desplegable nunca ofrece una opción que el servidor
// vaya a rechazar.
const ESTADOS_BLOQUEADOS_CON_INCIDENCIA = ["FINALIZADO", "VALIDADO", "CERRADO"];

const PUNTO_PRIORIDAD: Record<string, string> = { ALTA: "bg-rose-500", MEDIA: "bg-amber-400", BAJA: "bg-slate-300" };

const SERVICIO_CANCELABLE = ["PENDIENTE", "ASIGNADO", "CONFIRMADO", "EN_CURSO"];
// Qué hora quiere decir cada franja. Es la horquilla habitual de la casa, y
// sirve de punto de partida: lo que vale es lo que quede en Hora inicio y
// Hora fin, que es de donde salen la duración y el importe.
const HORAS_DE_FRANJA: Record<string, { horaInicio: string; horaFin: string }> = {
  "Mañana": { horaInicio: "09:00", horaFin: "13:00" },
  "Tarde": { horaInicio: "16:00", horaFin: "20:00" },
  "Todo el día": { horaInicio: "09:00", horaFin: "17:00" },
};

const FRANJAS = ["Mañana", "Tarde", "Todo el día"];

// La recurrencia se escribía a mano ("L-V", "lunes y miércoles") y había que
// adivinar qué entendía el sistema. Con botones no hay nada que adivinar, y
// se guarda en la misma forma canónica que lee el generador de jornadas.
const NOMBRE_DIA: Record<string, string> = {
  L: "lunes",
  M: "martes",
  X: "miércoles",
  J: "jueves",
  V: "viernes",
  S: "sábados",
  D: "domingos",
};

// Cambiar el día de un servicio de una sola jornada dejaba la fecha de fin
// atrás y la validación lo rechazaba: se veía como "no me deja cambiar el
// día". Si el servicio era de un día, el fin se mueve con el inicio; y si de
// todas formas se quedaría antes, se iguala en vez de bloquear.
function moverInicio<T extends { fechaInicio: string; fechaFin: string }>(plan: T, nuevoInicio: string): T {
  if (!plan.fechaFin) return { ...plan, fechaInicio: nuevoInicio };
  const eraDeUnDia = plan.fechaInicio === plan.fechaFin;
  const seQuedaAtras = plan.fechaFin < nuevoInicio;
  return { ...plan, fechaInicio: nuevoInicio, fechaFin: eraDeUnDia || seQuedaAtras ? nuevoInicio : plan.fechaFin };
}

const DIAS_RECURRENCIA = [
  { letra: "L", nombre: "Lunes" },
  { letra: "M", nombre: "Martes" },
  { letra: "X", nombre: "Miércoles" },
  { letra: "J", nombre: "Jueves" },
  { letra: "V", nombre: "Viernes" },
  { letra: "S", nombre: "Sábado" },
  { letra: "D", nombre: "Domingo" },
];

// Las 6 fases reales de la sección 7 (revisión → búsqueda/asignación →
// confirmado → en curso → verificación → cerrado): un solo mapa deriva la
// fase visible a partir del estado real de solicitud+servicio, en vez de
// mostrar el estado en crudo (BORRADOR/ENVIADA/EN_REVISION/BUSCANDO/
// PROPUESTA...) que no le dice nada a coordinación.
type Fase = "revision" | "buscando" | "confirmado" | "en_curso" | "verificacion" | "cerrado";
const FASES: { clave: Fase; etiqueta: string }[] = [
  { clave: "revision", etiqueta: "Revisión" },
  { clave: "buscando", etiqueta: "Buscando profesional" },
  { clave: "confirmado", etiqueta: "Confirmado" },
  { clave: "en_curso", etiqueta: "En curso" },
  { clave: "verificacion", etiqueta: "Verificación" },
  { clave: "cerrado", etiqueta: "Cerrado" },
];

interface Props {
  solicitudId: string;
  onClose: () => void;
  onChanged: () => void;
}

// Ficha unificada: solicitud + plan + servicio + visitas + incidencias en un
// solo sitio, en vez de repartidos entre las pestañas Solicitudes/Servicios.
// Dinámica pero minimalista: solo se muestran los controles de la fase
// actual, para que rellenarla desde coordinación no invite a errores.
export function SolicitudFichaModal({ solicitudId, onClose, onChanged }: Props) {
  const { token } = useAuth();
  const [s, setS] = useState<Solicitud | null>(null);
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [datosAbiertos, setDatosAbiertos] = useState(false);
  const [perfilPersonaAbierto, setPerfilPersonaAbierto] = useState(false);
  const [perfilProfesionalAbierto, setPerfilProfesionalAbierto] = useState(false);
  const [editarPersonaAbierto, setEditarPersonaAbierto] = useState(false);
  const [editarProfesionalAbierto, setEditarProfesionalAbierto] = useState(false);
  const [incidenciaAbierta, setIncidenciaAbierta] = useState<string | null>(null);
  const [reemplazoAbierto, setReemplazoAbierto] = useState(false);
  const [tarifaAbierta, setTarifaAbierta] = useState(false);
  const [modoAsignacion, setModoAsignacion] = useState<"mercado" | "directo">("mercado");
  const [soloDisponibles, setSoloDisponibles] = useState(true);

  const [plan, setPlan] = useState({
    fechaInicio: "",
    fechaFin: "",
    indefinido: false,
    horaInicio: "",
    horaFin: "",
    franjaHoraria: "Mañana",
    recurrencia: "",
    tareasPrevistas: "",
  });
  const [errorPlan, setErrorPlan] = useState<string | null>(null);
  // Por qué no se ha podido hacer lo último que se pidió. Ninguna de las
  // acciones de esta ficha lo decía: cuando el servidor las rechazaba —y las
  // rechaza por buenas razones: papeles caducados, un estado que no toca, una
  // jornada ya facturada— la promesa se rompía por dentro y en pantalla no
  // pasaba nada. Quien está delante pulsa otra vez, y otra.
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [guardandoPlan, setGuardandoPlan] = useState(false);
  // Qué ha pasado con la agenda al guardar: las jornadas se crean y se
  // mueven solas, y sin decirlo parece que el cambio no ha hecho nada.
  const [avisoPlan, setAvisoPlan] = useState<string | null>(null);
  // Qué jornada tiene abierto el desglose "¿por qué este importe?".
  const [desgloseDe, setDesgloseDe] = useState<string | null>(null);
  const [tarifa, setTarifa] = useState({
    empresaColaboradoraId: "",
    precioHora: "",
    comisionPorcentaje: "",
    tarifaTipo: "" as "" | "PAGADO" | "VOLUNTARIO",
    tarifaNotas: "",
    tipoServicio: "PUNTUAL" as "PUNTUAL" | "RECURRENTE",
    ivaPorcentaje: "",
  });
  // Quién tiene los papeles en regla. Sin esto la lista ofrecía a todo el
  // mundo como "le encaja", el servidor rechazaba la asignación y en pantalla
  // no pasaba nada: dos clics perdidos y ninguna explicación.
  const [expedientes, setExpedientes] = useState<FichaProfesional[]>([]);
  // La tarifa vigente de la casa, para proponer el precio en vez de pedir que
  // se teclee en cada servicio.
  const [tarifasVigentes, setTarifasVigentes] = useState<TarifaVigente[]>([]);
  const [nuevaVisita, setNuevaVisita] = useState({ fecha: "", horaInicio: "", horaFin: "", tareas: "" });
  const [diaSueltoAbierto, setDiaSueltoAbierto] = useState(false);
  const [pidiendoTiempo, setPidiendoTiempo] = useState<Visita | null>(null);

  async function cargar() {
    const [sol, necs, pros, emps, exps, tars] = await Promise.all([
      api.get<Solicitud>(`/solicitudes/${solicitudId}`, token),
      api.get<Necesidad[]>("/necesidades", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token),
      api.get<FichaProfesional[]>("/personal", token).catch(() => []),
      api.get<TarifaVigente[]>("/reglas/tarifas", token).catch(() => []),
    ]);
    setS(sol);
    setNecesidades(necs);
    setProfesionales(pros);
    setEmpresas(emps);
    setExpedientes(exps);
    setTarifasVigentes(tars);
    if (sol.plan) {
      setPlan({
        fechaInicio: sol.plan.fechaInicio.slice(0, 10),
        fechaFin: sol.plan.fechaFin ? sol.plan.fechaFin.slice(0, 10) : "",
        indefinido: !sol.plan.fechaFin,
        horaInicio: sol.plan.horaInicio ?? "",
        horaFin: sol.plan.horaFin ?? "",
        franjaHoraria: sol.plan.franjaHoraria ?? "Mañana",
        recurrencia: sol.plan.recurrencia ?? "",
        tareasPrevistas: sol.plan.tareasPrevistas ?? "",
      });
    }
    if (sol.servicio) {
      setTarifa({
        empresaColaboradoraId: sol.servicio.empresaColaboradoraId ?? "",
        precioHora: sol.servicio.precioHora != null ? String(Number(sol.servicio.precioHora)) : "",
        comisionPorcentaje: sol.servicio.comisionPorcentaje != null ? String(Number(sol.servicio.comisionPorcentaje)) : "",
        tarifaTipo: sol.servicio.tarifaTipo ?? "",
        tarifaNotas: sol.servicio.tarifaNotas ?? "",
        tipoServicio: sol.servicio.tipoServicio ?? "PUNTUAL",
        ivaPorcentaje: sol.servicio.ivaPorcentaje != null ? String(Number(sol.servicio.ivaPorcentaje)) : "",
      });
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudId]);

  async function recargar() {
    await cargar();
    onChanged();
  }

  // Todo lo que le pide algo al servidor pasa por aquí: si sale mal, el
  // motivo se lee arriba de la ficha, con las palabras que ha usado el
  // servidor.
  async function intentar(accion: () => Promise<void>) {
    setErrorAccion(null);
    try {
      await accion();
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido hacer.");
    }
  }

  async function clasificar(necesidadId: string) {
    await intentar(async () => {
      await api.patch(`/solicitudes/${solicitudId}`, { necesidadId }, token);
      await recargar();
    });
  }

  async function aceptarSolicitud() {
    await intentar(async () => {
      await api.post(`/solicitudes/${solicitudId}/estado`, { estado: "ACEPTADA" }, token);
      await recargar();
    });
  }

  async function cancelarSolicitud() {
    await intentar(async () => {
      await api.post(`/solicitudes/${solicitudId}/estado`, { estado: "CANCELADA" }, token);
      await recargar();
    });
  }

  // Guardar los días y las horas fallaba en silencio: sin fecha de inicio,
  // `new Date("")` es una fecha inválida y `toISOString()` revienta antes de
  // llegar a la petición, así que el botón no hacía nada y no decía por qué.
  async function guardarPlan() {
    setErrorPlan(null);
    setAvisoPlan(null);
    if (!plan.fechaInicio) {
      setErrorPlan("Pon al menos la fecha de inicio: es lo que dice cuándo empieza el servicio.");
      return;
    }
    if (!plan.indefinido && plan.fechaFin && plan.fechaFin < plan.fechaInicio) {
      setErrorPlan("La fecha de fin no puede ser anterior a la de inicio.");
      return;
    }
    if ((plan.horaInicio && !plan.horaFin) || (!plan.horaInicio && plan.horaFin)) {
      setErrorPlan("Pon las dos horas o ninguna: el importe sale de la duración.");
      return;
    }

    setGuardandoPlan(true);
    try {
      const respuesta = await api.post<{ jornadas?: { creadas: string[]; movidas: string[]; retiradas: string[]; motivo?: string } }>(
        `/solicitudes/${solicitudId}/plan`,
        {
          fechaInicio: new Date(`${plan.fechaInicio}T00:00:00`).toISOString(),
          fechaFin: plan.indefinido || !plan.fechaFin ? null : new Date(`${plan.fechaFin}T00:00:00`).toISOString(),
          horaInicio: plan.horaInicio || undefined,
          horaFin: plan.horaFin || undefined,
          franjaHoraria: plan.franjaHoraria || undefined,
          recurrencia: plan.recurrencia || undefined,
          tareasPrevistas: plan.tareasPrevistas || undefined,
        },
        token,
      );
      // Guardar el plan mueve y crea jornadas. Decir lo que ha pasado evita
      // que parezca que no ha servido de nada: pasar una solicitud a
      // indefinida programa la siguiente jornada, y eso hay que verlo.
      const j = respuesta?.jornadas;
      if (j) {
        const partes: string[] = [];
        if (j.creadas.length > 0) partes.push(`programada${j.creadas.length === 1 ? "" : "s"} ${j.creadas.join(", ")}`);
        if (j.movidas.length > 0) partes.push(`${j.movidas.length} jornada${j.movidas.length === 1 ? "" : "s"} recolocada${j.movidas.length === 1 ? "" : "s"}`);
        if (j.retiradas.length > 0) partes.push(`${j.retiradas.length} retirada${j.retiradas.length === 1 ? "" : "s"} por quedar fuera del plan`);
        setAvisoPlan(
          partes.length > 0
            ? `Plan guardado · ${partes.join(" · ")}.`
            : j.motivo
              ? `Plan guardado. No se ha programado ninguna jornada nueva: ${j.motivo.toLowerCase()}.`
              : "Plan guardado.",
        );
      }
      await recargar();
    } catch (e) {
      setErrorPlan(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardandoPlan(false);
    }
  }

  async function asignar(profesionalId: string) {
    if (!s?.servicio || !profesionalId) return;
    await intentar(async () => {
      await api.post(`/servicios/${s!.servicio!.id}/asignar`, { profesionalId }, token);
      await recargar();
    });
  }

  async function guardarTarifa() {
    if (!s?.servicio) return;
    await intentar(async () => {
    await api.post(
      `/servicios/${s!.servicio!.id}/tarifa`,
      {
        empresaColaboradoraId: tarifa.empresaColaboradoraId || null,
        precioHora: tarifa.precioHora ? Number(tarifa.precioHora) : null,
        comisionPorcentaje: tarifa.comisionPorcentaje ? Number(tarifa.comisionPorcentaje) : null,
        minutosPrevistos: minutosPlan ?? null,
        tarifaTipo: tarifa.tarifaTipo || null,
        tarifaNotas: tarifa.tarifaNotas || undefined,
        tipoServicio: tarifa.tipoServicio,
        ivaPorcentaje: tarifa.ivaPorcentaje ? Number(tarifa.ivaPorcentaje) : null,
      },
      token,
    );
    await recargar();
    });
  }

  async function cambiarTipoServicio(t: "PUNTUAL" | "RECURRENTE") {
    if (!s?.servicio) return;
    setTarifa((v) => ({ ...v, tipoServicio: t }));
    setAvisoPlan(null);
    const respuesta = await api.post<{ jornadas?: { creadas: string[]; motivo?: string } }>(
      `/servicios/${s.servicio.id}/tarifa`,
      {
        empresaColaboradoraId: tarifa.empresaColaboradoraId || null,
        precioHora: tarifa.precioHora ? Number(tarifa.precioHora) : null,
        comisionPorcentaje: tarifa.comisionPorcentaje ? Number(tarifa.comisionPorcentaje) : null,
        minutosPrevistos: minutosPlan ?? null,
        tarifaTipo: tarifa.tarifaTipo || null,
        tarifaNotas: tarifa.tarifaNotas || undefined,
        tipoServicio: t,
      },
      token,
    );
    // El mismo aviso que al guardar el plan: cambiar el interruptor a
    // recurrente programa la siguiente jornada, y eso hay que verlo abajo
    // sin tener que recargar la ficha a mano.
    const palabra = t === "RECURRENTE" ? "recurrente" : "puntual";
    const j = respuesta?.jornadas;
    if (j) {
      // El aviso vive dentro del desplegable del plan, y el interruptor está
      // fuera: si no se abre, el cambio parece no haber hecho nada.
      setDatosAbiertos(true);
      setAvisoPlan(
        j.creadas.length > 0
          ? `Ahora es ${palabra} · programada${j.creadas.length === 1 ? "" : "s"} ${j.creadas.join(", ")}.`
          : j.motivo
            ? `Ahora es ${palabra}. No se ha programado ninguna jornada nueva: ${j.motivo.toLowerCase()}.`
            : `Ahora es ${palabra}.`,
      );
    }
    await recargar();
  }

  // Reemplazo por baja/enfermedad (sección "debo poder cambiar de
  // profesional si este se enferma o deja el trabajo"): las visitas ya
  // hechas conservan su profesional, así que la facturación de cada uno
  // sigue siendo correcta.
  async function reemplazarProfesional(profesionalId: string) {
    if (!s?.servicio || !profesionalId) return;
    await intentar(async () => {
      await api.post(`/servicios/${s!.servicio!.id}/reemplazar-profesional`, { profesionalId }, token);
      setReemplazoAbierto(false);
      await recargar();
    });
  }

  async function cambiarEstadoServicio(estado: string) {
    if (!s?.servicio || estado === s.servicio.estado) return;
    await intentar(async () => {
      await api.post(`/servicios/${s!.servicio!.id}/estado`, { estado }, token);
      await recargar();
    });
  }

  async function cancelarServicio() {
    if (!s?.servicio) return;
    await intentar(async () => {
      await api.post(`/servicios/${s!.servicio!.id}/estado`, { estado: "CANCELADO" }, token);
      await recargar();
    });
  }

  async function marcarPagado() {
    if (!s?.servicio) return;
    await intentar(async () => {
      await api.post(`/servicios/${s!.servicio!.id}/pago`, {}, token);
      await recargar();
    });
  }

  // Sin tiempo trabajado no se verifica: se facturaría a cero. Si falta, se
  // pide antes de dar el paso.
  async function revisarVisita(visita: Visita) {
    if (!visita.horaInicioReal || !visita.horaFinReal) {
      setPidiendoTiempo(visita);
      return;
    }
    await intentar(async () => {
      await api.post(`/visitas/${visita.id}/revisar`, {}, token);
      await recargar();
    });
  }

  async function programarVisita() {
    if (!s?.servicio || !nuevaVisita.fecha) return;
    await api.post(
      `/servicios/${s.servicio.id}/visitas`,
      {
        fecha: new Date(nuevaVisita.fecha).toISOString(),
        horaInicioProg: nuevaVisita.horaInicio || undefined,
        horaFinProg: nuevaVisita.horaFin || undefined,
        tareas: nuevaVisita.tareas
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
      token,
    );
    setNuevaVisita({ fecha: "", horaInicio: "", horaFin: "", tareas: "" });
    setDiaSueltoAbierto(false);
    await recargar();
  }

  async function confirmarCancelacion() {
    if (!s?.servicio) return;
    await intentar(async () => {
      await api.post(`/servicios/${s!.servicio!.id}/confirmar-cancelacion`, {}, token);
      await recargar();
    });
  }

  async function rechazarCancelacion() {
    if (!s?.servicio) return;
    await intentar(async () => {
      await api.post(`/servicios/${s!.servicio!.id}/rechazar-cancelacion`, {}, token);
      await recargar();
    });
  }

  if (!s) {
    return (
      <Modal title="Cargando…" onClose={onClose} size="lg">
        <p className="text-sm text-slate-500">Cargando ficha…</p>
      </Modal>
    );
  }

  const srv = s.servicio;
  const cancelada = s.estado === "CANCELADA" || srv?.estado === "CANCELADO";
  const cancelacionPendiente = srv?.incidencias?.find((i) => i.tipo === "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));
  const incidenciaGeneralAbierta = srv?.incidencias?.find((i) => i.tipo !== "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado));

  let fase: Fase = "revision";
  if (srv) {
    if (srv.estado === "PENDIENTE" || srv.estado === "ASIGNADO") fase = "buscando";
    else if (srv.estado === "CONFIRMADO") fase = "confirmado";
    else if (srv.estado === "EN_CURSO") fase = "en_curso";
    else if (srv.estado === "FINALIZADO") fase = "verificacion";
    else if (srv.estado === "VALIDADO" || srv.estado === "CERRADO") fase = "cerrado";
  }
  const indiceFase = FASES.findIndex((f) => f.clave === fase);

  // Duración de una jornada según las horas del plan: es de donde sale el
  // importe, así que se calcula en cuanto hay dos horas.
  const minutosPlan = minutosEntre(plan.horaInicio, plan.horaFin);

  const diasElegidos = plan.recurrencia
    .toUpperCase()
    .split(/[^LMXJVSD]+/)
    .join("")
    .split("")
    .filter((c, i, arr) => arr.indexOf(c) === i);

  function alternarDia(letra: string) {
    const orden = DIAS_RECURRENCIA.map((d) => d.letra);
    const siguiente = diasElegidos.includes(letra) ? diasElegidos.filter((d) => d !== letra) : [...diasElegidos, letra];
    siguiente.sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
    setPlan((p) => ({ ...p, recurrencia: siguiente.join(", ") }));
  }

  // Resumen de una línea para la cabecera plegada: sin abrir el bloque ya se
  // sabe de cuándo a cuándo va y cuánto dura.
  // A quién le encaja esta solicitud. Se cruza lo que pide —los días de la
  // recurrencia y la franja— con lo que cada profesional tiene ofertado, que
  // es justo la pregunta de "un domingo por la mañana, ¿quién puede?".
  const descripcionDemanda = (() => {
    const dias = diasElegidos.length > 0 ? diasElegidos.map((d) => NOMBRE_DIA[d] ?? d).join(", ") : "esos días";
    return `${dias} por la ${plan.franjaHoraria.toLowerCase()}`;
  })();

  const candidatos = (() => {
    const porId = new Map(expedientes.map((e) => [e.id, e]));
    const lista = profesionales
      .filter((pro) => pro.estado === "ACTIVO")
      .map((pro) => {
        const disp = parsearDisponibilidad(pro.disponibilidad);
        const sinOferta = disp.dias.length === 0;
        const diasQueFaltan = diasElegidos.filter((d) => !disp.dias.includes(d));
        const franjaEncaja = disp.franja === "Todo el día" || plan.franjaHoraria === "Todo el día" || disp.franja === plan.franjaHoraria;

        // Los papeles primero: nadie entra en casa de una persona sin el
        // certificado de delitos sexuales y el DNI en regla, y ofrecerlo como
        // candidato sólo sirve para que el servidor lo rechace después.
        const exp = porId.get(pro.id);
        if (exp?.bloqueado) {
          const falta = exp.carencias.map((c) => c.etiqueta.toLowerCase()).join(", ");
          return { profesional: pro, bloqueado: true, encaja: false, orden: 4, motivo: falta ? `Le falta ${falta}` : "No puede trabajar" };
        }

        if (sinOferta) return { profesional: pro, bloqueado: false, encaja: false, orden: 2, motivo: "Sin disponibilidad puesta" };
        if (diasQueFaltan.length > 0) {
          return { profesional: pro, bloqueado: false, encaja: false, orden: 3, motivo: `No trabaja ${diasQueFaltan.map((d) => NOMBRE_DIA[d] ?? d).join(", ")}` };
        }
        if (!franjaEncaja) return { profesional: pro, bloqueado: false, encaja: false, orden: 3, motivo: `Solo por la ${disp.franja.toLowerCase()}` };
        return { profesional: pro, bloqueado: false, encaja: true, orden: 0, motivo: "Le encaja" };
      })
      .sort((a, b) => a.orden - b.orden || a.profesional.apellidos.localeCompare(b.profesional.apellidos, "es"));
    return soloDisponibles ? lista.filter((c) => c.encaja) : lista;
  })();

  // La tarifa vigente para este tipo de servicio. Primero la específica; si
  // no hay, la general de la casa. Está en Configuración desde el principio,
  // pero hasta ahora no la usaba nadie: el precio se tecleaba de memoria en
  // cada servicio, y dos servicios iguales acababan a precios distintos.
  const tarifaDeLaCasa = (() => {
    const hoy = new Date();
    const vigente = (t: TarifaVigente) =>
      t.activa && new Date(t.vigenteDesde) <= hoy && (!t.vigenteHasta || new Date(t.vigenteHasta) >= hoy);
    const candidatas = tarifasVigentes.filter(vigente);
    return candidatas.find((t) => t.necesidadId && t.necesidadId === s?.necesidad.id) ?? candidatas.find((t) => !t.necesidadId) ?? null;
  })();

  // Qué comisión queda para CUIDA con esa tarifa, en porcentaje: es lo que
  // pide el formulario, y sale de la diferencia entre las dos horas.
  const comisionDeLaCasa =
    tarifaDeLaCasa && tarifaDeLaCasa.precioHoraCliente > 0
      ? Math.round(((tarifaDeLaCasa.precioHoraCliente - tarifaDeLaCasa.precioHoraProfesional) / tarifaDeLaCasa.precioHoraCliente) * 1000) / 10
      : null;

  function aplicarTarifaDeLaCasa() {
    if (!tarifaDeLaCasa) return;
    setTarifa((t) => ({
      ...t,
      precioHora: String(tarifaDeLaCasa.precioHoraCliente),
      comisionPorcentaje: comisionDeLaCasa != null ? String(comisionDeLaCasa) : t.comisionPorcentaje,
      tarifaTipo: t.tarifaTipo || "PAGADO",
    }));
  }

  // El reparto que se va a aplicar, calculado en local mientras se teclea.
  // El backend vuelve a hacer la cuenta al guardar: esto solo enseña.
  const repartoPrevisto = (() => {
    const precio = Number(tarifa.precioHora);
    if (!precio || minutosPlan == null || tarifa.tarifaTipo === "VOLUNTARIO") return null;
    return calcularReparto({
      minutos: minutosPlan,
      precioHora: precio,
      comisionPorcentaje: tarifa.comisionPorcentaje ? Number(tarifa.comisionPorcentaje) : 15,
      ivaPorcentaje: tarifa.ivaPorcentaje ? Number(tarifa.ivaPorcentaje) : Number(s?.necesidad.ivaPorcentaje ?? 0),
    });
  })();

  const resumenPlan = (() => {
    if (!plan.fechaInicio) return "Sin fijar";
    const desde = new Date(`${plan.fechaInicio}T00:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const hasta = plan.indefinido || !plan.fechaFin ? "indefinido" : new Date(`${plan.fechaFin}T00:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    return `${desde} – ${hasta}${minutosPlan != null ? ` · ${duracion(minutosPlan)}` : ""}`;
  })();


  // Historial del servicio más los fichajes de cada jornada, en una sola
  // línea de tiempo. Antes solo salían los cambios de estado, así que no
  // había forma de ver a qué hora entró y salió de verdad el profesional
  // frente a lo que estaba programado.
  const entradasHistorial = (() => {
    const entradas: { id: string; cuando: string; texto: string; esFichaje: boolean }[] = (s?.estadoHistorial ?? []).map((h) => ({
      id: h.id,
      cuando: h.createdAt,
      texto: `${h.estadoNuevo.replace(/_/g, " ")}${h.motivo ? ` — ${h.motivo}` : ""}`,
      esFichaje: false,
    }));

    for (const v of s?.servicio?.visitas ?? []) {
      if (!v.horaInicioReal) continue;
      const dia = new Date(v.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      const previsto = v.horaInicioProg && v.horaFinProg ? ` (previsto ${v.horaInicioProg}–${v.horaFinProg})` : "";
      const trabajados = minutosFichados(v.horaInicioReal, v.horaFinReal);
      entradas.push({
        id: `fichaje-${v.id}`,
        cuando: v.horaInicioReal,
        texto: v.horaFinReal
          ? `${dia}: fichó de ${horaDe(v.horaInicioReal)} a ${horaDe(v.horaFinReal)}${previsto} · ${duracion(trabajados ?? 0)}`
          : `${dia}: fichó la entrada a las ${horaDe(v.horaInicioReal)}${previsto} · sin cerrar todavía`,
        esFichaje: true,
      });
    }

    return entradas.sort((a, b) => a.cuando.localeCompare(b.cuando));
  })();

  // El "qué se hace y cuándo" no es algo aparte del servicio: es el servicio.
  // Estaban en dos cajas hermanas, una encima de otra, diciendo lo mismo. Se
  // define aquí para poder meterlo dentro del recuadro del servicio cuando lo
  // hay, y dejarlo suelto mientras la solicitud todavía no tiene ninguno.
  const bloqueQueYCuando = (
    <>
      {/* Qué se hace y cuándo, en un solo bloque. Antes los días y las
          horas estaban aquí y el "cuándo se hace" del servicio más abajo:
          dos sitios para lo mismo, y el de arriba ni siquiera guardaba. */}
      <div className="rounded-lg border border-slate-200">
        <button
          onClick={() => setDatosAbiertos((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          <span>Qué se hace y cuándo</span>
          <span className="flex items-center gap-1 font-normal normal-case text-slate-400">
            {resumenPlan}
            <IconChevronDown className={`h-3.5 w-3.5 transition ${datosAbiertos ? "rotate-180" : ""}`} />
          </span>
        </button>
        {(datosAbiertos || !srv) && (
          <div className="space-y-4 border-t border-slate-100 px-3 pb-3 pt-3">
            <div>
              <label className="text-xs text-slate-500">
                Servicio
                <select value={s.necesidad.id} onChange={(e) => clasificar(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  {necesidades.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-xs text-slate-400">{s.descripcionLibre}</p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Cuándo</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-xs text-slate-500">
                  Desde
                  <input
                    type="date"
                    value={plan.fechaInicio}
                    onChange={(e) => setPlan((p) => moverInicio(p, e.target.value))}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Hasta
                  <input
                    type="date"
                    value={plan.fechaFin}
                    disabled={plan.indefinido}
                    onChange={(e) => setPlan((p) => ({ ...p, fechaFin: e.target.value }))}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <span className="mt-1 flex items-center gap-1.5 font-normal normal-case text-slate-500">
                    <input type="checkbox" checked={plan.indefinido} onChange={(e) => setPlan((p) => ({ ...p, indefinido: e.target.checked }))} />
                    Indefinido
                  </span>
                </label>
                <label className="text-xs text-slate-500">
                  Hora inicio
                  <input type="time" value={plan.horaInicio} onChange={(e) => setPlan((p) => ({ ...p, horaInicio: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-slate-500">
                  Hora fin
                  <input type="time" value={plan.horaFin} onChange={(e) => setPlan((p) => ({ ...p, horaFin: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
              </div>

              {/* La duración es la cifra de la que sale el importe, así que
                  se ve aquí mismo mientras se teclean las horas. */}
              {minutosPlan != null && (
                <p className="mt-1.5 text-xs text-slate-500">
                  <IconClock className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-slate-400" />
                  Cada jornada dura <strong className="text-slate-700">{duracion(minutosPlan)}</strong>
                </p>
              )}

              {/* La franja no es otro dato al lado de las horas: es un
                  atajo para ponerlas. Tenerlas por separado hacía que un
                  servicio pudiera decir "por la mañana" y no tener hora, y
                  sin hora no se programa, no se factura y el profesional no
                  sabe cuándo ir. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {FRANJAS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setPlan((p) => ({ ...p, franjaHoraria: f, ...HORAS_DE_FRANJA[f] }))}
                    className={`rounded-md border px-2.5 py-1 text-xs ${plan.franjaHoraria === f ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {f}
                  </button>
                ))}
                <span className="text-xs text-slate-400">pone las horas de esa franja; ajústalas si hace falta</span>
              </div>

              <div className="mt-2">
                <p className="mb-1 text-xs text-slate-500">Qué días se repite</p>
                <div className="flex flex-wrap gap-1">
                  {DIAS_RECURRENCIA.map((d) => {
                    const elegido = diasElegidos.includes(d.letra);
                    return (
                      <button
                        key={d.letra}
                        onClick={() => alternarDia(d.letra)}
                        title={d.nombre}
                        className={`h-8 w-8 rounded-md border text-xs font-medium transition ${
                          elegido ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {d.letra}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPlan((p) => ({ ...p, recurrencia: "" }))}
                    className="ml-1 self-center text-xs text-slate-400 hover:text-slate-600"
                  >
                    Solo una vez
                  </button>
                </div>
              </div>
            </div>

            {/* Lo que hay que hacer ese día, tal cual: se escribe una vez y
                aparece como lista de tareas en cada jornada, para que la
                profesional las marque y coordinación las vea al verificar. */}
            <div>
              <label className="text-xs font-medium text-slate-500">
                Qué hay que hacer
                <textarea
                  value={plan.tareasPrevistas}
                  onChange={(e) => setPlan((p) => ({ ...p, tareasPrevistas: e.target.value }))}
                  rows={3}
                  placeholder={"Levantar\nDesayunar\nDuchar y vestir\nLimpiar la habitación"}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <p className="mt-1 text-xs text-slate-400">Una por línea. Se convierten en la lista que marca la profesional en cada jornada.</p>
            </div>

            {errorPlan && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errorPlan}</p>}
            {avisoPlan && (
              <p className="rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">{avisoPlan}</p>
            )}

            <button
              onClick={guardarPlan}
              disabled={guardandoPlan}
              className="rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {guardandoPlan ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <Modal title={`${s.persona.nombre} ${s.persona.apellidos} · ${s.codigo}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* Fecha de creación (sección "se debe poder visualizar la fecha
            de creación de la solicitud"): siempre visible, sin tener que
            abrir el historial de abajo. */}
        <p className="-mt-3 text-xs text-slate-400">
          Solicitud creada el {new Date(s.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })} a las{" "}
          {new Date(s.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
        </p>

        {/* Por qué no se ha podido hacer lo último. Va arriba del todo y
            con el motivo tal cual lo dice el servidor: "falta el certificado
            de delitos sexuales" se entiende; que no pase nada al pulsar, no. */}
        {errorAccion && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            <p className="flex-1 text-sm text-rose-800">{errorAccion}</p>
            <button onClick={() => setErrorAccion(null)} className="shrink-0 text-xs font-medium text-rose-500 hover:text-rose-700">
              Cerrar
            </button>
          </div>
        )}

        {cancelada ? (
          <div className="rounded-lg border-2 border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-700">Solicitud cancelada</p>
          </div>
        ) : (
          <div className="flex items-center">
            {FASES.map((f, i) => (
              <div key={f.clave} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                      i < indiceFase ? "bg-brand-green-600 text-white" : i === indiceFase ? "bg-brand text-white" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {i < indiceFase ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={`text-center text-[10px] leading-tight ${i === indiceFase ? "font-semibold text-slate-700" : "text-slate-400"}`} style={{ maxWidth: "64px" }}>
                    {f.etiqueta}
                  </span>
                </div>
                {i < FASES.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${i < indiceFase ? "bg-brand-green-600" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        )}

        {cancelacionPendiente && (
          <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
            <p className="flex items-start gap-1.5 text-sm font-medium text-rose-700">
                <IconBan className="mt-0.5 h-4 w-4 shrink-0" />
                Piden cancelar este servicio: {cancelacionPendiente.descripcion}
              </p>
            <div className="mt-2 flex gap-2">
              <button onClick={confirmarCancelacion} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700">
                Confirmar cancelación
              </button>
              <button onClick={rechazarCancelacion} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">
                Seguir con el servicio
              </button>
            </div>
          </div>
        )}

        {/* Acceso directo a la incidencia (sección "si entro en una ficha de
            una solicitud y tiene una incidencia, debo poder acceder a la
            incidencia"): antes solo se avisaba, sin poder abrirla. */}
        {incidenciaGeneralAbierta && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <span>
              <IconAlert className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                Incidencia {incidenciaGeneralAbierta.codigo} abierta ({incidenciaGeneralAbierta.descripcion}) — resuélvela antes de finalizar/validar/cerrar el servicio.
            </span>
            <button
              onClick={() => setIncidenciaAbierta(incidenciaGeneralAbierta.id)}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100"
            >
              Abrir ticket
            </button>
          </div>
        )}

        {/* Contacto directo (sección "desde la ficha se debe poder
            contactar con ambos, con el profesional y con el usuario
            responsable — ver el perfil de ambos"): sin salir de la ficha,
            ni tener que ir a la pestaña de Usuarios o de Profesionales. */}
        <div className={`grid grid-cols-1 gap-3 ${srv?.profesional ? "sm:grid-cols-2" : ""}`}>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Persona / responsable</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditarPersonaAbierto(true)} className="text-xs font-medium text-brand underline decoration-dotted hover:text-brand-800">
                  Editar perfil completo
                </button>
                <button onClick={() => setPerfilPersonaAbierto((v) => !v)} className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600">
                  {perfilPersonaAbierto ? "Ocultar" : "Ver perfil"}
                  <IconChevronDown className={`ml-0.5 inline h-3 w-3 transition ${perfilPersonaAbierto ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
            <button onClick={() => setEditarPersonaAbierto(true)} className="text-sm font-medium text-slate-800 hover:text-brand hover:underline">
              {s.persona.nombre} {s.persona.apellidos}
            </button>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {s.persona.telefono && (
                <a href={`tel:${s.persona.telefono}`} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                  <IconPhone className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                    {s.persona.telefono}
                </a>
              )}
              {s.persona.usuario?.email && (
                <a href={`mailto:${s.persona.usuario.email}`} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                  <IconMail className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                    {s.persona.usuario.email}
                </a>
              )}
            </div>
            {perfilPersonaAbierto && (
              <dl className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                <div>
                  <dt className="text-slate-400">Dirección</dt>
                  <dd>{s.persona.direccion || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Contactos de emergencia</dt>
                  <dd>{s.persona.contactos || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Preferencias</dt>
                  <dd>{s.persona.preferencias || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Medicación</dt>
                  <dd>{s.persona.medicacion || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Médico / centro de referencia</dt>
                  <dd>{s.persona.medico || "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Recomendaciones</dt>
                  <dd>{s.persona.recomendaciones || "—"}</dd>
                </div>
              </dl>
            )}
          </div>

          {srv?.profesional && (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Profesional</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditarProfesionalAbierto(true)} className="text-xs font-medium text-brand underline decoration-dotted hover:text-brand-800">
                    Editar perfil completo
                  </button>
                  <button onClick={() => setPerfilProfesionalAbierto((v) => !v)} className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600">
                    {perfilProfesionalAbierto ? "Ocultar" : "Ver perfil"}
                  <IconChevronDown className={`ml-0.5 inline h-3 w-3 transition ${perfilProfesionalAbierto ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
              <button onClick={() => setEditarProfesionalAbierto(true)} className="flex items-center gap-2 hover:text-brand">
                <Avatar foto={srv.profesional.foto} nombre={srv.profesional.nombre} apellidos={srv.profesional.apellidos} className="h-8 w-8" />
                <p className="text-sm font-medium text-slate-800 hover:underline">
                  {srv.profesional.nombre} {srv.profesional.apellidos}
                </p>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {srv.profesional.telefono && (
                  <a href={`tel:${srv.profesional.telefono}`} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                    <IconPhone className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                    {srv.profesional.telefono}
                  </a>
                )}
                {["CONFIRMADO", "EN_CURSO"].includes(srv.estado) && (
                  <button onClick={() => setReemplazoAbierto((v) => !v)} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700 hover:bg-amber-100">
                    <IconRefresh className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                    Reemplazar
                  </button>
                )}
              </div>
              {reemplazoAbierto && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="mb-1 text-xs text-amber-800">Si se ha puesto enfermo o deja el trabajo, elige quién lo sustituye. Las visitas ya hechas siguen contando para él.</p>
                  <select defaultValue="" onChange={(e) => reemplazarProfesional(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs">
                    <option value="" disabled>
                      Elegir sustituto…
                    </option>
                    {profesionales
                      .filter((p) => p.id !== srv.profesionalId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} {p.apellidos} · {p.zona ?? "Cantabria"}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {perfilProfesionalAbierto && (
                <dl className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  <div>
                    <dt className="text-slate-400">Zona</dt>
                    <dd>{srv.profesional.zona || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Empresa</dt>
                    <dd>{srv.profesional.empresaColaboradora?.nombre ?? "Independiente"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Disponibilidad</dt>
                    <dd>{resumenDisponibilidad(parsearDisponibilidad(srv.profesional.disponibilidad))}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Biografía</dt>
                    <dd>{srv.profesional.biografia || "—"}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}
        </div>
        {/* Mientras no hay servicio, esto es toda la solicitud. En cuanto
            lo hay, se muestra dentro del recuadro del servicio. */}
        {!srv && bloqueQueYCuando}


        {/* Fase 1: pendiente de revisión — sin servicio todavía. Una sola
            decisión posible: aceptar o cancelar. */}
        {!srv && !cancelada && (
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-3">
            <p className="mb-2 text-sm text-slate-700">Pendiente de revisión por coordinación.</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={aceptarSolicitud}
                disabled={!s.plan}
                title={!s.plan ? "Guarda los días/horas antes de aceptar" : undefined}
                className="rounded-xl bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Aceptar y buscar profesional
              </button>
              <button onClick={cancelarSolicitud} className="rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50">
                Cancelar solicitud
              </button>
            </div>
            {!s.plan && <p className="mt-2 text-xs text-slate-500">Abre "Datos de la solicitud" arriba y guarda los días/horas primero.</p>}
          </div>
        )}

        {/* Fase 2+: hay servicio. Todo lo suyo —lo que se hace, cuándo, las
            jornadas y el precio— vive dentro del mismo recuadro. */}
        {srv && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Servicio {srv.codigo}</p>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 text-xs">
                  {(["PUNTUAL", "RECURRENTE"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => cambiarTipoServicio(t)}
                      className={`rounded-full px-2.5 py-1 ${tarifa.tipoServicio === t ? "bg-brand text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                    >
                      {t === "PUNTUAL" ? "Puntual" : "Recurrente"}
                    </button>
                  ))}
                </div>
                {(TRANSICIONES_SERVICIO_MANUAL[srv.estado] ?? []).length > 0 ? (
                  <select
                    value={srv.estado}
                    onChange={(e) => cambiarEstadoServicio(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium"
                  >
                    <option value={srv.estado}>{srv.estado.replace(/_/g, " ")}</option>
                    {(TRANSICIONES_SERVICIO_MANUAL[srv.estado] ?? [])
                      .filter((estado) => !incidenciaGeneralAbierta || !ESTADOS_BLOQUEADOS_CON_INCIDENCIA.includes(estado))
                      .map((estado) => (
                        <option key={estado} value={estado}>
                          {estado.replace(/_/g, " ")}
                        </option>
                      ))}
                  </select>
                ) : (
                  <EstadoBadge estado={srv.estado} />
                )}
                {SERVICIO_CANCELABLE.includes(srv.estado) && (
                  <button onClick={cancelarServicio} className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50">
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            {bloqueQueYCuando}

            {/* Lo que le falta a este servicio para poder prestarse. Se podía
                publicar y mandárselo a un profesional sin horas y sin precio:
                él no sabía cuándo ir ni cuánto iba a cobrar, y al facturar no
                salía ningún importe porque no había de dónde sacarlo. */}
            {["PENDIENTE", "ASIGNADO"].includes(srv.estado) && (!plan.horaInicio || !plan.horaFin || (!tarifa.precioHora && tarifa.tarifaTipo !== "VOLUNTARIO")) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <IconAlert className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <p className="min-w-0 flex-1 text-sm text-amber-800">
                  {!plan.horaInicio || !plan.horaFin
                    ? tarifa.precioHora || tarifa.tarifaTipo === "VOLUNTARIO"
                      ? "Este servicio no tiene horas: el profesional no sabe cuándo ir."
                      : "Este servicio no tiene horas ni precio: el profesional no sabe cuándo ir ni cuánto va a cobrar."
                    : "Este servicio no tiene precio: no se puede facturar ni liquidar."}
                </p>
                {(!plan.horaInicio || !plan.horaFin) && (
                  <button onClick={() => setDatosAbiertos(true)} className="boton-secundario-sm shrink-0">
                    Poner las horas
                  </button>
                )}
                {!tarifa.precioHora && tarifa.tarifaTipo !== "VOLUNTARIO" && (
                  <button onClick={() => setTarifaAbierta(true)} className="boton-secundario-sm shrink-0">
                    Poner el precio
                  </button>
                )}
              </div>
            )}

            {/* Fase "buscando": elegir explícitamente entre dejarlo en el
                mercado de profesionales o asignar a alguien directamente —
                nunca las dos cosas mezcladas en el mismo formulario. */}
            {fase === "buscando" && srv.estado === "PENDIENTE" && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm text-slate-700">¿Cómo se cubre este servicio?</p>
                <div className="mb-3 flex gap-2 text-xs">
                  <button
                    onClick={() => setModoAsignacion("mercado")}
                    className={`rounded-full px-3 py-1.5 ${modoAsignacion === "mercado" ? "bg-brand text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    <IconSearch className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
                  Buscar por profesionales
                  </button>
                  <button
                    onClick={() => setModoAsignacion("directo")}
                    className={`rounded-full px-3 py-1.5 ${modoAsignacion === "directo" ? "bg-brand text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    <IconTarget className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
                  Escoger profesional directamente
                  </button>
                </div>

                {modoAsignacion === "mercado" && (
                  <div>
                    <p className="mb-2 text-xs text-slate-500">
                      Publicado: los profesionales de la zona pueden mostrarse interesados desde "Buscar solicitudes". Elige a uno cuando aparezca, o pasa a "Escoger directamente" cuando quieras.
                    </p>
                    {srv.interesados && srv.interesados.length > 0 ? (
                      <ul className="space-y-1.5">
                        {srv.interesados.map((i) => (
                          <li key={i.id} className="flex items-center justify-between rounded-md bg-amber-50 px-2.5 py-1.5 text-sm">
                            <span>
                              {i.profesional.nombre} {i.profesional.apellidos}
                              {i.mensaje && <span className="text-slate-400"> — "{i.mensaje}"</span>}
                            </span>
                            <button onClick={() => asignar(i.profesional.id)} className="rounded-xl bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800">
                              Elegir
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">Todavía no hay candidatos interesados.</p>
                    )}
                  </div>
                )}

                {modoAsignacion === "directo" && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} />
                      Solo quien ha ofertado {descripcionDemanda}
                    </label>

                    {/* Mandar la propuesta a quien no trabaja ese día es
                        perder el tiempo de los dos. Los candidatos salen
                        ordenados por lo que han ofertado, y se dice por qué
                        encaja o por qué no. */}
                    {candidatos.length === 0 ? (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Ningún profesional ha ofertado {descripcionDemanda}. Quita el filtro para ver a todos, o publícalo en el mercado.
                      </p>
                    ) : (
                      <ul className="max-h-64 space-y-1 overflow-y-auto">
                        {candidatos.map(({ profesional: pro, encaja, bloqueado, motivo }) => (
                          <li key={pro.id}>
                            <button
                              onClick={() => asignar(pro.id)}
                              disabled={bloqueado}
                              title={bloqueado ? "No puede trabajar hasta que su expediente esté completo" : undefined}
                              className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                                bloqueado
                                  ? "cursor-not-allowed border-rose-200 bg-rose-50/50 opacity-70"
                                  : encaja
                                    ? "border-brand-green-200 bg-brand-green-50/40 hover:bg-slate-50"
                                    : "border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-800">
                                  {pro.nombre} {pro.apellidos}
                                </span>
                                <span className="block truncate text-xs text-slate-500">
                                  {zonaDe(pro)}
                                  {pro.vehiculoPropio && " · con coche"}
                                  {pro.titulacion && ` · ${etiquetaTitulacion(pro.titulacion)}`}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  bloqueado ? "bg-rose-100 text-rose-700" : encaja ? "bg-brand-green-100 text-brand-green-700" : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {motivo}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {srv.estado === "ASIGNADO" && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                <p className="text-sm text-slate-700">
                  Pendiente de confirmación por {srv.profesional?.nombre} {srv.profesional?.apellidos}.
                </p>
                <label className="mt-2 block text-xs text-slate-500">
                  Reasignar a otro profesional
                  <select
                    key={srv.profesionalId ?? "sin-asignar"}
                    defaultValue={srv.profesionalId ?? ""}
                    onChange={(e) => asignar(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                  >
                    {profesionales.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} {p.apellidos} · {p.zona ?? "Cantabria"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {srv.estado === "FINALIZADO" && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                El profesional ha terminado. Verifica la jornada abajo para cerrar el servicio.
              </p>
            )}

            {/* El servicio y su jornada son la misma cosa, no dos que haya
                que casar a mano: las jornadas salen del plan al confirmar y,
                en un recurrente, la siguiente aparece sola al verificar la
                anterior. Nadie "solicita una visita". */}
            {["CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO"].includes(srv.estado) && (() => {
              const jornadas = [...(srv.visitas ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
              const recurrente = srv.tipoServicio === "RECURRENTE";
              const totalHoras = jornadas.reduce((acc, v) => acc + horasTrabajadas(v.horaInicioReal, v.horaFinReal), 0);

              return (
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <p className="text-xs font-medium text-slate-500">{recurrente ? `Jornadas (${jornadas.length})` : "Cuándo se hace"}</p>
                    {totalHoras > 0 && (
                      <p className="text-xs text-slate-500">
                        Trabajado: <strong className="text-slate-700">{formatearDuracion(totalHoras)}</strong>
                      </p>
                    )}
                  </div>

                  {jornadas.length === 0 ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Este servicio no tiene ninguna jornada en la agenda. Normalmente se crea sola al confirmarlo: revisa que el plan tenga fecha y
                      horas, o añade un día abajo.
                    </p>
                  ) : (
                    <ul className="mb-2 space-y-1">
                      {jornadas.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2 py-1.5 text-xs">
                          <span className="min-w-0">
                            <span className="font-medium text-slate-700">
                              {new Date(v.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                            </span>
                            {v.horaInicioProg && <span className="text-slate-500"> · {v.horaInicioProg}–{v.horaFinProg}</span>}
                            {v.profesional && <span className="text-slate-400"> · {v.profesional.nombre}</span>}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {/* El tiempo real es lo que se factura, no el previsto. */}
                            <Cronometro inicio={v.horaInicioReal} fin={v.horaFinReal} />
                            <EstadoBadge estado={v.estado} />
                            {/* La cuenta de esta jornada, entera: los cuatro
                                tiempos, la regla y la tarifa que se le
                                aplicaron. Un importe sin explicación no se
                                puede defender delante de la familia. */}
                            <button
                              onClick={() => setDesgloseDe(v.id)}
                              className="rounded-md border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
                              title="Ver de dónde sale el importe de esta jornada"
                            >
                              Desglose
                            </button>
                            {v.estado === "FINALIZADA" && (
                              <button onClick={() => revisarVisita(v)} className="rounded-md border border-slate-300 px-2 py-0.5 hover:bg-slate-100">
                                Verificar
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {["CONFIRMADO", "EN_CURSO"].includes(srv.estado) && (
                    <div>
                      {/* Excepción, no el camino normal: un día extra que no
                          sale de la recurrencia (una sustitución, un refuerzo
                          puntual). Por eso está replegado. */}
                      <button
                        onClick={() => setDiaSueltoAbierto((v) => !v)}
                        className="text-xs font-medium text-slate-400 hover:text-slate-600"
                      >
                        {diaSueltoAbierto ? "Cancelar" : "+ Añadir un día suelto"}
                      </button>
                      {diaSueltoAbierto && (
                        <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <input
                            type="date"
                            value={nuevaVisita.fecha}
                            onChange={(e) => setNuevaVisita((v) => ({ ...v, fecha: e.target.value }))}
                            className="rounded-md border border-slate-300 px-2 py-1.5"
                          />
                          <input
                            type="time"
                            value={nuevaVisita.horaInicio}
                            onChange={(e) => setNuevaVisita((v) => ({ ...v, horaInicio: e.target.value }))}
                            className="rounded-md border border-slate-300 px-2 py-1.5"
                          />
                          <input
                            type="time"
                            value={nuevaVisita.horaFin}
                            onChange={(e) => setNuevaVisita((v) => ({ ...v, horaFin: e.target.value }))}
                            className="rounded-md border border-slate-300 px-2 py-1.5"
                          />
                          <input
                            type="text"
                            placeholder="Tareas, separadas por coma"
                            value={nuevaVisita.tareas}
                            onChange={(e) => setNuevaVisita((v) => ({ ...v, tareas: e.target.value }))}
                            className="rounded-md border border-slate-300 px-2 py-1.5"
                          />
                          <button
                            onClick={programarVisita}
                            disabled={!nuevaVisita.fecha}
                            className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 hover:bg-slate-100 disabled:opacity-50 sm:col-span-4"
                          >
                            Añadir el día
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* El precio se fija por hora porque CUIDA cobra por tiempo. De
                ahí salen las tres cifras que importan y que antes no estaban
                en ninguna parte: lo que cobra la profesional —que es lo único
                que ella ve—, lo que se le cobra a la familia y la comisión. */}
            <div className="rounded-lg border border-slate-200">
              <button
                onClick={() => setTarifaAbierta((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                <span>Precio y reparto</span>
                <span className="flex items-center gap-1 font-normal normal-case text-slate-400">
                  {tarifa.tarifaTipo === "VOLUNTARIO"
                    ? "Voluntario"
                    : tarifa.precioHora
                      ? `${tarifa.precioHora} €/h`
                      : "Sin fijar"}
                  <IconChevronDown className={`h-3.5 w-3.5 transition ${tarifaAbierta ? "rotate-180" : ""}`} />
                </span>
              </button>
              {tarifaAbierta && (
                <div className="space-y-3 border-t border-slate-100 px-3 pb-3 pt-3">
                  {/* La tarifa de la casa, a un clic. Está puesta en
                      Configuración; que haya que teclearla otra vez aquí era
                      la forma más segura de que dos servicios iguales
                      acabaran a precios distintos. */}
                  {tarifaDeLaCasa && String(tarifa.precioHora) !== String(tarifaDeLaCasa.precioHoraCliente) && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-brand-green-200 bg-brand-green-50 px-2.5 py-2 text-xs text-brand-green-800">
                      <span className="min-w-0 flex-1">
                        Tarifa de la casa «{tarifaDeLaCasa.nombre}»: <b>{tarifaDeLaCasa.precioHoraCliente} €/h</b> a la familia,{" "}
                        {tarifaDeLaCasa.precioHoraProfesional} €/h al profesional
                        {comisionDeLaCasa != null && ` · ${comisionDeLaCasa} % para CUIDA`}.
                      </span>
                      <button onClick={aplicarTarifaDeLaCasa} className="boton-verde shrink-0 px-3 py-1.5 text-xs">
                        Aplicar
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <label className="text-slate-500">
                      Empresa responsable
                      <select
                        value={tarifa.empresaColaboradoraId}
                        onChange={(e) => setTarifa((t) => ({ ...t, empresaColaboradoraId: e.target.value }))}
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      >
                        <option value="">Ninguna (independiente)</option>
                        {empresas.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-slate-500">
                      Tipo
                      <select
                        value={tarifa.tarifaTipo}
                        onChange={(e) => setTarifa((t) => ({ ...t, tarifaTipo: e.target.value as typeof tarifa.tarifaTipo }))}
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      >
                        <option value="">Sin definir</option>
                        <option value="PAGADO">Pagado</option>
                        <option value="VOLUNTARIO">Voluntario</option>
                      </select>
                    </label>
                  </div>

                  {tarifa.tarifaTipo !== "VOLUNTARIO" && (
                    <>
                      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <label className="text-slate-500">
                          Precio por hora (€)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={tarifa.precioHora}
                            onChange={(e) => setTarifa((t) => ({ ...t, precioHora: e.target.value }))}
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>
                        <label className="text-slate-500">
                          Comisión CUIDA (%)
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="15"
                            value={tarifa.comisionPorcentaje}
                            onChange={(e) => setTarifa((t) => ({ ...t, comisionPorcentaje: e.target.value }))}
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>
                        <label className="text-slate-500">
                          IVA % (de "{s.necesidad.nombre}": {Number(s.necesidad.ivaPorcentaje)}%)
                          <input
                            type="number"
                            min="0"
                            max="21"
                            step="0.01"
                            placeholder={String(Number(s.necesidad.ivaPorcentaje))}
                            value={tarifa.ivaPorcentaje}
                            onChange={(e) => setTarifa((t) => ({ ...t, ivaPorcentaje: e.target.value }))}
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                          />
                        </label>
                      </div>

                      {repartoPrevisto ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="mb-2 text-xs text-slate-500">
                            {duracion(repartoPrevisto.minutos)} a {euros(repartoPrevisto.precioHora)}/h
                          </p>
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex items-baseline justify-between">
                              <dt className="text-slate-600">Cobra la profesional</dt>
                              <dd className="font-semibold tabular-nums text-brand-green-700">{euros(repartoPrevisto.importeProfesional)}</dd>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <dt className="text-slate-600">
                                Comisión CUIDA <span className="text-slate-400">({repartoPrevisto.comisionPorcentaje}%)</span>
                              </dt>
                              <dd className="font-semibold tabular-nums text-slate-800">{euros(repartoPrevisto.comision)}</dd>
                            </div>
                            <div className="flex items-baseline justify-between border-t border-slate-200 pt-1.5">
                              <dt className="text-slate-600">
                                Paga la familia <span className="text-slate-400">(IVA {repartoPrevisto.ivaPorcentaje}% incl.)</span>
                              </dt>
                              <dd className="font-semibold tabular-nums text-slate-900">{euros(repartoPrevisto.totalConIva)}</dd>
                            </div>
                          </dl>
                          <p className="mt-2 text-xs text-slate-400">
                            {tarifa.tipoServicio === "RECURRENTE"
                              ? "Por jornada. Cada mes se factura por las horas realmente fichadas."
                              : "Lo que se factura al final sale de las horas fichadas, no de las previstas."}
                          </p>
                        </div>
                      ) : (
                        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          Pon el precio por hora y las horas del plan y aquí sale el reparto.
                        </p>
                      )}
                    </>
                  )}

                  <input
                    type="text"
                    placeholder="Notas del precio (opcional)"
                    value={tarifa.tarifaNotas}
                    onChange={(e) => setTarifa((t) => ({ ...t, tarifaNotas: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  />

                  <button onClick={guardarTarifa} className="rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">
                    Guardar precio
                  </button>

                  {tarifa.tarifaTipo === "PAGADO" && (
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <span className="text-slate-500">Pago al profesional/empresa:</span>
                      <EstadoBadge estado={srv.pagoProfesionalEstado ?? "PENDIENTE"} />
                      {srv.pagoProfesionalEstado !== "PAGADO" && ["FINALIZADO", "VALIDADO", "CERRADO"].includes(srv.estado) && (
                        <button onClick={marcarPagado} className="rounded-md bg-brand-green-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-green-800">
                          Marcar como pagado
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Todas las incidencias del servicio, abiertas y cerradas: desde la
            ficha se ve el historial completo de lo que ha pasado, no solo el
            aviso de la que sigue abierta. */}
        {srv?.incidencias && srv.incidencias.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Incidencias del servicio ({srv.incidencias.length})
            </p>
            <ul className="space-y-1">
              {srv.incidencias.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => setIncidenciaAbierta(i.id)}
                    className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-2.5 py-2 text-left text-xs hover:bg-slate-50"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_PRIORIDAD[i.prioridad] ?? "bg-slate-300"}`} />
                    <span className="min-w-0 flex-1 truncate text-slate-700">{i.descripcion}</span>
                    {i.responsable && (
                      <span className="shrink-0 text-slate-400">{i.responsable.nombre ?? i.responsable.email.split("@")[0]}</span>
                    )}
                    <EstadoBadge estado={i.estado} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* El historial junta lo que pasó con el servicio y lo que fichó el
            profesional: sin los fichajes no se podía comprobar si de verdad
            estuvo las horas acordadas. */}
        {entradasHistorial.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial</p>
            <ul className="space-y-1 text-xs">
              {entradasHistorial.map((h) => (
                <li key={h.id} className={h.esFichaje ? "rounded-xl bg-slate-50 px-2 py-1.5 text-slate-600" : "text-slate-500"}>
                  {h.esFichaje && <IconClock className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-slate-400" />}
                  {new Date(h.cuando).toLocaleString("es-ES")} · {h.texto}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editarPersonaAbierto && (
        <PersonaDetalleModal
          personaId={s.persona.id}
          onClose={() => setEditarPersonaAbierto(false)}
          onCambiado={recargar}
        />
      )}

      {editarProfesionalAbierto && srv?.profesional && (
        <ProfesionalFormModal
          profesional={srv.profesional}
          empresas={empresas}
          onClose={() => setEditarProfesionalAbierto(false)}
          onSaved={recargar}
        />
      )}

      {incidenciaAbierta && (
        <IncidenciaFichaModal incidenciaId={incidenciaAbierta} onClose={() => setIncidenciaAbierta(null)} onChanged={recargar} />
      )}

      {pidiendoTiempo && (
        <TiempoTrabajadoModal
          titulo="¿Cuánto duró esta jornada?"
          explicacion={`${new Date(pidiendoTiempo.fecha).toLocaleDateString("es-ES", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}. Nadie registró el tiempo, y es lo que se factura. Confírmalo para poder verificarla.`}
          etiquetaConfirmar="Guardar y verificar"
          horaInicioProg={pidiendoTiempo.horaInicioProg}
          horaFinProg={pidiendoTiempo.horaFinProg}
          onConfirmar={async ({ horaInicio, horaFin }) => {
            await api.post(`/visitas/${pidiendoTiempo.id}/revisar`, { horaInicio, horaFin }, token);
            await recargar();
          }}
          onClose={() => setPidiendoTiempo(null)}
        />
      )}

      {desgloseDe && (
        <DesgloseVisitaModal visitaId={desgloseDe} onClose={() => setDesgloseDe(null)} onCambio={recargar} />
      )}
    </Modal>
  );
}
