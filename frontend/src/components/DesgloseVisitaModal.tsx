import { useEffect, useState } from "react";
import { Modal } from "./Modal.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { AYUDA_TIEMPO, MOTIVOS_DESVIACION, NOMBRE_BASE, NOMBRE_REDONDEO, NOMBRE_TIEMPO, duracion, euros, type Desglose } from "../lib/tiempo.js";
import { IconAlert, IconCheck, IconClock, IconEuro, IconHelp, IconPencil } from "./icons.js";

// ---------------------------------------------------------------------------
// "¿Por qué 51 €?"
//
// Un importe que nadie puede justificar no sirve para facturar. Esta ficha
// enseña la cadena entera de una jornada: los cuatro tiempos, la regla que
// convierte uno en otro, la tarifa que se le aplicó y los tres importes con su
// multiplicación escrita. La coordinadora puede responderle a la familia sin
// abrir una hoja de cálculo, y el profesional ve su parte y solo su parte.
// ---------------------------------------------------------------------------

function Tiempo({ clave, minutos, destacado }: { clave: keyof typeof NOMBRE_TIEMPO; minutos: number | null; destacado?: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${destacado ? "bg-brand-green-50 ring-1 ring-brand-green-200" : "bg-slate-50"}`}
      title={AYUDA_TIEMPO[clave]}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{NOMBRE_TIEMPO[clave]}</p>
      <p className={`text-sm font-semibold ${destacado ? "text-brand-green-700" : "text-slate-700"}`}>{duracion(minutos)}</p>
    </div>
  );
}

function Dinero({
  titulo,
  importe,
  cuenta,
  tono,
}: {
  titulo: string;
  importe: number | undefined;
  cuenta: string | undefined;
  tono: "cobro" | "pago" | "cuida";
}) {
  const colores = {
    cobro: "border-blue-200 bg-blue-50 text-blue-800",
    pago: "border-brand-green-200 bg-brand-green-50 text-brand-green-800",
    cuida: "border-slate-200 bg-slate-50 text-slate-700",
  }[tono];
  return (
    <div className={`rounded-lg border px-3 py-2 ${colores}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-80">{titulo}</p>
      <p className="text-lg font-semibold">{euros(importe)}</p>
      {/* La cuenta, escrita. Enseñar el resultado sin la multiplicación es
          justo lo que hace que nadie se fíe del número. */}
      <p className="mt-0.5 text-[11px] opacity-80">{cuenta}</p>
    </div>
  );
}

export function DesgloseVisitaModal({ visitaId, onClose, onCambio }: { visitaId: string; onClose: () => void; onCambio?: () => void }) {
  const { token, usuario } = useAuth();
  const [d, setD] = useState<Desglose | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sin motivo elegido de salida. Un motivo que viene marcado de fábrica se
  // acaba guardando tal cual, y esta decisión se defiende después ante la
  // familia o ante quien trabajó: tiene que decirla una persona.
  const [motivo, setMotivo] = useState<string>("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esGestor = usuario?.rol !== "PROFESIONAL" && usuario?.rol !== "FAMILIAR" && usuario?.rol !== "PERSONA";

  async function cargar() {
    try {
      setD(await api.get<Desglose>(`/visitas/${visitaId}/desglose`, token));
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cargar");
    }
  }
  useEffect(() => {
    void cargar();
  }, [visitaId]);

  async function decidir(decision: "APROBADO" | "RECHAZADO") {
    setGuardando(true);
    setError(null);
    try {
      await api.post(`/visitas/${visitaId}/ajuste`, { decision, motivo, nota: nota || undefined }, token);
      await cargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  const hora = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <Modal title={d ? `Desglose de ${d.visita.codigo}` : "Desglose"} onClose={onClose} size="lg">
      {!d ? (
        <p className="text-sm text-slate-500">{error ?? "Cargando…"}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-600">
              {new Date(d.visita.fecha).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
              {d.visita.horaInicioProg ?? "—"}–{d.visita.horaFinProg ?? "—"} previstos
            </p>
            {!d.definitivo && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Previsión: la jornada todavía no está cerrada
              </span>
            )}
          </div>

          {/* --- Los cuatro tiempos ------------------------------------- */}
          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <IconClock className="h-3.5 w-3.5" aria-hidden /> Tiempo
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tiempo clave="programados" minutos={d.tiempos.programados} />
              <Tiempo clave="reales" minutos={d.tiempos.reales} />
              {d.economia?.cliente && <Tiempo clave="facturables" minutos={d.tiempos.facturables} destacado />}
              <Tiempo clave="liquidables" minutos={d.tiempos.liquidables} destacado />
            </div>

            <p className="mt-2 flex gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <IconHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span>{d.tiempos.explicacion}</span>
            </p>

            <p className="mt-1.5 text-[11px] text-slate-400">
              Fichaje real: {hora(d.visita.horaInicioReal)}–{hora(d.visita.horaFinReal)}
              {d.visita.cierreManual && " · cerrada a mano por coordinación, no por el profesional"}
              {d.tiempos.retrasoMinutos != null && d.tiempos.retrasoMinutos > 0 && ` · entró ${d.tiempos.retrasoMinutos} min tarde`}
            </p>
          </section>

          {/* --- El tiempo de más, que no se cobra solo ------------------ */}
          {d.ajuste.estado === "PENDIENTE" && (
            <section className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-orange-800">
                <IconAlert className="h-4 w-4" aria-hidden />
                {duracion(d.tiempos.desviacionMinutos)} por encima de lo acordado
              </p>
              <p className="mt-1 text-xs text-orange-700">
                CUIDA no cobra ese tiempo por su cuenta. Di por qué se ha alargado y decide si entra en la factura y en la
                liquidación o si la jornada se queda en lo acordado.
              </p>
              {esGestor ? (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {MOTIVOS_DESVIACION.map((m) => (
                      <button
                        key={m.valor}
                        onClick={() => setMotivo(m.valor)}
                        className={`rounded-full px-2.5 py-1 text-xs ${motivo === m.valor ? "bg-orange-600 text-white" : "border border-orange-200 bg-white text-orange-700 hover:bg-orange-100"}`}
                      >
                        {m.etiqueta}
                      </button>
                    ))}
                  </div>
                  <input
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Nota (opcional): qué pasó exactamente"
                    className="w-full rounded-md border border-orange-200 px-2 py-1.5 text-xs"
                  />
                  {!motivo && <p className="text-xs text-orange-700">Elige antes por qué se alargó.</p>}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => decidir("APROBADO")}
                      disabled={guardando || !motivo}
                      className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      Aprobar el tiempo de más
                    </button>
                    <button
                      onClick={() => decidir("RECHAZADO")}
                      disabled={guardando || !motivo}
                      className="rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                    >
                      Quedarse en lo acordado
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-orange-700">Coordinación tiene que revisarlo antes de que cuente.</p>
              )}
            </section>
          )}

          {d.ajuste.estado === "APROBADO" || d.ajuste.estado === "RECHAZADO" ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <IconCheck className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              Tiempo adicional {d.ajuste.estado === "APROBADO" ? "aprobado" : "rechazado"}
              {d.ajuste.motivo && ` · ${MOTIVOS_DESVIACION.find((m) => m.valor === d.ajuste.motivo)?.etiqueta ?? d.ajuste.motivo}`}
              {d.ajuste.nota && ` · ${d.ajuste.nota}`}
            </p>
          ) : null}

          {/* --- El dinero ---------------------------------------------- */}
          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <IconEuro className="h-3.5 w-3.5" aria-hidden /> Dinero
            </p>
            {!d.economia ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Esta jornada todavía no tiene precio: fija la tarifa del servicio o crea una tarifa vigente.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {d.economia.cliente && (
                  <Dinero titulo="Paga la familia" importe={d.economia.cliente.importe} cuenta={d.economia.cliente.cuenta} tono="cobro" />
                )}
                {d.economia.profesional && (
                  <Dinero
                    titulo={usuario?.rol === "PROFESIONAL" ? "Cobras" : "Cobra el profesional"}
                    importe={d.economia.profesional.importe}
                    cuenta={d.economia.profesional.cuenta}
                    tono="pago"
                  />
                )}
                {d.economia.cuida && (
                  <Dinero titulo="Ingreso de CUIDA" importe={d.economia.cuida.importe} cuenta={d.economia.cuida.cuenta} tono="cuida" />
                )}
              </div>
            )}
            {d.tarifa && <p className="mt-1.5 text-[11px] text-slate-400">{d.tarifa.origen}</p>}
            {d.economia?.cuida && (
              // No es beneficio: de ahí salen impuestos, seguros, pasarela y
              // administración. Llamarlo margen sería contar mal el negocio.
              <p className="mt-0.5 text-[11px] text-slate-400">
                El ingreso de CUIDA es comisión de gestión, no beneficio: de ahí salen impuestos, seguros y administración.
              </p>
            )}
          </section>

          {/* --- La regla que se ha aplicado ----------------------------- */}
          {esGestor && (
            <section className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Regla aplicada</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Se cobra {NOMBRE_BASE[d.regla.baseCobro]} y se paga {NOMBRE_BASE[d.regla.baseLiquidacion]}
                {d.regla.redondeoMinutos > 0 && `, redondeando a ${d.regla.redondeoMinutos} min ${NOMBRE_REDONDEO[d.regla.redondeoModo]}`}
                {d.regla.minimoMinutos > 0 && `, con un mínimo de ${duracion(d.regla.minimoMinutos)}`}.
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Se cambia en Administración › Reglas de negocio.</p>
            </section>
          )}

          {/* --- Fichajes corregidos: el original no desaparece ---------- */}
          {d.correcciones.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <IconPencil className="h-3.5 w-3.5" aria-hidden /> Correcciones del fichaje
              </p>
              <ul className="space-y-1">
                {d.correcciones.map((c, i) => (
                  <li key={i} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">{c.campo === "horaInicioReal" ? "Entrada" : "Salida"}</span>{" "}
                    {c.valorAnterior ? hora(c.valorAnterior) : "sin fichar"} → {hora(c.valorNuevo)} · {c.motivo}
                    <span className="block text-[11px] text-slate-400">
                      {c.quien} · {new Date(c.cuando).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
