import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { SearchBox } from "../../components/SearchBox.js";
import { Modal } from "../../components/Modal.js";
import { exportarCSV } from "../../lib/csv.js";
import { duracion, euros } from "../../lib/economia.js";
import { FacturaDocumento, referenciaFactura } from "../../components/FacturaDocumento.js";
import { LiquidacionDocumento } from "../../components/LiquidacionDocumento.js";
import { IconAlert, IconCheck, IconDownload, IconEuro, IconFile, IconPlus } from "../../components/icons.js";
import type { Factura, Liquidacion, Persona, Remesa } from "../../lib/types.js";

type Vista = "cobrar" | "pagar" | "remesas";

const ESTADO_FACTURA: Record<string, { etiqueta: string; clase: string }> = {
  BORRADOR: { etiqueta: "Borrador", clase: "bg-slate-200 text-slate-700" },
  EMITIDA: { etiqueta: "Emitida", clase: "bg-blue-100 text-blue-700" },
  PAGADA: { etiqueta: "Cobrada", clase: "bg-brand-green-100 text-brand-green-700" },
  IMPAGADA: { etiqueta: "Impagada", clase: "bg-rose-100 text-rose-700" },
  ANULADA: { etiqueta: "Anulada", clase: "bg-slate-300 text-slate-600" },
};

const ESTADO_LIQUIDACION: Record<string, { etiqueta: string; clase: string }> = {
  BORRADOR: { etiqueta: "Borrador", clase: "bg-slate-200 text-slate-700" },
  APROBADA: { etiqueta: "Aprobada", clase: "bg-blue-100 text-blue-700" },
  PAGADA: { etiqueta: "Pagada", clase: "bg-brand-green-100 text-brand-green-700" },
};

function mesActualISO() {
  return new Date().toISOString().slice(0, 7);
}

function fechaCorta(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "—";
}

// Vencida y sin cobrar. Se calcula aquí y no en el servidor porque depende
// del día en que se mira, no de un estado guardado.
function estaVencida(f: Factura): boolean {
  if (f.estado !== "EMITIDA" || !f.fechaVencimiento) return false;
  return new Date(f.fechaVencimiento).getTime() < Date.now();
}

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: "verde" | "rojo" }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tono === "verde" ? "border-brand-green-200 bg-brand-green-50" : tono === "rojo" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
      <p className={`text-xs ${tono === "verde" ? "text-brand-green-700" : tono === "rojo" ? "text-rose-700" : "text-slate-500"}`}>{etiqueta}</p>
      <p className={`text-lg font-semibold ${tono === "verde" ? "text-brand-green-800" : tono === "rojo" ? "text-rose-800" : "text-slate-900"}`}>{valor}</p>
    </div>
  );
}

// El dinero de la empresa en un solo sitio: lo que entra de las familias, lo
// que sale hacia quien trabaja y los envíos al banco. Antes sólo existía una
// lista de facturas sin identidad fiscal y el pago a profesionales era un
// sí/no escondido en cada servicio.
interface PropsFacturacion {
  // La factura que se venía a gestionar desde la bandeja ("cobro vencido",
  // "recibo devuelto"), para abrirla sin buscarla en la lista del mes.
  focoFacturaId?: string | null;
  onFocoConsumido?: () => void;
}

export function FacturacionTab({ focoFacturaId, onFocoConsumido }: PropsFacturacion = {}) {
  const { token } = useAuth();
  const [vista, setVista] = useState<Vista>("cobrar");
  const [mes, setMes] = useState(mesActualISO());
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [remesas, setRemesas] = useState<Remesa[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [facturaAbierta, setFacturaAbierta] = useState<Factura | null>(null);
  const [liquidacionAbierta, setLiquidacionAbierta] = useState<Liquidacion | null>(null);
  const [rectificando, setRectificando] = useState<Factura | null>(null);
  const [motivoRectificacion, setMotivoRectificacion] = useState("");
  const [personaNueva, setPersonaNueva] = useState("");

  async function cargar() {
    const [f, l, r, p] = await Promise.all([
      api.get<Factura[]>("/facturas", token),
      api.get<Liquidacion[]>("/liquidaciones", token).catch(() => []),
      api.get<Remesa[]>("/cobros/remesas", token).catch(() => []),
      api.get<Persona[]>("/personas", token).catch(() => []),
    ]);
    setFacturas(f);
    setLiquidaciones(l);
    setRemesas(r);
    setPersonas(p);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // El foco llega antes que las facturas, así que se abre en cuanto la lista
  // la contiene.
  useEffect(() => {
    if (!focoFacturaId) return;
    const factura = facturas.find((f) => f.id === focoFacturaId);
    if (!factura) return;
    setVista("cobrar");
    setFacturaAbierta(factura);
    onFocoConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoFacturaId, facturas]);

  const [comprobando, setComprobando] = useState(false);

  async function comprobarCadena() {
    setComprobando(true);
    setError(null);
    try {
      const r = await api.get<{ total: number; correctos: number; rotos: Array<{ numSerieFactura: string; problema: string }> }>(
        "/facturas/registro/cadena",
        token,
      );
      if (r.total === 0) setAviso("Todavía no hay ninguna factura emitida, así que no hay cadena que comprobar.");
      else if (r.rotos.length === 0)
        setAviso(`Cadena correcta: ${r.correctos} de ${r.total} registros encadenan y sus huellas cuadran. Ninguna factura emitida se ha alterado.`);
      else setError(`La cadena no cuadra en ${r.rotos.length}: ${r.rotos.map((x) => `${x.numSerieFactura} (${x.problema.toLowerCase()})`).join("; ")}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido comprobar");
    } finally {
      setComprobando(false);
    }
  }

  // La ficha trae el QR de cotejo dibujado, que no viaja en el listado: se
  // pide al abrirla y, si falla, se enseña la factura igual sin el QR.
  async function abrirFactura(f: Factura) {
    setFacturaAbierta(f);
    try {
      const completa = await api.get<Factura>(`/facturas/${f.id}`, token);
      setFacturaAbierta(completa);
    } catch {
      /* se queda la versión del listado */
    }
  }

  async function accion(clave: string, fn: () => Promise<unknown>, exito?: string) {
    setOcupado(clave);
    setError(null);
    setAviso(null);
    try {
      await fn();
      await cargar();
      if (exito) setAviso(exito);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido completar");
    } finally {
      setOcupado(null);
    }
  }

  const q = busqueda.trim().toLowerCase();
  const facturasVisibles = useMemo(
    () =>
      facturas.filter((f) =>
        !q
          ? true
          : [f.codigo, referenciaFactura(f), `${f.persona.nombre} ${f.persona.apellidos}`, f.titularNombre ?? "", f.mes]
              .join(" ")
              .toLowerCase()
              .includes(q),
      ),
    [facturas, q],
  );
  const liquidacionesVisibles = useMemo(
    () =>
      liquidaciones.filter((l) =>
        !q ? true : [l.codigo, `${l.profesional.nombre} ${l.profesional.apellidos}`, l.mes].join(" ").toLowerCase().includes(q),
      ),
    [liquidaciones, q],
  );

  const totales = useMemo(() => {
    const pendiente = facturas.filter((f) => ["EMITIDA", "IMPAGADA"].includes(f.estado));
    return {
      borradores: facturas.filter((f) => f.estado === "BORRADOR").length,
      porCobrar: pendiente.reduce((a, f) => a + Number(f.totalConIva), 0),
      vencidas: facturas.filter(estaVencida),
      impagadas: facturas.filter((f) => f.estado === "IMPAGADA"),
      cobrado: facturas.filter((f) => f.estado === "PAGADA").reduce((a, f) => a + Number(f.totalConIva), 0),
      comision: facturas.filter((f) => f.estado !== "BORRADOR").reduce((a, f) => a + Number(f.comisionTotal), 0),
      porPagar: liquidaciones.filter((l) => l.estado !== "PAGADA").reduce((a, l) => a + Number(l.neto), 0),
      pagado: liquidaciones.filter((l) => l.estado === "PAGADA").reduce((a, l) => a + Number(l.neto), 0),
    };
  }, [facturas, liquidaciones]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["cobrar", "A cobrar", facturas.length],
          ["pagar", "A pagar", liquidaciones.length],
          ["remesas", "Remesas", remesas.length],
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

      {/* ------------------------------------------------------------ COBRAR */}
      {vista === "cobrar" && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Cifra etiqueta="Por cobrar" valor={euros(totales.porCobrar)} />
            <Cifra etiqueta="Cobrado" valor={euros(totales.cobrado)} tono="verde" />
            <Cifra etiqueta="Comisión de CUIDA" valor={euros(totales.comision)} />
            <Cifra
              etiqueta={totales.impagadas.length > 0 ? "Impagadas" : "Vencidas sin cobrar"}
              valor={String(totales.impagadas.length > 0 ? totales.impagadas.length : totales.vencidas.length)}
              tono={totales.impagadas.length + totales.vencidas.length > 0 ? "rojo" : undefined}
            />
          </div>

          <div className="flex flex-wrap items-end gap-2 tarjeta p-3">
            <label className="text-xs text-slate-500">
              Mes
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="min-w-[12rem] flex-1 text-xs text-slate-500">
              Persona
              <select value={personaNueva} onChange={(e) => setPersonaNueva(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">Elige a quién facturar…</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.apellidos}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                accion("generar", () => api.post("/facturas/generar", { personaId: personaNueva, mes }, token), "Factura creada en borrador")
              }
              disabled={!personaNueva || ocupado === "generar"}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              <IconPlus className="h-3.5 w-3.5" />
              {ocupado === "generar" ? "Creando…" : "Crear factura del mes"}
            </button>
            {facturasVisibles.length > 0 && (
              <button
                onClick={() =>
                  exportarCSV(
                    facturasVisibles,
                    [
                      { encabezado: "Referencia", valor: (f) => referenciaFactura(f) },
                      { encabezado: "Código", valor: (f) => f.codigo },
                      { encabezado: "Cliente", valor: (f) => f.titularNombre ?? `${f.persona.nombre} ${f.persona.apellidos}` },
                      { encabezado: "NIF", valor: (f) => f.titularNif ?? "" },
                      { encabezado: "Periodo", valor: (f) => f.mes },
                      { encabezado: "Emitida", valor: (f) => fechaCorta(f.fechaEmision) },
                      { encabezado: "Vence", valor: (f) => fechaCorta(f.fechaVencimiento) },
                      { encabezado: "Base", valor: (f) => Number(f.importeTotal).toFixed(2) },
                      { encabezado: "IVA", valor: (f) => Number(f.ivaTotal).toFixed(2) },
                      { encabezado: "Total", valor: (f) => Number(f.totalConIva).toFixed(2) },
                      { encabezado: "Estado", valor: (f) => ESTADO_FACTURA[f.estado]?.etiqueta ?? f.estado },
                    ],
                    "facturas",
                  )
                }
                className="text-xs font-medium text-brand hover:text-brand-800"
              >
                Exportar CSV ({facturasVisibles.length})
              </button>
            )}
              {/* La cadena de registros del RD 1007/2023. Es la respuesta a
                  "¿cómo sé que nadie ha tocado esto?": se recalculan todas las
                  huellas y se dice si alguna no cuadra. */}
              <button onClick={comprobarCadena} disabled={comprobando} className="text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700 disabled:opacity-50">
                {comprobando ? "Comprobando…" : "Comprobar la cadena de facturas"}
              </button>
          </div>

          {facturasVisibles.length === 0 ? (
            <p className="tarjeta px-4 py-8 text-center text-sm text-slate-400">
              Todavía no hay ninguna factura.
            </p>
          ) : (
            <ul className="space-y-2">
              {facturasVisibles.map((f) => {
                const info = ESTADO_FACTURA[f.estado] ?? { etiqueta: f.estado, clase: "bg-slate-200 text-slate-700" };
                const vencida = estaVencida(f);
                return (
                  <li key={f.id} className={`rounded-lg border bg-white p-3 ${vencida || f.estado === "IMPAGADA" ? "border-rose-200" : "border-slate-200"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button onClick={() => abrirFactura(f)} className="min-w-0 flex-1 text-left">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 hover:underline">
                          {referenciaFactura(f)}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${info.clase}`}>{info.etiqueta}</span>
                          {f.tipo === "RECTIFICATIVA" && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Rectificativa</span>
                          )}
                          {vencida && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">Vencida</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {f.titularNombre ?? `${f.persona.nombre} ${f.persona.apellidos}`} · {f.mes}
                          {f.fechaVencimiento && ` · vence ${fechaCorta(f.fechaVencimiento)}`}
                          {f.remesaId && " · en remesa"}
                        </p>
                        {f.motivoImpago && <p className="mt-0.5 text-xs text-rose-600">Devuelta: {f.motivoImpago}</p>}
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <p className="text-base font-semibold tabular-nums text-slate-900">{euros(f.totalConIva)}</p>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {f.estado === "BORRADOR" && (
                            <button
                              onClick={() => accion(f.id, () => api.post(`/facturas/${f.id}/emitir`, {}, token), "Factura emitida")}
                              disabled={ocupado === f.id}
                              className="rounded-xl bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                            >
                              {ocupado === f.id ? "…" : "Emitir"}
                            </button>
                          )}
                          {["EMITIDA", "IMPAGADA"].includes(f.estado) && (
                            <>
                              <button
                                onClick={() => accion(f.id, () => api.post(`/facturas/${f.id}/cobrar`, {}, token), "Factura cobrada")}
                                disabled={ocupado === f.id}
                                className="flex items-center gap-1 rounded-md bg-brand-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-green-700 disabled:opacity-50"
                              >
                                <IconCheck className="h-3.5 w-3.5" /> Cobrada
                              </button>
                              {f.estado === "EMITIDA" && (
                                <button
                                  onClick={() => {
                                    const motivo = window.prompt("¿Por qué se ha devuelto el recibo?");
                                    if (motivo) accion(f.id, () => api.post(`/facturas/${f.id}/impago`, { motivo }, token), "Marcada como impagada");
                                  }}
                                  className="flex items-center gap-1 rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                                >
                                  <IconAlert className="h-3.5 w-3.5" /> Devuelta
                                </button>
                              )}
                            </>
                          )}
                          {f.estado !== "BORRADOR" && f.tipo === "ORDINARIA" && (
                            <button
                              onClick={() => {
                                setRectificando(f);
                                setMotivoRectificacion("");
                              }}
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Rectificar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ------------------------------------------------------------- PAGAR */}
      {vista === "pagar" && (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Cifra etiqueta="Por pagar" valor={euros(totales.porPagar)} tono={totales.porPagar > 0 ? "rojo" : undefined} />
            <Cifra etiqueta="Pagado" valor={euros(totales.pagado)} tono="verde" />
            <Cifra etiqueta="En nómina" valor={String(liquidaciones.filter((l) => l.tipoRelacion === "LABORAL").length)} />
            <Cifra etiqueta="Autónomas" valor={String(liquidaciones.filter((l) => l.tipoRelacion === "AUTONOMO").length)} />
          </div>

          <div className="flex flex-wrap items-end gap-2 tarjeta p-3">
            <label className="text-xs text-slate-500">
              Mes
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button
              onClick={() => accion("liq", () => api.post("/liquidaciones/generar", { mes }, token), "Liquidaciones calculadas")}
              disabled={ocupado === "liq"}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              <IconEuro className="h-3.5 w-3.5" />
              {ocupado === "liq" ? "Calculando…" : "Calcular el mes"}
            </button>
            <p className="text-xs text-slate-400">Sólo entran las jornadas verificadas.</p>
            {liquidacionesVisibles.length > 0 && (
              <button
                onClick={() =>
                  exportarCSV(
                    liquidacionesVisibles,
                    [
                      { encabezado: "Liquidación", valor: (l) => l.codigo },
                      { encabezado: "Mes", valor: (l) => l.mes },
                      { encabezado: "Profesional", valor: (l) => `${l.profesional.nombre} ${l.profesional.apellidos}` },
                      { encabezado: "DNI", valor: (l) => l.profesional.dni ?? "" },
                      { encabezado: "Cuenta", valor: (l) => l.profesional.numeroCuenta ?? "" },
                      { encabezado: "Relación", valor: (l) => (l.tipoRelacion === "LABORAL" ? "Laboral" : "Autónoma") },
                      { encabezado: "Horas", valor: (l) => (l.minutos / 60).toFixed(2) },
                      { encabezado: "Bruto", valor: (l) => Number(l.bruto).toFixed(2) },
                      { encabezado: "IRPF %", valor: (l) => Number(l.irpfPorcentaje).toFixed(2) },
                      { encabezado: "IRPF", valor: (l) => Number(l.irpfImporte).toFixed(2) },
                      { encabezado: "Neto", valor: (l) => Number(l.neto).toFixed(2) },
                      { encabezado: "Estado", valor: (l) => ESTADO_LIQUIDACION[l.estado]?.etiqueta ?? l.estado },
                    ],
                    "liquidaciones",
                  )
                }
                className="ml-auto flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-800"
              >
                <IconDownload className="h-3.5 w-3.5" /> Exportar para la gestoría
              </button>
            )}
          </div>

          {liquidacionesVisibles.length === 0 ? (
            <p className="tarjeta px-4 py-8 text-center text-sm text-slate-400">
              Todavía no hay liquidaciones. Elige un mes y pulsa «Calcular el mes».
            </p>
          ) : (
            <ul className="space-y-2">
              {liquidacionesVisibles.map((l) => {
                const info = ESTADO_LIQUIDACION[l.estado] ?? { etiqueta: l.estado, clase: "bg-slate-200 text-slate-700" };
                return (
                  <li key={l.id} className="tarjeta p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button onClick={() => setLiquidacionAbierta(l)} className="min-w-0 flex-1 text-left">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 hover:underline">
                          {l.profesional.nombre} {l.profesional.apellidos}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${info.clase}`}>{info.etiqueta}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {l.tipoRelacion === "LABORAL" ? "En nómina" : "Autónoma"}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {l.codigo} · {l.mes} · {duracion(l.minutos)} en {l.lineas.length} jornada{l.lineas.length === 1 ? "" : "s"}
                          {Number(l.irpfImporte) > 0 && ` · IRPF ${Number(l.irpfPorcentaje)}% (−${euros(l.irpfImporte)})`}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <p className="text-base font-semibold tabular-nums text-slate-900">{euros(l.neto)}</p>
                        <div className="flex gap-1.5">
                          {l.estado === "BORRADOR" && (
                            <button
                              onClick={() => accion(l.id, () => api.post(`/liquidaciones/${l.id}/aprobar`, {}, token), "Liquidación aprobada")}
                              disabled={ocupado === l.id}
                              className="rounded-xl bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                            >
                              {ocupado === l.id ? "…" : "Aprobar"}
                            </button>
                          )}
                          {l.estado === "APROBADA" && (
                            <button
                              onClick={() => accion(l.id, () => api.post(`/liquidaciones/${l.id}/pagar`, {}, token), "Liquidación pagada")}
                              disabled={ocupado === l.id}
                              className="flex items-center gap-1 rounded-md bg-brand-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-green-700 disabled:opacity-50"
                            >
                              <IconCheck className="h-3.5 w-3.5" /> Pagada
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ----------------------------------------------------------- REMESAS */}
      {vista === "remesas" && (
        <>
          <div className="flex flex-wrap items-end gap-2 tarjeta p-3">
            <label className="text-xs text-slate-500">
              Mes
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button
              onClick={() => accion("rem", () => api.post("/cobros/remesas", { mes }, token), "Remesa generada")}
              disabled={ocupado === "rem"}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              <IconFile className="h-3.5 w-3.5" />
              {ocupado === "rem" ? "Generando…" : "Generar remesa del mes"}
            </button>
            <p className="text-xs text-slate-400">Agrupa las facturas emitidas que se cobran por domiciliación.</p>
          </div>

          {remesas.length === 0 ? (
            <p className="tarjeta px-4 py-8 text-center text-sm text-slate-400">
              Todavía no has generado ninguna remesa.
            </p>
          ) : (
            <ul className="space-y-2">
              {remesas.map((r) => (
                <li key={r.id} className="tarjeta p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {r.codigo} · {r.mes}
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{r.estado.toLowerCase()}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Cargo el {fechaCorta(r.fechaCargo)} · {r.facturas.length} recibo{r.facturas.length === 1 ? "" : "s"}
                      </p>
                      <ul className="mt-1 text-xs text-slate-400">
                        {r.facturas.slice(0, 4).map((f) => (
                          <li key={f.id}>
                            {f.persona.nombre} {f.persona.apellidos} · {euros(f.totalConIva)}
                          </li>
                        ))}
                        {r.facturas.length > 4 && <li>y {r.facturas.length - 4} más</li>}
                      </ul>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <p className="text-base font-semibold tabular-nums text-slate-900">
                        {euros(r.facturas.reduce((a, f) => a + Number(f.totalConIva), 0))}
                      </p>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <a
                          href={`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/cobros/remesas/${r.id}/fichero`}
                          onClick={async (e) => {
                            // El enlace directo no lleva el token, así que se
                            // descarga con fetch y se entrega como archivo.
                            e.preventDefault();
                            const res = await fetch(e.currentTarget.href, { headers: { Authorization: `Bearer ${token}` } });
                            const texto = await res.text();
                            const url = URL.createObjectURL(new Blob([texto], { type: "application/xml" }));
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${r.codigo}.xml`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <IconDownload className="h-3.5 w-3.5" /> Fichero para el banco
                        </a>
                        {r.estado !== "COBRADA" && (
                          <button
                            onClick={() => accion(r.id, () => api.post(`/cobros/remesas/${r.id}/estado`, { estado: "COBRADA" }, token), "Remesa cobrada")}
                            disabled={ocupado === r.id}
                            className="rounded-md bg-brand-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-green-700 disabled:opacity-50"
                          >
                            Dar por cobrada
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {facturaAbierta && (
        <Modal title={referenciaFactura(facturaAbierta)} onClose={() => setFacturaAbierta(null)} size="doc">
          <div className="mb-3 flex justify-end print:hidden">
            <button onClick={() => window.print()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Imprimir o guardar en PDF
            </button>
          </div>
          <FacturaDocumento factura={facturaAbierta} />
        </Modal>
      )}

      {liquidacionAbierta && (
        <Modal title={`${liquidacionAbierta.codigo} · ${liquidacionAbierta.mes}`} onClose={() => setLiquidacionAbierta(null)} size="doc">
          <div className="mb-3 flex justify-end print:hidden">
            <button onClick={() => window.print()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Imprimir o guardar en PDF
            </button>
          </div>
          <LiquidacionDocumento liquidacion={liquidacionAbierta} />
        </Modal>
      )}

      {rectificando && (
        <Modal title={`Rectificar ${referenciaFactura(rectificando)}`} onClose={() => setRectificando(null)}>
          <p className="mb-3 text-sm text-slate-600">
            La factura original no se toca: se emite otra que la referencia y la compensa. Es lo que hace que el número de
            una factura ya entregada signifique siempre lo mismo.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Motivo
            <input
              type="text"
              autoFocus
              value={motivoRectificacion}
              onChange={(e) => setMotivoRectificacion(e.target.value)}
              placeholder="Se facturaron horas que no se hicieron"
              className="mt-1 w-full campo font-normal normal-case"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setRectificando(null)} className="campo py-2 text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              onClick={() => {
                const f = rectificando;
                setRectificando(null);
                accion(f.id, () => api.post(`/facturas/${f.id}/rectificar`, { motivo: motivoRectificacion }, token), "Rectificativa emitida");
              }}
              disabled={!motivoRectificacion.trim()}
              className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Emitir rectificativa
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
