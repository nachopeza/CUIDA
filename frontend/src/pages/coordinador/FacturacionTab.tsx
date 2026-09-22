import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api, ApiError } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { SearchBox } from "../../components/SearchBox.js";
import { useOrdenacion } from "../../lib/useOrdenacion.js";
import { useSeleccion } from "../../lib/useSeleccion.js";
import { exportarCSV } from "../../lib/csv.js";
import type { Factura, Persona, Visita } from "../../lib/types.js";

const SIGUIENTE_FACTURA: Record<string, string> = { BORRADOR: "EMITIDA", EMITIDA: "PAGADA" };
// "Se debe generar una nota de pago para luego emitir la factura": el
// BORRADOR es esa nota de pago — un cálculo ya hecho pero todavía no
// formalizado — así que se etiqueta distinto aunque el estado interno sea
// el mismo.
const ETIQUETA_ESTADO_FACTURA: Record<string, string> = { BORRADOR: "Nota de pago", EMITIDA: "Factura emitida", PAGADA: "Pagada" };
const ETIQUETA_ACCION_FACTURA: Record<string, string> = { BORRADOR: "Emitir factura", EMITIDA: "Marcar pagada" };

function mesActualISO() {
  return new Date().toISOString().slice(0, 7);
}

function horasDeVisita(v: Visita): number {
  if (!v.horaInicioReal || !v.horaFinReal) return 0;
  return (new Date(v.horaFinReal).getTime() - new Date(v.horaInicioReal).getTime()) / 3600000;
}

// Las visitas de un servicio recurrente se facturan por horas y se agrupan
// en una sola línea por servicio (sección "basar el sistema de facturación
// en el tiempo... lo que vale es el tiempo que pasan los profesionales con
// los usuarios"): mismo cálculo que hace el backend al generar la factura.
function lineasPorHoras(visitas: Visita[]) {
  const grupos = new Map<string, { concepto: string; profesional: string; horas: number; precioHora: number; ivaPct: number }>();
  for (const v of visitas) {
    const servicioId = v.servicio?.id ?? v.id;
    const actual = grupos.get(servicioId) ?? {
      concepto: v.servicio?.solicitud.necesidad.nombre ?? "Servicio recurrente",
      profesional: v.profesional ? `${v.profesional.nombre} ${v.profesional.apellidos}` : "—",
      horas: 0,
      precioHora: Number(v.servicio?.tarifaImporte ?? 0),
      ivaPct: Number(v.servicio?.ivaPorcentaje ?? 0),
    };
    actual.horas += horasDeVisita(v);
    grupos.set(servicioId, actual);
  }
  return Array.from(grupos.entries()).map(([servicioId, g]) => {
    const base = Math.round(g.horas * g.precioHora * 100) / 100;
    const iva = Math.round(base * (g.ivaPct / 100) * 100) / 100;
    return { servicioId, ...g, base, iva, total: Math.round((base + iva) * 100) / 100 };
  });
}

// Facturación mensual (sección "función es cobrar por gestión un pequeño
// porcentaje... cuenta mensual con los servicios solicitados... al final de
// mes se le cobrará el importe. Ese importe se dividirá y se entregará a
// los profesionales o empresas colaboradoras").
export function FacturacionTab() {
  const { token } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [personaId, setPersonaId] = useState("");
  const [mes, setMes] = useState(mesActualISO());
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  async function cargar() {
    const [pers, facs] = await Promise.all([
      api.get<Persona[]>("/personas", token),
      api.get<Factura[]>("/facturas", token),
    ]);
    setPersonas(pers);
    setFacturas(facs);
    if (!personaId && pers[0]) setPersonaId(pers[0].id);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGenerando(true);
    try {
      await api.post("/facturas/generar", { personaId, mes }, token);
      await cargar();
    } catch (err) {
      // El backend explica el motivo concreto (no hay nada que facturar, ya
      // existe la factura de ese mes...): se muestra tal cual en vez de un
      // mensaje genérico que no dice qué ha pasado.
      setError(err instanceof ApiError ? err.message.replace(/^"|"$/g, "") : "Error al generar la factura.");
    } finally {
      setGenerando(false);
    }
  }

  async function avanzarEstado(factura: Factura) {
    const siguiente = SIGUIENTE_FACTURA[factura.estado];
    if (!siguiente) return;
    await api.post(`/facturas/${factura.id}/estado`, { estado: siguiente }, token);
    await cargar();
  }

  const facturasFiltradas = facturas.filter((f) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${f.persona.nombre} ${f.persona.apellidos} ${f.codigo} ${f.mes}`.toLowerCase().includes(q);
  });
  const ordenFacturas = useOrdenacion(
    facturasFiltradas,
    {
      mes: (f) => f.mes,
      persona: (f) => `${f.persona.apellidos} ${f.persona.nombre}`,
      total: (f) => Number(f.totalConIva ?? f.importeTotal),
      estado: (f) => f.estado,
      codigo: (f) => f.codigo,
    },
    "mes",
  );
  const seleccionFacturas = useSeleccion(facturasFiltradas);

  function exportarFacturas() {
    const filas = seleccionFacturas.seleccionadas.length > 0 ? seleccionFacturas.seleccionadas : facturasFiltradas;
    exportarCSV(
      filas,
      [
        { encabezado: "Código", valor: (f) => f.codigo },
        { encabezado: "Persona", valor: (f) => `${f.persona.nombre} ${f.persona.apellidos}` },
        { encabezado: "Mes", valor: (f) => f.mes },
        { encabezado: "Base imponible", valor: (f) => Number(f.importeTotal) },
        { encabezado: "IVA", valor: (f) => Number(f.ivaTotal ?? 0) },
        { encabezado: "Total", valor: (f) => Number(f.totalConIva ?? f.importeTotal) },
        { encabezado: "Comisión CUIDA", valor: (f) => Number(f.comisionTotal) },
        { encabezado: "A profesionales", valor: (f) => Number(f.importeProfesionales) },
        { encabezado: "Estado", valor: (f) => f.estado },
      ],
      "facturas",
    );
  }

  return (
    <div>
      <Card title="Generar factura mensual">
        <form onSubmit={generar} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellidos}
              </option>
            ))}
          </select>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" disabled={generando || !personaId} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">
            {generando ? "Generando…" : "Generar factura"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <p className="mt-2 text-xs text-slate-400">
          Agrupa los servicios pagados, cerrados o validados de esa persona en ese mes que todavía no estén facturados.
        </p>
      </Card>

      <Card title="Facturas">
        {facturas.length === 0 && <p className="text-sm text-slate-500">Todavía no se ha generado ninguna factura.</p>}
        {facturas.length > 0 && (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por persona, código o mes…" className="flex-1 sm:max-w-xs" />
              <select
                value={ordenFacturas.campo ?? ""}
                onChange={(e) => e.target.value && ordenFacturas.ordenarPor(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-2 text-xs"
              >
                <option value="mes">Ordenar por mes</option>
                <option value="persona">Persona</option>
                <option value="total">Importe total</option>
                <option value="estado">Estado</option>
                <option value="codigo">Código</option>
              </select>
            </div>
            <ExportarBarra
              total={facturasFiltradas.length}
              seleccionadas={seleccionFacturas.seleccionadas.length}
              onExportar={exportarFacturas}
              onSeleccionarTodo={seleccionFacturas.seleccionarTodo}
              onLimpiarSeleccion={seleccionFacturas.limpiar}
            />
          </>
        )}
        <ul className="divide-y divide-slate-100">
          {ordenFacturas.ordenadas.map((f) => (
            <li key={f.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={seleccionFacturas.ids.has(f.id)}
                    onChange={() => seleccionFacturas.toggle(f.id)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium">
                      {f.persona.nombre} {f.persona.apellidos} · {f.mes}
                    </p>
                    <p className="text-xs text-slate-400">
                      {f.codigo} · {f.servicios.length} servicio(s)
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    f.estado === "BORRADOR" ? "bg-amber-100 text-amber-700" : f.estado === "EMITIDA" ? "bg-blue-100 text-blue-700" : "bg-brand-green-100 text-brand-green-700"
                  }`}
                >
                  {ETIQUETA_ESTADO_FACTURA[f.estado] ?? f.estado}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-1 text-xs text-slate-600">
                <span>
                  Base imponible: <strong>{Number(f.importeTotal).toFixed(2)} €</strong>
                </span>
                <span>
                  + IVA: <strong>{Number(f.ivaTotal ?? 0).toFixed(2)} €</strong>
                </span>
                <span>
                  = Total: <strong>{Number(f.totalConIva ?? f.importeTotal).toFixed(2)} €</strong>
                </span>
                <span className="text-slate-400">Comisión CUIDA: {Number(f.comisionTotal).toFixed(2)} €</span>
                <span className="text-slate-400">A profesionales/empresas: {Number(f.importeProfesionales).toFixed(2)} €</span>
                <button
                  onClick={() => setDetalleAbierto(detalleAbierto === f.id ? null : f.id)}
                  className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100"
                >
                  {detalleAbierto === f.id ? "Ocultar detalle" : "Ver detalle"}
                </button>
                {SIGUIENTE_FACTURA[f.estado] && (
                  <button onClick={() => avanzarEstado(f)} className="ml-auto rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100">
                    {ETIQUETA_ACCION_FACTURA[f.estado]}
                  </button>
                )}
              </div>

              {/* Factura itemizada por línea de servicio (sección "acceder
                  a la factura y ver la información completa... por ítems
                  datos servicios coste etc."): un desglose legible, no solo
                  el total agregado. */}
              {detalleAbierto === f.id && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Concepto</th>
                        <th className="px-3 py-2">Profesional</th>
                        <th className="px-3 py-2">Base</th>
                        <th className="px-3 py-2">IVA</th>
                        <th className="px-3 py-2">Total línea</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {f.servicios.map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2">
                            {s.solicitud?.necesidad.nombre ?? "—"} <span className="text-slate-400">· {s.codigo}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{s.profesional ? `${s.profesional.nombre} ${s.profesional.apellidos}` : "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{s.tarifaImporte != null ? `${Number(s.tarifaImporte).toFixed(2)} €` : "—"}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {s.ivaPorcentaje != null ? `${Number(s.ivaPorcentaje)}% (${Number(s.ivaImporte ?? 0).toFixed(2)} €)` : "—"}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800">{s.totalConIva != null ? `${Number(s.totalConIva).toFixed(2)} €` : "—"}</td>
                        </tr>
                      ))}
                      {lineasPorHoras(f.visitas ?? []).map((l) => (
                        <tr key={l.servicioId}>
                          <td className="px-3 py-2">
                            {l.concepto}{" "}
                            <span className="text-slate-400">
                              · {l.horas.toFixed(2)} h × {l.precioHora.toFixed(2)} €/h
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{l.profesional}</td>
                          <td className="px-3 py-2 text-slate-600">{l.base.toFixed(2)} €</td>
                          <td className="px-3 py-2 text-slate-600">
                            {l.ivaPct}% ({l.iva.toFixed(2)} €)
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800">{l.total.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50 font-medium text-slate-700">
                      <tr>
                        <td className="px-3 py-2" colSpan={2}>
                          Totales
                        </td>
                        <td className="px-3 py-2">{Number(f.importeTotal).toFixed(2)} €</td>
                        <td className="px-3 py-2">{Number(f.ivaTotal ?? 0).toFixed(2)} €</td>
                        <td className="px-3 py-2">{Number(f.totalConIva ?? f.importeTotal).toFixed(2)} €</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
