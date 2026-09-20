import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api, ApiError } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import type { Factura, Persona } from "../../lib/types.js";

const SIGUIENTE_FACTURA: Record<string, string> = { BORRADOR: "EMITIDA", EMITIDA: "PAGADA" };

function mesActualISO() {
  return new Date().toISOString().slice(0, 7);
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
      setError(err instanceof ApiError ? "No hay servicios pagados sin facturar para esa persona en ese mes." : "Error al generar la factura.");
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
        <ul className="divide-y divide-slate-100">
          {facturas.map((f) => (
            <li key={f.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {f.persona.nombre} {f.persona.apellidos} · {f.mes}
                  </p>
                  <p className="text-xs text-slate-400">
                    {f.codigo} · {f.servicios.length} servicio(s)
                  </p>
                </div>
                <EstadoBadge estado={f.estado} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-1 text-xs text-slate-600">
                <span>Total cobrado: <strong>{Number(f.importeTotal).toFixed(2)} €</strong></span>
                <span className="text-slate-400">Comisión CUIDA: {Number(f.comisionTotal).toFixed(2)} €</span>
                <span className="text-slate-400">A profesionales/empresas: {Number(f.importeProfesionales).toFixed(2)} €</span>
                {SIGUIENTE_FACTURA[f.estado] && (
                  <button onClick={() => avanzarEstado(f)} className="ml-auto rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100">
                    Marcar {SIGUIENTE_FACTURA[f.estado].toLowerCase()}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
