import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { Pagination, usePaginacion } from "../../components/Pagination.js";
import { CatalogoServiciosModal } from "./CatalogoServiciosModal.js";
import type { Servicio } from "../../lib/types.js";

function num(v: string | number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

// Pestaña Servicios (ERP): "se ha perdido la opción de servicios... se debe
// poder gestionar los servicios y saber qué cantidad le corresponde a cada
// profesional por el servicio" — un listado plano de todos los Servicio con
// su tarifa/IVA/reparto, en vez de solo verlos enterrados dentro de cada
// ficha de solicitud. Dos servicios distintos de la misma persona (ej.
// Carmen limpieza+paseo, Elena aseo por las mañanas) aparecen como dos
// filas independientes, cada una con su propio importeProfesional — se
// facturan juntos a la familia (misma Factura mensual) pero se liquidan
// aparte.
export function ServiciosTab() {
  const { token } = useAuth();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);

  async function cargar() {
    setServicios(await api.get<Servicio[]>("/servicios", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return servicios;
    return servicios.filter((s) =>
      `${s.codigo} ${s.solicitud?.persona.nombre ?? ""} ${s.solicitud?.persona.apellidos ?? ""} ${s.profesional?.nombre ?? ""} ${s.profesional?.apellidos ?? ""} ${s.tipoServicioOfrecido?.nombre ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [servicios, busqueda]);

  const totalFacturable = filtrados.reduce((acc, s) => acc + num(s.totalConIva ?? s.tarifaImporte), 0);
  const totalProfesionales = filtrados.reduce((acc, s) => acc + num(s.importeProfesional), 0);

  const { items: pagina, pagina: paginaActual, totalPaginas, setPagina } = usePaginacion(filtrados);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por persona, profesional, código o tipo…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-sm"
        />
        <button onClick={() => setCatalogoAbierto(true)} className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          🏷️ Catálogo de servicios
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-3 py-1">
          {filtrados.length} servicios · <strong className="text-slate-700">{totalFacturable.toFixed(2)} €</strong> facturable (con IVA)
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1">
          A repartir entre profesionales: <strong className="text-slate-700">{totalProfesionales.toFixed(2)} €</strong>
        </span>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-500">Sin servicios que mostrar.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Persona</th>
                <th className="px-4 py-2.5">Profesional</th>
                <th className="px-4 py-2.5">Tipo (catálogo)</th>
                <th className="px-4 py-2.5">Tarifa</th>
                <th className="px-4 py-2.5">IVA</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Para el profesional</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagina.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos}
                    <div className="text-xs font-normal text-slate-400">{s.codigo}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{s.profesional ? `${s.profesional.nombre} ${s.profesional.apellidos}` : "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.tipoServicioOfrecido?.nombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {s.tarifaImporte != null ? `${num(s.tarifaImporte).toFixed(2)} €` : s.tarifaTipo === "VOLUNTARIO" ? "Voluntario" : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{s.ivaPorcentaje != null ? `${num(s.ivaPorcentaje)}% (${num(s.ivaImporte).toFixed(2)} €)` : "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.totalConIva != null ? `${num(s.totalConIva).toFixed(2)} €` : "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{s.importeProfesional != null ? `${num(s.importeProfesional).toFixed(2)} €` : "—"}</td>
                  <td className="px-4 py-2.5">
                    <EstadoBadge estado={s.estado} />
                  </td>
                  <td className="px-4 py-2.5">{s.tarifaTipo === "PAGADO" ? <EstadoBadge estado={s.pagoProfesionalEstado ?? "PENDIENTE"} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} total={filtrados.length} />
        </div>
      )}

      {catalogoAbierto && <CatalogoServiciosModal onClose={() => setCatalogoAbierto(false)} />}
    </div>
  );
}
