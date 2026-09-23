import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { exportarCSV } from "../../lib/csv.js";
import { AYUDA_TIEMPO, duracion, euros } from "../../lib/tiempo.js";
import { IconAlert, IconClock, IconDownload, IconEuro, IconPencil, IconUsers } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Análisis
//
// Las cuatro cifras de tiempo de CUIDA, agregadas. Todas salen de las mismas
// jornadas que la factura y la liquidación, así que cualquier número de aquí
// se puede perseguir hasta una jornada concreta y su desglose.
//
// Las horas se comparan en una sola escala porque son la misma unidad: poner
// dos ejes distintos en un gráfico es la forma más rápida de mentir con él.
// ---------------------------------------------------------------------------

interface Acumulado {
  jornadas: number;
  minutosProgramados: number;
  minutosReales: number;
  minutosFacturables: number;
  minutosLiquidables: number;
  importeCliente: number;
  importeProfesional: number;
  importeCuida: number;
}

interface Analisis {
  desde: string;
  hasta: string;
  total: Acumulado;
  meses: (Acumulado & { mes: string })[];
  porPersona: (Acumulado & { id: string; nombre: string })[];
  porProfesional: (Acumulado & { id: string; nombre: string; retrasoMedio: number; jornadasConRetraso: number })[];
  porNecesidad: (Acumulado & { id: string; nombre: string; codigo: string })[];
  desviaciones: {
    conRetraso: number;
    minutosRetrasoTotal: number;
    conExceso: number;
    minutosExcesoTotal: number;
    conDefecto: number;
    extraPendiente: number;
    extraAprobado: number;
    extraRechazado: number;
    cierresManuales: number;
    canceladas: number;
    noPresentados: number;
    correcciones: number;
  };
}

function nombreMes(mes: string, largo = false): string {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString("es-ES", largo ? { month: "long", year: "numeric" } : { month: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Una cifra grande con su explicación. Sin gráfico: para un solo número, un
// número es más legible que cualquier dibujo.
function Cifra({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono: "cobro" | "pago" | "cuida" | "neutro" }) {
  const colores = {
    cobro: "border-blue-200 bg-blue-50 text-blue-900",
    pago: "border-brand-green-200 bg-brand-green-50 text-brand-green-900",
    cuida: "border-slate-200 bg-slate-50 text-slate-800",
    neutro: "border-slate-200 bg-white text-slate-800",
  }[tono];
  return (
    <div className={`rounded-xl border px-4 py-3 ${colores}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{etiqueta}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-xs opacity-70">{nota}</p>}
    </div>
  );
}

// Barra horizontal con su valor escrito al lado. Un mismo tono para todas:
// son cuatro medidas de lo mismo, no cuatro categorías, así que darles cuatro
// colores sugeriría una diferencia que no existe.
function Barra({ etiqueta, minutos, maximo, ayuda, destacada }: { etiqueta: string; minutos: number; maximo: number; ayuda?: string; destacada?: boolean }) {
  const pct = maximo > 0 ? Math.round((minutos / maximo) * 100) : 0;
  return (
    <div className="flex items-center gap-3" title={ayuda}>
      <p className="w-24 shrink-0 text-xs text-slate-500">{etiqueta}</p>
      <div className="h-3 min-w-0 flex-1 rounded-full bg-slate-100">
        <div
          className={`h-3 rounded-full ${destacada ? "bg-brand" : "bg-brand-green-400"}`}
          style={{ width: `${Math.max(pct, minutos > 0 ? 2 : 0)}%` }}
        />
      </div>
      <p className="w-24 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">{duracion(minutos)}</p>
    </div>
  );
}

function FilaRanking({ nombre, jornadas, minutos, importe, maximo, extra }: { nombre: string; jornadas: number; minutos: number; importe: string; maximo: number; extra?: string }) {
  const pct = maximo > 0 ? Math.round((minutos / maximo) * 100) : 0;
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-slate-700">{nombre}</span>
        <span className="shrink-0 tabular-nums text-slate-600">{importe}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-slate-100">
          <div className="h-1.5 rounded-full bg-brand-green-400" style={{ width: `${Math.max(pct, minutos > 0 ? 2 : 0)}%` }} />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
          {jornadas} {jornadas === 1 ? "jornada" : "jornadas"} · {duracion(minutos)}
          {extra ? ` · ${extra}` : ""}
        </span>
      </div>
    </li>
  );
}

function Aviso({ n, texto, tono }: { n: number; texto: string; tono: "rojo" | "naranja" | "gris" }) {
  if (n === 0) return null;
  const colores = { rojo: "text-rose-700 bg-rose-50", naranja: "text-orange-700 bg-orange-50", gris: "text-slate-600 bg-slate-50" }[tono];
  return (
    <li className={`flex items-baseline gap-2 rounded-md px-2.5 py-1.5 text-xs ${colores}`}>
      <strong className="tabular-nums">{n}</strong>
      <span>{texto}</span>
    </li>
  );
}

export function AnalisisTab() {
  const { token } = useAuth();
  const [d, setD] = useState<Analisis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const [desde, setDesde] = useState(() => {
    const a = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
    return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`;
  });
  const [hasta, setHasta] = useState(mesActual);

  useEffect(() => {
    setError(null);
    api
      .get<Analisis>(`/analisis?desde=${desde}&hasta=${hasta}`, token)
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cargar"));
  }, [desde, hasta, token]);

  const maxHoras = useMemo(() => {
    if (!d) return 0;
    return Math.max(d.total.minutosProgramados, d.total.minutosReales, d.total.minutosFacturables, d.total.minutosLiquidables);
  }, [d]);
  const maxMes = useMemo(() => (d ? Math.max(1, ...d.meses.map((m) => m.minutosFacturables)) : 1), [d]);

  if (error) return <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  if (!d) return <p className="text-sm text-slate-500">Cargando…</p>;

  const sinDatos = d.total.jornadas === 0;
  const dif = d.total.minutosReales - d.total.minutosProgramados;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Análisis</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            Las mismas cifras que la factura y la liquidación, sumadas. Cualquier número de aquí se puede seguir hasta una jornada
            concreta y su desglose.
          </p>
        </div>
        {/* Los dos selectores de mes y el CSV se envuelven en móvil: sin
            flex-wrap y sin poder encogerse, la fila desbordaba la pantalla. */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-slate-500 sm:flex-none">
            Desde
            <input type="month" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-0.5 block w-full min-w-0 max-w-[10rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="min-w-0 flex-1 text-xs text-slate-500 sm:flex-none">
            Hasta
            <input type="month" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="mt-0.5 block w-full min-w-0 max-w-[10rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <button
            onClick={() =>
              exportarCSV(
                d.meses,
                [
                  { encabezado: "Mes", valor: (m) => m.mes },
                  { encabezado: "Jornadas", valor: (m) => m.jornadas },
                  { encabezado: "Minutos acordados", valor: (m) => m.minutosProgramados },
                  { encabezado: "Minutos fichados", valor: (m) => m.minutosReales },
                  { encabezado: "Minutos facturados", valor: (m) => m.minutosFacturables },
                  { encabezado: "Minutos liquidados", valor: (m) => m.minutosLiquidables },
                  { encabezado: "Cobrado a familias", valor: (m) => m.importeCliente },
                  { encabezado: "Pagado a profesionales", valor: (m) => m.importeProfesional },
                  { encabezado: "Ingreso de CUIDA", valor: (m) => m.importeCuida },
                ],
                `cuida-analisis-${desde}-${hasta}.csv`,
              )
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <IconDownload className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
            CSV
          </button>
        </div>
      </header>

      {sinDatos ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          No hay jornadas cerradas en ese periodo. Las cifras aparecen cuando se cierra la primera.
        </p>
      ) : (
        <>
          {/* --- El dinero del periodo --------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra etiqueta="Cobrado a las familias" valor={euros(d.total.importeCliente)} nota={`${d.total.jornadas} jornadas`} tono="cobro" />
            <Cifra etiqueta="Pagado a profesionales" valor={euros(d.total.importeProfesional)} nota={duracion(d.total.minutosLiquidables)} tono="pago" />
            <Cifra
              etiqueta="Ingreso de CUIDA"
              valor={euros(d.total.importeCuida)}
              nota={
                d.total.importeCliente > 0
                  ? `${Math.round((d.total.importeCuida / d.total.importeCliente) * 100)} % de lo cobrado · comisión de gestión, no beneficio`
                  : "comisión de gestión, no beneficio"
              }
              tono="cuida"
            />
          </div>

          {/* --- Los cuatro tiempos ------------------------------------ */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconClock className="h-4 w-4 text-slate-400" aria-hidden /> Horas del periodo
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Lo que se acordó, lo que se trabajó, lo que se cobró y lo que se pagó. La misma escala para los cuatro, porque son
              la misma unidad.
            </p>
            <div className="mt-3 space-y-2">
              <Barra etiqueta="Acordado" minutos={d.total.minutosProgramados} maximo={maxHoras} ayuda={AYUDA_TIEMPO.programados} />
              <Barra etiqueta="Fichado" minutos={d.total.minutosReales} maximo={maxHoras} ayuda={AYUDA_TIEMPO.reales} />
              <Barra etiqueta="Se cobró" minutos={d.total.minutosFacturables} maximo={maxHoras} ayuda={AYUDA_TIEMPO.facturables} destacada />
              <Barra etiqueta="Se pagó" minutos={d.total.minutosLiquidables} maximo={maxHoras} ayuda={AYUDA_TIEMPO.liquidables} destacada />
            </div>
            {dif !== 0 && (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Se trabajó <strong className="text-slate-700">{duracion(Math.abs(dif))}</strong> {dif > 0 ? "más" : "menos"} de lo
                acordado, y se facturó <strong className="text-slate-700">{duracion(d.total.minutosFacturables)}</strong>: la
                diferencia la decide la regla de la casa, no el fichaje.
              </p>
            )}
          </section>

          {/* --- Mes a mes -------------------------------------------- */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-700">Mes a mes</h3>
            <p className="mt-0.5 text-xs text-slate-500">Horas facturadas y el reparto del dinero de cada mes.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-3 font-medium">Mes</th>
                    <th className="py-1.5 pr-3 font-medium">Horas facturadas</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Jornadas</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Cobrado</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Pagado</th>
                    <th className="py-1.5 text-right font-medium">CUIDA</th>
                  </tr>
                </thead>
                <tbody>
                  {d.meses.map((m) => (
                    <tr key={m.mes} className={`border-b border-slate-100 ${m.jornadas === 0 ? "text-slate-300" : ""}`}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{nombreMes(m.mes)}</td>
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 shrink-0 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-brand"
                              style={{ width: `${Math.max(Math.round((m.minutosFacturables / maxMes) * 100), m.minutosFacturables > 0 ? 3 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums">{m.minutosFacturables > 0 ? duracion(m.minutosFacturables) : "—"}</span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{m.jornadas || "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{m.importeCliente > 0 ? euros(m.importeCliente) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{m.importeProfesional > 0 ? euros(m.importeProfesional) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{m.importeCuida > 0 ? euros(m.importeCuida) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* --- Donde se separa lo acordado de lo trabajado ----------- */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconAlert className="h-4 w-4 text-slate-400" aria-hidden /> Desviaciones
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Cada línea de aquí es una jornada en la que alguien tuvo que decidir algo a mano. Si crecen, la que no cuadra es la
              planificación, no el fichaje.
            </p>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              <Aviso n={d.desviaciones.extraPendiente} texto="con tiempo de más sin decidir: no se facturarán hasta resolverlo" tono="naranja" />
              <Aviso n={d.desviaciones.conExceso} texto={`con más tiempo del acordado (${duracion(d.desviaciones.minutosExcesoTotal)} en total)`} tono="gris" />
              <Aviso n={d.desviaciones.conDefecto} texto="terminadas antes de lo acordado" tono="gris" />
              <Aviso n={d.desviaciones.conRetraso} texto={`con entrada más tarde de lo previsto (${duracion(d.desviaciones.minutosRetrasoTotal)} en total)`} tono="gris" />
              <Aviso n={d.desviaciones.extraAprobado} texto="con tiempo de más aprobado y cobrado" tono="gris" />
              <Aviso n={d.desviaciones.extraRechazado} texto="con tiempo de más rechazado" tono="gris" />
              <Aviso n={d.desviaciones.cierresManuales} texto="cerradas a mano por coordinación, sin fichaje de salida" tono="naranja" />
              <Aviso n={d.desviaciones.correcciones} texto="correcciones de fichaje, todas con su motivo y su original" tono="gris" />
              <Aviso n={d.desviaciones.canceladas} texto="canceladas fuera de plazo" tono="rojo" />
              <Aviso n={d.desviaciones.noPresentados} texto="no presentados: el profesional fue y la persona no estaba" tono="rojo" />
            </ul>
            {Object.values(d.desviaciones).every((v) => v === 0) && (
              <p className="mt-2 text-xs text-slate-400">Ninguna desviación en el periodo: todo lo fichado cuadra con lo acordado.</p>
            )}
          </section>

          {/* --- Rankings --------------------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconEuro className="h-4 w-4 text-slate-400" aria-hidden /> Por persona
              </h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {d.porPersona.map((p) => (
                  <FilaRanking
                    key={p.id}
                    nombre={p.nombre}
                    jornadas={p.jornadas}
                    minutos={p.minutosFacturables}
                    importe={euros(p.importeCliente)}
                    maximo={Math.max(1, ...d.porPersona.map((x) => x.minutosFacturables))}
                  />
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconUsers className="h-4 w-4 text-slate-400" aria-hidden /> Por profesional
              </h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {d.porProfesional.map((p) => (
                  <FilaRanking
                    key={p.id}
                    nombre={p.nombre}
                    jornadas={p.jornadas}
                    minutos={p.minutosLiquidables}
                    importe={euros(p.importeProfesional)}
                    maximo={Math.max(1, ...d.porProfesional.map((x) => x.minutosLiquidables))}
                    // La media es sobre las jornadas en que llegó tarde, no
                    // sobre todas: "2 min de media" escondería el día que
                    // llegó veinte minutos tarde.
                    extra={p.jornadasConRetraso > 0 ? `${p.retrasoMedio} min tarde de media en ${p.jornadasConRetraso}` : undefined}
                  />
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconPencil className="h-4 w-4 text-slate-400" aria-hidden /> Por tipo de servicio
              </h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {d.porNecesidad.map((p) => (
                  <FilaRanking
                    key={p.id}
                    nombre={p.nombre}
                    jornadas={p.jornadas}
                    minutos={p.minutosFacturables}
                    importe={euros(p.importeCliente)}
                    maximo={Math.max(1, ...d.porNecesidad.map((x) => x.minutosFacturables))}
                  />
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
