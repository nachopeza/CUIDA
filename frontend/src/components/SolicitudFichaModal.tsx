import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Modal } from "./Modal.js";
import { EstadoBadge } from "./EstadoBadge.js";
import { Cronometro, horasTrabajadas } from "./Cronometro.js";
import { PersonaDetalleModal } from "../pages/coordinador/PersonaDetalleModal.js";
import { ProfesionalFormModal } from "../pages/coordinador/ProfesionalFormModal.js";
import { IncidenciaFichaModal } from "../pages/coordinador/IncidenciaFichaModal.js";
import { parsearDisponibilidad } from "../lib/disponibilidad.js";
import { resumenDisponibilidad } from "./DisponibilidadPicker.js";
import type { EmpresaColaboradora, Necesidad, Profesional, Solicitud } from "../lib/types.js";

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

const SERVICIO_CANCELABLE = ["PENDIENTE", "ASIGNADO", "CONFIRMADO", "EN_CURSO"];
const FRANJAS = ["Mañana", "Tarde", "Todo el día"];

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

  const [plan, setPlan] = useState({ fechaInicio: "", fechaFin: "", indefinido: false, horaInicio: "", horaFin: "", franjaHoraria: "Mañana", recurrencia: "" });
  const [tarifa, setTarifa] = useState({
    empresaColaboradoraId: "",
    tarifaImporte: "",
    tarifaTipo: "" as "" | "PAGADO" | "VOLUNTARIO",
    tarifaNotas: "",
    tipoServicio: "PUNTUAL" as "PUNTUAL" | "RECURRENTE",
    ivaPorcentaje: "",
  });
  const [nuevaVisita, setNuevaVisita] = useState({ fecha: "", horaInicio: "", horaFin: "", tareas: "" });

  async function cargar() {
    const [sol, necs, pros, emps] = await Promise.all([
      api.get<Solicitud>(`/solicitudes/${solicitudId}`, token),
      api.get<Necesidad[]>("/necesidades", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token),
    ]);
    setS(sol);
    setNecesidades(necs);
    setProfesionales(pros);
    setEmpresas(emps);
    if (sol.plan) {
      setPlan({
        fechaInicio: sol.plan.fechaInicio.slice(0, 10),
        fechaFin: sol.plan.fechaFin ? sol.plan.fechaFin.slice(0, 10) : "",
        indefinido: !sol.plan.fechaFin,
        horaInicio: sol.plan.horaInicio ?? "",
        horaFin: sol.plan.horaFin ?? "",
        franjaHoraria: sol.plan.franjaHoraria ?? "Mañana",
        recurrencia: sol.plan.recurrencia ?? "",
      });
    }
    if (sol.servicio) {
      setTarifa({
        empresaColaboradoraId: sol.servicio.empresaColaboradoraId ?? "",
        tarifaImporte: sol.servicio.tarifaImporte != null ? String(sol.servicio.tarifaImporte) : "",
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

  async function clasificar(necesidadId: string) {
    await api.patch(`/solicitudes/${solicitudId}`, { necesidadId }, token);
    await recargar();
  }

  async function aceptarSolicitud() {
    await api.post(`/solicitudes/${solicitudId}/estado`, { estado: "ACEPTADA" }, token);
    await recargar();
  }

  async function cancelarSolicitud() {
    await api.post(`/solicitudes/${solicitudId}/estado`, { estado: "CANCELADA" }, token);
    await recargar();
  }

  async function guardarPlan() {
    await api.post(
      `/solicitudes/${solicitudId}/plan`,
      {
        fechaInicio: new Date(plan.fechaInicio).toISOString(),
        fechaFin: plan.indefinido || !plan.fechaFin ? null : new Date(plan.fechaFin).toISOString(),
        horaInicio: plan.horaInicio || undefined,
        horaFin: plan.horaFin || undefined,
        franjaHoraria: plan.franjaHoraria || undefined,
        recurrencia: plan.recurrencia || undefined,
      },
      token,
    );
    await recargar();
  }

  async function asignar(profesionalId: string) {
    if (!s?.servicio || !profesionalId) return;
    await api.post(`/servicios/${s.servicio.id}/asignar`, { profesionalId }, token);
    await recargar();
  }

  async function guardarTarifa() {
    if (!s?.servicio) return;
    await api.post(
      `/servicios/${s.servicio.id}/tarifa`,
      {
        empresaColaboradoraId: tarifa.empresaColaboradoraId || null,
        tarifaImporte: tarifa.tarifaImporte ? Number(tarifa.tarifaImporte) : null,
        tarifaTipo: tarifa.tarifaTipo || null,
        tarifaNotas: tarifa.tarifaNotas || undefined,
        tipoServicio: tarifa.tipoServicio,
        ivaPorcentaje: tarifa.ivaPorcentaje ? Number(tarifa.ivaPorcentaje) : null,
      },
      token,
    );
    await recargar();
  }

  async function cambiarTipoServicio(t: "PUNTUAL" | "RECURRENTE") {
    if (!s?.servicio) return;
    setTarifa((v) => ({ ...v, tipoServicio: t }));
    await api.post(
      `/servicios/${s.servicio.id}/tarifa`,
      {
        empresaColaboradoraId: tarifa.empresaColaboradoraId || null,
        tarifaImporte: tarifa.tarifaImporte ? Number(tarifa.tarifaImporte) : null,
        tarifaTipo: tarifa.tarifaTipo || null,
        tarifaNotas: tarifa.tarifaNotas || undefined,
        tipoServicio: t,
      },
      token,
    );
    await recargar();
  }

  // Reemplazo por baja/enfermedad (sección "debo poder cambiar de
  // profesional si este se enferma o deja el trabajo"): las visitas ya
  // hechas conservan su profesional, así que la facturación de cada uno
  // sigue siendo correcta.
  async function reemplazarProfesional(profesionalId: string) {
    if (!s?.servicio || !profesionalId) return;
    await api.post(`/servicios/${s.servicio.id}/reemplazar-profesional`, { profesionalId }, token);
    setReemplazoAbierto(false);
    await recargar();
  }

  async function cambiarEstadoServicio(estado: string) {
    if (!s?.servicio || estado === s.servicio.estado) return;
    await api.post(`/servicios/${s.servicio.id}/estado`, { estado }, token);
    await recargar();
  }

  async function cancelarServicio() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/estado`, { estado: "CANCELADO" }, token);
    await recargar();
  }

  async function marcarPagado() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/pago`, {}, token);
    await recargar();
  }

  async function revisarVisita(visitaId: string) {
    await api.post(`/visitas/${visitaId}/revisar`, {}, token);
    await recargar();
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
    await recargar();
  }

  async function confirmarCancelacion() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/confirmar-cancelacion`, {}, token);
    await recargar();
  }

  async function rechazarCancelacion() {
    if (!s?.servicio) return;
    await api.post(`/servicios/${s.servicio.id}/rechazar-cancelacion`, {}, token);
    await recargar();
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
                    {i < indiceFase ? "✓" : i + 1}
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
            <p className="text-sm font-medium text-rose-700">🚫 Piden cancelar este servicio: {cancelacionPendiente.descripcion}</p>
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
              ⚠ Incidencia {incidenciaGeneralAbierta.codigo} abierta ({incidenciaGeneralAbierta.descripcion}) — resuélvela antes de finalizar/validar/cerrar el servicio.
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
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Persona / responsable</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditarPersonaAbierto(true)} className="text-xs font-medium text-brand underline decoration-dotted hover:text-brand-800">
                  Editar perfil completo
                </button>
                <button onClick={() => setPerfilPersonaAbierto((v) => !v)} className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600">
                  {perfilPersonaAbierto ? "Ocultar ▲" : "Ver perfil ▼"}
                </button>
              </div>
            </div>
            <button onClick={() => setEditarPersonaAbierto(true)} className="text-sm font-medium text-slate-800 hover:text-brand hover:underline">
              {s.persona.nombre} {s.persona.apellidos}
            </button>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {s.persona.telefono && (
                <a href={`tel:${s.persona.telefono}`} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                  📞 {s.persona.telefono}
                </a>
              )}
              {s.persona.usuario?.email && (
                <a href={`mailto:${s.persona.usuario.email}`} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                  ✉️ {s.persona.usuario.email}
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
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Profesional</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditarProfesionalAbierto(true)} className="text-xs font-medium text-brand underline decoration-dotted hover:text-brand-800">
                    Editar perfil completo
                  </button>
                  <button onClick={() => setPerfilProfesionalAbierto((v) => !v)} className="text-xs text-slate-400 underline decoration-dotted hover:text-slate-600">
                    {perfilProfesionalAbierto ? "Ocultar ▲" : "Ver perfil ▼"}
                  </button>
                </div>
              </div>
              <button onClick={() => setEditarProfesionalAbierto(true)} className="flex items-center gap-2 hover:text-brand">
                {srv.profesional.foto && <img src={srv.profesional.foto} alt="" className="h-8 w-8 rounded-full object-cover" />}
                <p className="text-sm font-medium text-slate-800 hover:underline">
                  {srv.profesional.nombre} {srv.profesional.apellidos}
                </p>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {srv.profesional.telefono && (
                  <a href={`tel:${srv.profesional.telefono}`} className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">
                    📞 {srv.profesional.telefono}
                  </a>
                )}
                {["CONFIRMADO", "EN_CURSO"].includes(srv.estado) && (
                  <button onClick={() => setReemplazoAbierto((v) => !v)} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700 hover:bg-amber-100">
                    🔄 Reemplazar
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

        {/* Datos de la solicitud: siempre editables, pero replegados en cuanto
            ya está aceptada — ya no es lo que hay que mirar en esa fase. */}
        <div className="rounded-lg border border-slate-200">
          <button
            onClick={() => setDatosAbiertos((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            <span>Datos de la solicitud</span>
            <span className="font-normal normal-case text-slate-400">{datosAbiertos ? "Ocultar ▲" : srv ? "Ver / editar ▼" : "▼"}</span>
          </button>
          {(datosAbiertos || !srv) && (
            <div className="space-y-4 border-t border-slate-100 px-3 pb-3 pt-3">
              <div>
                <label className="text-xs text-slate-500">
                  Necesidad
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
                <p className="mb-1.5 text-xs text-slate-500">Días y horas</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-xs text-slate-500">
                    Desde
                    <input type="date" value={plan.fechaInicio} onChange={(e) => setPlan((p) => ({ ...p, fechaInicio: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {FRANJAS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setPlan((p) => ({ ...p, franjaHoraria: f }))}
                      className={`rounded-md border px-2.5 py-1 text-xs ${plan.franjaHoraria === f ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {f}
                    </button>
                  ))}
                  <input
                    type="text"
                    placeholder="Recurrencia (ej. L-V)"
                    value={plan.recurrencia}
                    onChange={(e) => setPlan((p) => ({ ...p, recurrencia: e.target.value }))}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button onClick={guardarPlan} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">
                    Guardar días/horas
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fase 1: pendiente de revisión — sin servicio todavía. Una sola
            decisión posible: aceptar o cancelar. */}
        {!srv && !cancelada && (
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
            <p className="mb-2 text-sm text-slate-700">Pendiente de revisión por coordinación.</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={aceptarSolicitud}
                disabled={!s.plan}
                title={!s.plan ? "Guarda los días/horas antes de aceptar" : undefined}
                className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
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

        {/* Fase 2+: hay servicio — el foco pasa a profesional/ejecución. */}
        {srv && (
          <div className="space-y-3">
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
                          → {estado.replace(/_/g, " ")}
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

            {/* Fase "buscando": elegir explícitamente entre dejarlo en el
                mercado de profesionales o asignar a alguien directamente —
                nunca las dos cosas mezcladas en el mismo formulario. */}
            {fase === "buscando" && srv.estado === "PENDIENTE" && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm text-slate-700">¿Cómo se cubre este servicio?</p>
                <div className="mb-3 flex gap-2 text-xs">
                  <button
                    onClick={() => setModoAsignacion("mercado")}
                    className={`rounded-full px-3 py-1.5 ${modoAsignacion === "mercado" ? "bg-brand text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    🔍 Buscar por profesionales
                  </button>
                  <button
                    onClick={() => setModoAsignacion("directo")}
                    className={`rounded-full px-3 py-1.5 ${modoAsignacion === "directo" ? "bg-brand text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    🎯 Escoger profesional directamente
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
                            <button onClick={() => asignar(i.profesional.id)} className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800">
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
                  <label className="block text-xs text-slate-500">
                    Profesional
                    <select defaultValue="" onChange={(e) => asignar(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5">
                      <option value="" disabled>
                        Elegir…
                      </option>
                      {profesionales.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} {p.apellidos} · {p.zona ?? "Cantabria"}
                          {p.empresaColaboradora ? ` · ${p.empresaColaboradora.nombre}` : " · independiente"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {srv.estado === "ASIGNADO" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm text-slate-700">
                  {srv.profesional?.nombre} {srv.profesional?.apellidos} — esperando que acepte el servicio.
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
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                El profesional ha terminado. Verifica las visitas abajo para cerrar el servicio.
              </p>
            )}

            {/* Visitas: relevantes desde que hay profesional confirmado hasta
                que se verifica el trabajo. */}
            {["CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO", "CERRADO"].includes(srv.estado) && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">Visitas</p>
                  {(() => {
                    const total = (srv.visitas ?? []).reduce((acc, v) => acc + horasTrabajadas(v.horaInicioReal, v.horaFinReal), 0);
                    if (total === 0) return null;
                    return <p className="text-xs text-slate-500">Tiempo total trabajado: <strong>{total.toFixed(2)} h</strong></p>;
                  })()}
                </div>
                {srv.visitas && srv.visitas.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {srv.visitas.map((v) => (
                      <li key={v.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                        <span>
                          {new Date(v.fecha).toLocaleDateString("es-ES")} {v.horaInicioProg && `· ${v.horaInicioProg}-${v.horaFinProg}`}
                          {v.profesional && <span className="text-slate-400"> · {v.profesional.nombre}</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* Tiempo real trabajado: es lo que se factura en
                              los servicios recurrentes. */}
                          <Cronometro inicio={v.horaInicioReal} fin={v.horaFinReal} />
                          <EstadoBadge estado={v.estado} />
                          {v.estado === "FINALIZADA" && (
                            <button onClick={() => revisarVisita(v.id)} className="rounded-md border border-slate-300 px-2 py-0.5 hover:bg-slate-100">
                              Verificar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {["CONFIRMADO", "EN_CURSO"].includes(srv.estado) && (
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
                    <button onClick={programarVisita} className="col-span-2 rounded-md border border-slate-300 px-2 py-1.5 hover:bg-slate-100 sm:col-span-4">
                      Programar visita
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tarifa/empresa: se puede fijar desde el principio, pero se
                repliega para no competir por atención con la fase actual. */}
            <div className="rounded-lg border border-slate-200">
              <button
                onClick={() => setTarifaAbierta((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                <span>Tarifa y facturación</span>
                <span className="font-normal normal-case text-slate-400">
                  {tarifaAbierta ? "Ocultar ▲" : tarifa.tarifaTipo ? (tarifa.tarifaTipo === "VOLUNTARIO" ? "Voluntario ▼" : `${tarifa.tarifaImporte || "?"} € ▼`) : "Sin definir ▼"}
                </span>
              </button>
              {tarifaAbierta && (
                <div className="space-y-3 border-t border-slate-100 px-3 pb-3 pt-3">
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
                      Tipo de tarifa
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
                    {/* En un servicio recurrente el importe es el precio por
                        hora: el servicio no se cierra nunca, se factura cada
                        mes por las horas reales trabajadas (sección "basar el
                        sistema de facturación en el tiempo"). En uno puntual
                        sigue siendo el importe total del servicio. */}
                    <label className="text-slate-500">
                      {tarifa.tipoServicio === "RECURRENTE" ? "Precio por hora €" : "Importe €"}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tarifa.tarifaImporte}
                        onChange={(e) => setTarifa((t) => ({ ...t, tarifaImporte: e.target.value }))}
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="text-slate-500">
                      IVA % (heredado de "{s.necesidad.nombre}": {Number(s.necesidad.ivaPorcentaje)}%)
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
                    <input
                      type="text"
                      placeholder="Notas de la tarifa (opcional)"
                      value={tarifa.tarifaNotas}
                      onChange={(e) => setTarifa((t) => ({ ...t, tarifaNotas: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1.5 sm:col-span-2"
                    />
                  </div>

                  {tarifa.tarifaImporte && (
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {(() => {
                        const ivaPct = tarifa.ivaPorcentaje ? Number(tarifa.ivaPorcentaje) : Number(s.necesidad.ivaPorcentaje);
                        const importe = Number(tarifa.tarifaImporte) || 0;
                        const iva = Math.round(importe * (ivaPct / 100) * 100) / 100;
                        const porHora = tarifa.tipoServicio === "RECURRENTE" ? "/hora" : "";
                        return `Base ${importe.toFixed(2)} €${porHora} + IVA ${ivaPct}% (${iva.toFixed(2)} €${porHora}) = ${(importe + iva).toFixed(2)} €${porHora}${
                          porHora ? " — se factura cada mes por las horas reales trabajadas" : " total"
                        }`;
                      })()}
                    </p>
                  )}

                  <button onClick={guardarTarifa} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100">
                    Guardar tarifa
                  </button>

                  {tarifa.tarifaTipo === "PAGADO" && (
                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
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

        {s.estadoHistorial && s.estadoHistorial.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial</p>
            <ul className="space-y-1 text-xs text-slate-500">
              {s.estadoHistorial.map((h) => (
                <li key={h.id}>
                  {new Date(h.createdAt).toLocaleString("es-ES")} · {h.estadoNuevo.replace(/_/g, " ")}
                  {h.motivo && ` — ${h.motivo}`}
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
    </Modal>
  );
}
