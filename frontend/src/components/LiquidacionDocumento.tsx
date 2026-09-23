import { duracion, euros } from "../lib/economia.js";
import type { Liquidacion } from "../lib/types.js";
import logoCuida from "../assets/logo-cuida.svg";

function fecha(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

// El papel que se le da a quien ha trabajado: qué jornadas entran, cuánto
// suman y cuánto cobra. Para una autónoma es la base de la factura que ella
// emite; para quien está en nómina, el resumen de horas que va a la gestoría.
export function LiquidacionDocumento({ liquidacion }: { liquidacion: Liquidacion }) {
  const esAutonoma = liquidacion.tipoRelacion === "AUTONOMO";
  return (
    // Mismo folio A4 que la factura: es el otro documento que se entrega.
    <div className="hoja-a4 flex flex-col text-slate-800 shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
      <header className="mb-6 flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
        <div>
          <img src={logoCuida} alt="CUIDA" className="mb-2 h-8 w-auto" />
          <p className="text-xs text-slate-500">Liquidación de servicios prestados</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{liquidacion.codigo}</p>
          <p className="text-xs text-slate-500">Periodo: {liquidacion.mes}</p>
          {liquidacion.fechaPago && <p className="text-xs text-slate-500">Pagada el {fecha(liquidacion.fechaPago)}</p>}
        </div>
      </header>

      <section className="mb-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Profesional</p>
          <p className="text-sm font-medium">
            {liquidacion.profesional.nombre} {liquidacion.profesional.apellidos}
          </p>
          <p className="text-xs text-slate-500">{liquidacion.profesional.dni ?? "Sin DNI"}</p>
          <p className="text-xs text-slate-500">{liquidacion.profesional.numeroCuenta ?? "Sin cuenta bancaria"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Relación</p>
          <p className="text-sm">{esAutonoma ? "Autónoma · factura a CUIDA" : "Contrato laboral · va a nómina"}</p>
          <p className="text-xs text-slate-500">Tiempo trabajado: {duracion(liquidacion.minutos)}</p>
          <p className="text-xs text-slate-500">{liquidacion.lineas.length} jornada{liquidacion.lineas.length === 1 ? "" : "s"} verificada{liquidacion.lineas.length === 1 ? "" : "s"}</p>
        </div>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 font-semibold">Día</th>
            <th className="py-2 font-semibold">Servicio</th>
            <th className="py-2 text-right font-semibold">Tiempo</th>
            <th className="py-2 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {liquidacion.lineas.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="py-1.5 whitespace-nowrap">{fecha(l.fecha)}</td>
              <td className="py-1.5">{l.concepto}</td>
              <td className="py-1.5 text-right tabular-nums">{duracion(l.minutos)}</td>
              <td className="py-1.5 text-right tabular-nums">{euros(l.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Bruto</dt>
            <dd className="tabular-nums">{euros(liquidacion.bruto)}</dd>
          </div>
          {esAutonoma && (
            <div className="flex justify-between text-xs text-slate-500">
              <dt>Retención IRPF {Number(liquidacion.irpfPorcentaje)}%</dt>
              <dd className="tabular-nums">−{euros(liquidacion.irpfImporte)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
            <dt>{esAutonoma ? "A percibir" : "Bruto a nómina"}</dt>
            <dd className="tabular-nums">{euros(liquidacion.neto)}</dd>
          </div>
        </dl>
      </section>

      {!esAutonoma && (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Este documento resume el tiempo trabajado para la nómina. Las cotizaciones y la retención de IRPF las calcula
          la gestoría, no CUIDA.
        </p>
      )}

      <footer className="mt-auto border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-400 evitar-corte">
        <p>Documento generado por CUIDA · prototipo de demostración.</p>
      </footer>
    </div>
  );
}
