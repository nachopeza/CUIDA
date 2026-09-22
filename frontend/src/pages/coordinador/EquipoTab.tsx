import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { SearchBox } from "../../components/SearchBox.js";
import { exportarCSV } from "../../lib/csv.js";
import { duracion } from "../../lib/economia.js";
import {
  DOCUMENTOS_OBLIGATORIOS,
  ETIQUETA_AUSENCIA,
  ETIQUETA_CONTRATO,
  ETIQUETA_DOCUMENTO,
  TONO_VIGENCIA,
  esImpedimento,
  textoCarencia,
  textoVigencia,
  vigenciaDe,
} from "../../lib/personal.js";
import { IconAlert, IconCalendar, IconCheck, IconClock, IconFile, IconPlus, IconTrash, IconUsers } from "../../components/icons.js";
import type { Ausencia, DiaDeJornada, DocumentoProfesional, MiembroEquipo, RegistroJornada, TipoDocumento } from "../../lib/types.js";

type Vista = "plantilla" | "ausencias" | "jornada";

function fecha(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function mesActualISO() {
  return new Date().toISOString().slice(0, 7);
}

const ESTADO_AUSENCIA: Record<string, string> = {
  SOLICITADA: "bg-amber-100 text-amber-700",
  APROBADA: "bg-brand-green-100 text-brand-green-700",
  RECHAZADA: "bg-rose-100 text-rose-700",
  CANCELADA: "bg-slate-200 text-slate-600",
};

// Equipo: el expediente de quien trabaja, sus ausencias y el registro de
// jornada. Existe porque la parte de personal no cabe en el perfil operativo
// del profesional —zona, disponibilidad, foto— y porque tiene consecuencias
// distintas: sin ciertos papeles no se puede asignar a nadie.
export function EquipoTab() {
  const { token } = useAuth();
  const [vista, setVista] = useState<Vista>("plantilla");
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [registros, setRegistros] = useState<RegistroJornada[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [mes, setMes] = useState(mesActualISO());
  const [expediente, setExpediente] = useState<MiembroEquipo | null>(null);
  const [registroAbierto, setRegistroAbierto] = useState<RegistroJornada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function cargar() {
    const [e, a, r] = await Promise.all([
      api.get<MiembroEquipo[]>("/equipo", token),
      api.get<Ausencia[]>("/equipo/ausencias", token).catch(() => []),
      api.get<RegistroJornada[]>("/equipo/registros", token).catch(() => []),
    ]);
    setEquipo(e);
    setAusencias(a);
    setRegistros(r);
    // El expediente abierto tiene que reflejar lo que se acaba de cambiar.
    setExpediente((actual) => (actual ? (e.find((m) => m.id === actual.id) ?? null) : null));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function accion(clave: string, fn: () => Promise<unknown>, exito?: string) {
    setOcupado(clave);
    setError(null);
    setAviso(null);
    try {
      await fn();
      await cargar();
      if (exito) setAviso(exito);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^"|"$/g, "") : "No se ha podido completar");
    } finally {
      setOcupado(null);
    }
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = useMemo(
    () => equipo.filter((m) => (!q ? true : `${m.nombre} ${m.apellidos} ${m.codigo}`.toLowerCase().includes(q))),
    [equipo, q],
  );

  const bloqueados = equipo.filter((m) => m.bloqueado);
  const porRenovar = equipo.filter((m) => !m.bloqueado && m.carencias.length > 0);
  const pendientes = ausencias.filter((a) => a.estado === "SOLICITADA");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["plantilla", "Plantilla", equipo.length],
          ["ausencias", "Ausencias", pendientes.length > 0 ? pendientes.length : ausencias.length],
          ["jornada", "Registro de jornada", registros.length],
        ] as const).map(([clave, etiqueta, valor]) => (
          <button
            key={clave}
            onClick={() => setVista(clave)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              vista === clave ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {etiqueta} ({valor})
          </button>
        ))}
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar…" className="ml-auto w-full sm:w-56" />
      </div>

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {aviso && <p className="rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">{aviso}</p>}

      {/* --------------------------------------------------------- PLANTILLA */}
      {vista === "plantilla" && (
        <>
          {bloqueados.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-800">
                <IconAlert className="h-4 w-4" />
                {bloqueados.length} {bloqueados.length === 1 ? "persona no puede" : "personas no pueden"} trabajar
              </p>
              <p className="mt-0.5 text-xs text-rose-700">
                Les falta documentación obligatoria. El sistema no permite asignarles servicios hasta que la aporten.
              </p>
            </div>
          )}
          {porRenovar.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
                <IconClock className="h-4 w-4" />
                {porRenovar.length} con documentación a punto de caducar
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {visibles.map((m) => (
              <li key={m.id} className={`rounded-lg border bg-white p-3 ${m.bloqueado ? "border-rose-200" : "border-slate-200"}`}>
                <button onClick={() => setExpediente(m)} className="w-full text-left">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 hover:underline">
                        {m.nombre} {m.apellidos}
                        {m.bloqueado ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">No puede trabajar</span>
                        ) : (
                          <span className="rounded-full bg-brand-green-100 px-2 py-0.5 text-[11px] font-medium text-brand-green-700">En regla</span>
                        )}
                        {m.ausenciaHoy && (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            Hoy: {ETIQUETA_AUSENCIA[m.ausenciaHoy.tipo]}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.codigo} · {m.tipoRelacion === "LABORAL" ? "En nómina" : "Autónoma"}
                        {m.tipoContrato && ` · ${ETIQUETA_CONTRATO[m.tipoContrato]}`}
                        {m.horasSemanales ? ` · ${m.horasSemanales} h/semana` : ""}
                        {m.fechaAlta && ` · desde ${fecha(m.fechaAlta)}`}
                      </p>
                      {m.carencias.length > 0 && (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {m.carencias.map((c, i) => (
                            <li
                              key={i}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                esImpedimento(c) ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {textoCarencia(c)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="shrink-0 text-xs text-slate-400">
                      {m.documentos.length} documento{m.documentos.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* --------------------------------------------------------- AUSENCIAS */}
      {vista === "ausencias" && (
        <>
          {pendientes.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {pendientes.length} petición{pendientes.length === 1 ? "" : "es"} esperando tu respuesta.
            </p>
          )}
          {ausencias.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
              No hay ausencias registradas.
            </p>
          ) : (
            <ul className="space-y-2">
              {ausencias.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                        {a.profesional?.nombre} {a.profesional?.apellidos}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_AUSENCIA[a.estado]}`}>
                          {a.estado.toLowerCase()}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {ETIQUETA_AUSENCIA[a.tipo]} · del {fecha(a.desde)} al {fecha(a.hasta)}
                        {a.motivo && ` · ${a.motivo}`}
                      </p>
                      {a.respuesta && <p className="mt-0.5 text-xs text-slate-400">Respuesta: {a.respuesta}</p>}
                    </div>
                    {a.estado === "SOLICITADA" && (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => accion(a.id, () => api.post(`/equipo/ausencias/${a.id}/estado`, { estado: "APROBADA" }, token), "Ausencia aprobada")}
                          disabled={ocupado === a.id}
                          className="flex items-center gap-1 rounded-md bg-brand-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-green-700 disabled:opacity-50"
                        >
                          <IconCheck className="h-3.5 w-3.5" /> Aprobar
                        </button>
                        <button
                          onClick={() => {
                            const respuesta = window.prompt("¿Por qué no se puede?");
                            if (respuesta !== null)
                              accion(a.id, () => api.post(`/equipo/ausencias/${a.id}/estado`, { estado: "RECHAZADA", respuesta }, token), "Ausencia rechazada");
                          }}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ---------------------------------------------------- REGISTRO 34.9 */}
      {vista === "jornada" && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs text-slate-500">
              El registro diario de jornada es obligatorio (Art. 34.9 del Estatuto de los Trabajadores) y debe conservarse
              cuatro años a disposición de la Inspección. Cerrar el mes congela el detalle día a día para que no cambie
              después.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">
                Mes
                <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <button
                onClick={() => accion("cerrar", () => api.post("/equipo/registros/cerrar", { mes }, token), "Mes cerrado")}
                disabled={ocupado === "cerrar"}
                className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                <IconFile className="h-3.5 w-3.5" />
                {ocupado === "cerrar" ? "Cerrando…" : "Cerrar el mes"}
              </button>
              {registros.length > 0 && (
                <button
                  onClick={() =>
                    exportarCSV(
                      registros.flatMap((r) =>
                        (JSON.parse(r.detalle) as DiaDeJornada[]).map((d) => ({ registro: r, dia: d })),
                      ),
                      [
                        { encabezado: "Registro", valor: (x) => x.registro.codigo },
                        { encabezado: "Profesional", valor: (x) => `${x.registro.profesional.nombre} ${x.registro.profesional.apellidos}` },
                        { encabezado: "DNI", valor: (x) => x.registro.profesional.dni ?? "" },
                        { encabezado: "Fecha", valor: (x) => x.dia.fecha },
                        { encabezado: "Entrada", valor: (x) => x.dia.entrada ?? "" },
                        { encabezado: "Salida", valor: (x) => x.dia.salida ?? "" },
                        { encabezado: "Horas", valor: (x) => (x.dia.minutos / 60).toFixed(2) },
                        { encabezado: "Servicio", valor: (x) => x.dia.servicio },
                        { encabezado: "Conformidad", valor: (x) => (x.registro.conformeAt ? fecha(x.registro.conformeAt) : "pendiente") },
                      ],
                      "registro-de-jornada",
                    )
                  }
                  className="ml-auto text-xs font-medium text-brand hover:text-brand-800"
                >
                  Exportar el registro completo
                </button>
              )}
            </div>
          </div>

          {registros.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
              Todavía no has cerrado ningún mes.
            </p>
          ) : (
            <ul className="space-y-2">
              {registros.map((r) => {
                const exceso = r.minutosContrato != null ? r.minutosTrabajados - r.minutosContrato : null;
                return (
                  <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <button onClick={() => setRegistroAbierto(r)} className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 hover:underline">
                          {r.profesional.nombre} {r.profesional.apellidos} · {r.mes}
                          {r.conformeAt ? (
                            <span className="rounded-full bg-brand-green-100 px-2 py-0.5 text-[11px] font-medium text-brand-green-700">Conforme</span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Sin conformidad</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.codigo} · {r.diasTrabajados} día{r.diasTrabajados === 1 ? "" : "s"} · cerrado el {fecha(r.cerradoAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-semibold tabular-nums text-slate-900">{duracion(r.minutosTrabajados)}</p>
                        {/* En positivo: "−85 h sobre contrato" se lee como un
                            error de cálculo; "85 h menos de lo pactado" dice
                            lo que pasa. */}
                        {exceso != null && (
                          <p className={`text-xs ${exceso > 0 ? "text-amber-600" : exceso < 0 ? "text-slate-500" : "text-brand-green-700"}`}>
                            {exceso === 0
                              ? "justo lo pactado"
                              : exceso > 0
                                ? `${duracion(exceso)} más de lo pactado`
                                : `${duracion(Math.abs(exceso))} menos de lo pactado`}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {expediente && (
        <ExpedienteModal
          miembro={expediente}
          onClose={() => setExpediente(null)}
          onCambiado={cargar}
          onError={setError}
        />
      )}

      {registroAbierto && (
        <Modal title={`${registroAbierto.codigo} · ${registroAbierto.mes}`} onClose={() => setRegistroAbierto(null)} size="lg">
          <RegistroDetalle registro={registroAbierto} />
        </Modal>
      )}
    </div>
  );
}

// El detalle día a día tal y como quedó congelado. Se comparte con el panel
// del profesional, que ve exactamente el mismo documento.
export function RegistroDetalle({ registro }: { registro: RegistroJornada }) {
  const dias: DiaDeJornada[] = useMemo(() => {
    try {
      return JSON.parse(registro.detalle);
    } catch {
      return [];
    }
  }, [registro.detalle]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-500">Trabajado</p>
          <p className="text-lg font-semibold text-slate-900">{duracion(registro.minutosTrabajados)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-500">Según contrato</p>
          <p className="text-lg font-semibold text-slate-900">
            {registro.minutosContrato != null ? duracion(registro.minutosContrato) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-500">Días</p>
          <p className="text-lg font-semibold text-slate-900">{registro.diasTrabajados}</p>
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-500">Conformidad</p>
          <p className="text-sm font-medium text-slate-900">
            {registro.conformeAt ? new Date(registro.conformeAt).toLocaleDateString("es-ES") : "Pendiente"}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 font-semibold">Día</th>
            <th className="py-2 font-semibold">Entrada</th>
            <th className="py-2 font-semibold">Salida</th>
            <th className="py-2 text-right font-semibold">Tiempo</th>
            <th className="py-2 font-semibold">Servicio</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-1.5 whitespace-nowrap">{new Date(`${d.fecha}T00:00:00`).toLocaleDateString("es-ES")}</td>
              <td className="py-1.5 tabular-nums">{d.entrada ?? "—"}</td>
              <td className="py-1.5 tabular-nums">{d.salida ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{duracion(d.minutos)}</td>
              <td className="py-1.5 text-xs text-slate-500">{d.servicio}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {registro.conformeNota && <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">Nota: {registro.conformeNota}</p>}
    </div>
  );
}

const TIPOS: TipoDocumento[] = [
  "DNI",
  "DELITOS_SEXUALES",
  "TITULACION",
  "CONTRATO",
  "ALTA_SEGURIDAD_SOCIAL",
  "CARNE_CONDUCIR",
  "SEGURO",
  "FORMACION",
  "OTRO",
];

function ExpedienteModal({
  miembro,
  onClose,
  onCambiado,
  onError,
}: {
  miembro: MiembroEquipo;
  onClose: () => void;
  onCambiado: () => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState({ tipo: "DELITOS_SEXUALES" as TipoDocumento, nombre: "", fechaEmision: "", fechaCaducidad: "" });
  const [guardando, setGuardando] = useState(false);
  const [nuevaAusencia, setNuevaAusencia] = useState({ tipo: "VACACIONES", desde: "", hasta: "", motivo: "" });

  async function anadir() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    onError(null);
    try {
      await api.post(`/equipo/${miembro.id}/documentos`, { ...form, fechaEmision: form.fechaEmision || null, fechaCaducidad: form.fechaCaducidad || null }, token);
      setForm({ tipo: "DELITOS_SEXUALES", nombre: "", fechaEmision: "", fechaCaducidad: "" });
      await onCambiado();
    } catch (e) {
      onError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(d: DocumentoProfesional) {
    if (!window.confirm(`¿Quitar "${d.nombre}" del expediente?`)) return;
    onError(null);
    try {
      await api.delete(`/equipo/documentos/${d.id}`, token);
      await onCambiado();
    } catch (e) {
      onError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido borrar");
    }
  }

  async function registrarAusencia() {
    if (!nuevaAusencia.desde || !nuevaAusencia.hasta) return;
    onError(null);
    try {
      await api.post(`/equipo/${miembro.id}/ausencias`, nuevaAusencia, token);
      setNuevaAusencia({ tipo: "VACACIONES", desde: "", hasta: "", motivo: "" });
      await onCambiado();
    } catch (e) {
      onError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido registrar");
    }
  }

  const faltan = DOCUMENTOS_OBLIGATORIOS.filter((t) => !miembro.documentos.some((d) => d.tipo === t));

  return (
    <Modal title={`${miembro.nombre} ${miembro.apellidos}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>{miembro.tipoRelacion === "LABORAL" ? "En nómina" : "Autónoma"}</span>
          {miembro.tipoContrato && <span>· {ETIQUETA_CONTRATO[miembro.tipoContrato]}</span>}
          {miembro.horasSemanales ? <span>· {miembro.horasSemanales} h/semana</span> : null}
          {miembro.fechaAlta && <span>· alta {fecha(miembro.fechaAlta)}</span>}
          {miembro.categoria && <span>· {miembro.categoria}</span>}
        </div>

        {miembro.bloqueado && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            No se le puede asignar ningún servicio hasta que aporte {faltan.map((t) => ETIQUETA_DOCUMENTO[t].toLowerCase()).join(" y ")}.
          </p>
        )}

        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <IconFile className="h-3.5 w-3.5" /> Expediente
          </p>
          {miembro.documentos.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">Sin documentos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {miembro.documentos.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{d.nombre}</p>
                    <p className="text-xs text-slate-400">
                      {ETIQUETA_DOCUMENTO[d.tipo]}
                      {d.fechaEmision && ` · emitido ${fecha(d.fechaEmision)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONO_VIGENCIA[vigenciaDe(d.fechaCaducidad)]}`}>
                      {textoVigencia(d)}
                    </span>
                    <button onClick={() => borrar(d)} className="text-slate-300 hover:text-rose-600" title="Quitar del expediente">
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              Tipo
              <select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoDocumento }))}
                className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_DOCUMENTO[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Referencia
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Certificación negativa del Registro Central"
                className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Emitido el
              <input type="date" value={form.fechaEmision} onChange={(e) => setForm((f) => ({ ...f, fechaEmision: e.target.value }))} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              Caduca el
              <input type="date" value={form.fechaCaducidad} onChange={(e) => setForm((f) => ({ ...f, fechaCaducidad: e.target.value }))} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button
              onClick={anadir}
              disabled={guardando || !form.nombre.trim()}
              className="flex items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50 sm:col-span-2"
            >
              <IconPlus className="h-3.5 w-3.5" /> {guardando ? "Guardando…" : "Añadir al expediente"}
            </button>
          </div>
        </section>

        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <IconCalendar className="h-3.5 w-3.5" /> Ausencias
          </p>
          {miembro.ausencias.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">Ninguna prevista.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {miembro.ausencias.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-slate-700">
                    {ETIQUETA_AUSENCIA[a.tipo]} · {fecha(a.desde)} → {fecha(a.hasta)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_AUSENCIA[a.estado]}`}>{a.estado.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Una baja llega por teléfono: coordinación la anota y queda
              aprobada, no hay nada que pedir. */}
          <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-4">
            <select
              value={nuevaAusencia.tipo}
              onChange={(e) => setNuevaAusencia((a) => ({ ...a, tipo: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {Object.entries(ETIQUETA_AUSENCIA).map(([clave, etiqueta]) => (
                <option key={clave} value={clave}>
                  {etiqueta}
                </option>
              ))}
            </select>
            <input type="date" value={nuevaAusencia.desde} onChange={(e) => setNuevaAusencia((a) => ({ ...a, desde: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input type="date" value={nuevaAusencia.hasta} onChange={(e) => setNuevaAusencia((a) => ({ ...a, hasta: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button
              onClick={registrarAusencia}
              disabled={!nuevaAusencia.desde || !nuevaAusencia.hasta}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Anotar ausencia
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
