import { euros } from "../lib/economia.js";
import type { Factura } from "../lib/types.js";
import logoCuida from "../assets/logo-cuida.svg";

export function referenciaFactura(f: Pick<Factura, "serie" | "ejercicio" | "numero" | "codigo">): string {
  if (!f.numero) return `${f.codigo} · sin emitir`;
  return `${f.serie}/${f.ejercicio}/${String(f.numero).padStart(4, "0")}`;
}

function fecha(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

const FORMA_PAGO: Record<string, string> = {
  DOMICILIACION: "Domiciliación bancaria",
  TRANSFERENCIA: "Transferencia",
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
};

// La factura tal y como se entrega. Se imprime desde aquí (el navegador hace
// el PDF) en vez de generar el archivo en el servidor: para un documento de
// una página el resultado es el mismo y no añade una dependencia más.
//
// Lo que se pinta son los datos CONGELADOS en la factura, no los actuales del
// cliente: si la hija cambia de dirección, la copia que ya tiene no cambia.
export function FacturaDocumento({ factura }: { factura: Factura }) {
  const lineas = factura.lineas ?? [];
  const esRectificativa = factura.tipo === "RECTIFICATIVA";
  // Agrupación por tipo de IVA: es como debe desglosarse, no una suma única.
  const porIva = new Map<string, { base: number; cuota: number }>();
  for (const l of lineas) {
    const clave = String(l.ivaPorcentaje);
    const actual = porIva.get(clave) ?? { base: 0, cuota: 0 };
    actual.base += Number(l.importe);
    actual.cuota += Number(l.ivaImporte);
    porIva.set(clave, actual);
  }

  return (
    <div className="bg-white p-6 text-slate-800 print:p-0">
      <header className="mb-6 flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
        <div>
          <img src={logoCuida} alt="CUIDA" className="mb-2 h-8 w-auto" />
          <p className="text-sm font-semibold">{factura.emisorNombre ?? "—"}</p>
          <p className="text-xs text-slate-500">{factura.emisorCif ?? "Sin CIF"}</p>
          <p className="text-xs text-slate-500">{factura.emisorDireccion ?? ""}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {esRectificativa ? "Factura rectificativa" : "Factura"}
          </p>
          <p className="text-lg font-semibold">{referenciaFactura(factura)}</p>
          <p className="text-xs text-slate-500">Fecha: {fecha(factura.fechaEmision)}</p>
          <p className="text-xs text-slate-500">Vencimiento: {fecha(factura.fechaVencimiento)}</p>
        </div>
      </header>

      {esRectificativa && factura.facturaRectificada && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Rectifica la factura {referenciaFactura(factura.facturaRectificada)}
          {factura.motivoRectificacion && ` · ${factura.motivoRectificacion}`}
        </p>
      )}

      <section className="mb-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cliente</p>
          <p className="text-sm font-medium">{factura.titularNombre ?? `${factura.persona.nombre} ${factura.persona.apellidos}`}</p>
          <p className="text-xs text-slate-500">{factura.titularNif ?? "Sin NIF"}</p>
          <p className="text-xs text-slate-500">{factura.titularDireccion ?? ""}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Servicios prestados a</p>
          <p className="text-sm">
            {factura.persona.nombre} {factura.persona.apellidos}
          </p>
          <p className="text-xs text-slate-500">Periodo: {factura.mes}</p>
          <p className="text-xs text-slate-500">Forma de pago: {FORMA_PAGO[factura.formaPago] ?? factura.formaPago}</p>
          {factura.mandatoSepa && <p className="text-xs text-slate-500">Mandato {factura.mandatoSepa.referencia} · {factura.mandatoSepa.iban}</p>}
        </div>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 font-semibold">Concepto</th>
            <th className="py-2 text-right font-semibold">Horas</th>
            <th className="py-2 text-right font-semibold">€/hora</th>
            <th className="py-2 text-right font-semibold">IVA</th>
            <th className="py-2 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {lineas.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-xs text-slate-400">
                Esta factura se creó antes del desglose por líneas; el importe es el del total.
              </td>
            </tr>
          )}
          {lineas.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="py-1.5">{l.concepto}</td>
              <td className="py-1.5 text-right tabular-nums">{Number(l.cantidad).toFixed(2)}</td>
              <td className="py-1.5 text-right tabular-nums">{euros(l.precioUnitario)}</td>
              <td className="py-1.5 text-right tabular-nums">{Number(l.ivaPorcentaje)}%</td>
              <td className="py-1.5 text-right tabular-nums">{euros(l.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Base imponible</dt>
            <dd className="tabular-nums">{euros(factura.importeTotal)}</dd>
          </div>
          {Array.from(porIva.entries()).map(([pct, v]) => (
            <div key={pct} className="flex justify-between text-xs text-slate-500">
              <dt>IVA {Number(pct)}% sobre {euros(v.base)}</dt>
              <dd className="tabular-nums">{euros(v.cuota)}</dd>
            </div>
          ))}
          {porIva.size === 0 && (
            <div className="flex justify-between text-xs text-slate-500">
              <dt>IVA</dt>
              <dd className="tabular-nums">{euros(factura.ivaTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{euros(factura.totalConIva)}</dd>
          </div>
        </dl>
      </section>

      <footer className="mt-8 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-400">
        <p>
          Documento generado por CUIDA · prototipo de demostración. No constituye una factura válida a efectos fiscales
          ni debe utilizarse en operaciones reales.
        </p>
      </footer>
    </div>
  );
}
