import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Pagination, usePaginacion } from "../../components/Pagination.js";
import { IconPlus } from "../../components/icons.js";
import { EmpresaFormModal } from "./EmpresaFormModal.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { useSeleccion } from "../../lib/useSeleccion.js";
import { exportarCSV } from "../../lib/csv.js";
import type { EmpresaColaboradora } from "../../lib/types.js";

export function EmpresasTab() {
  const { token } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [editando, setEditando] = useState<EmpresaColaboradora | null>(null);

  async function cargar() {
    setEmpresas(await api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return empresas;
    return empresas.filter((e) => `${e.nombre} ${e.codigo} ${e.cif ?? ""}`.toLowerCase().includes(q));
  }, [empresas, busqueda]);

  const { items: pagina, pagina: paginaActual, totalPaginas, setPagina } = usePaginacion(filtradas);
  const seleccion = useSeleccion(filtradas);

  function exportar() {
    const filas = seleccion.seleccionadas.length > 0 ? seleccion.seleccionadas : filtradas;
    exportarCSV(
      filas,
      [
        { encabezado: "Código", valor: (e) => e.codigo },
        { encabezado: "Nombre", valor: (e) => e.nombre },
        { encabezado: "Contacto", valor: (e) => e.contacto },
        { encabezado: "CIF", valor: (e) => e.cif },
        { encabezado: "Estado", valor: (e) => e.estado },
      ],
      "empresas_colaboradoras",
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código o CIF…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <button onClick={() => setNuevoAbierto(true)} className="ml-auto flex items-center gap-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-800">
          <IconPlus className="h-4 w-4" /> Nueva empresa
        </button>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay empresas colaboradoras dadas de alta.</p>
      ) : (
        <div>
          <ExportarBarra total={filtradas.length} seleccionadas={seleccion.seleccionadas.length} onExportar={exportar} />
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-4 py-2.5">
                    <input type="checkbox" checked={seleccion.todasMarcadas} onChange={seleccion.toggleTodos} />
                  </th>
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Contacto</th>
                  <th className="px-4 py-2.5">CIF</th>
                  <th className="px-4 py-2.5">Código</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagina.map((emp) => (
                  <tr key={emp.id} onClick={() => setEditando(emp)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={seleccion.ids.has(emp.id)} onChange={() => seleccion.toggle(emp.id)} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{emp.nombre}</td>
                    <td className="px-4 py-2.5 text-slate-500">{emp.contacto ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{emp.cif ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{emp.codigo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} total={filtradas.length} />
          </div>
        </div>
      )}

      {nuevoAbierto && <EmpresaFormModal empresa={null} onClose={() => setNuevoAbierto(false)} onSaved={cargar} />}
      {editando && <EmpresaFormModal empresa={editando} onClose={() => setEditando(null)} onSaved={cargar} />}
    </div>
  );
}
