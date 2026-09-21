import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Pagination, usePaginacion } from "../../components/Pagination.js";
import { IconPlus } from "../../components/icons.js";
import { ProfesionalFormModal } from "./ProfesionalFormModal.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { useSeleccion } from "../../lib/useSeleccion.js";
import { exportarCSV } from "../../lib/csv.js";
import type { EmpresaColaboradora, Profesional } from "../../lib/types.js";

const ZONA_POR_DEFECTO = "Cantabria";

export function ProfesionalesTab() {
  const { token } = useAuth();
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [editando, setEditando] = useState<Profesional | null>(null);

  async function cargar() {
    const [pros, emps] = await Promise.all([
      api.get<Profesional[]>("/profesionales", token),
      api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token),
    ]);
    setProfesionales(pros);
    setEmpresas(emps);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return profesionales.filter((p) => {
      if (q && !`${p.nombre} ${p.apellidos} ${p.codigo} ${p.zona ?? ""}`.toLowerCase().includes(q)) return false;
      if (empresaFiltro === "__independiente__" && p.empresaColaboradoraId) return false;
      if (empresaFiltro && empresaFiltro !== "__independiente__" && p.empresaColaboradoraId !== empresaFiltro) return false;
      return true;
    });
  }, [profesionales, busqueda, empresaFiltro]);

  const { items: pagina, pagina: paginaActual, totalPaginas, setPagina } = usePaginacion(filtrados);
  const seleccion = useSeleccion(filtrados);

  function exportar() {
    const filas = seleccion.seleccionadas.length > 0 ? seleccion.seleccionadas : filtrados;
    exportarCSV(
      filas,
      [
        { encabezado: "Código", valor: (p) => p.codigo },
        { encabezado: "Nombre", valor: (p) => `${p.nombre} ${p.apellidos}` },
        { encabezado: "Zona", valor: (p) => p.zona ?? ZONA_POR_DEFECTO },
        { encabezado: "Empresa", valor: (p) => p.empresaColaboradora?.nombre ?? "Independiente" },
        { encabezado: "Teléfono", valor: (p) => p.telefono },
        { encabezado: "Estado", valor: (p) => p.estado },
      ],
      "profesionales",
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código o zona…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <select value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value="">Todas las empresas</option>
          <option value="__independiente__">Independientes</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nombre}
            </option>
          ))}
        </select>
        <button onClick={() => setNuevoAbierto(true)} className="ml-auto flex items-center gap-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-800">
          <IconPlus className="h-4 w-4" /> Nuevo profesional
        </button>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-500">Sin profesionales que mostrar.</p>
      ) : (
        <div>
          <ExportarBarra total={filtrados.length} seleccionadas={seleccion.seleccionadas.length} onExportar={exportar} />
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-4 py-2.5">
                    <input type="checkbox" checked={seleccion.todasMarcadas} onChange={seleccion.toggleTodos} />
                  </th>
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Zona</th>
                  <th className="px-4 py-2.5">Empresa</th>
                  <th className="px-4 py-2.5">Teléfono</th>
                  <th className="px-4 py-2.5">Código</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagina.map((p) => (
                  <tr key={p.id} onClick={() => setEditando(p)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={seleccion.ids.has(p.id)} onChange={() => seleccion.toggle(p.id)} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        {p.foto ? (
                          <img src={p.foto} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-500">
                            {p.nombre[0]}
                            {p.apellidos[0]}
                          </div>
                        )}
                        {p.nombre} {p.apellidos}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{p.zona ?? ZONA_POR_DEFECTO}</td>
                    <td className="px-4 py-2.5 text-slate-500">{p.empresaColaboradora ? p.empresaColaboradora.nombre : "Independiente"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{p.telefono ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{p.codigo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} total={filtrados.length} />
          </div>
        </div>
      )}

      {nuevoAbierto && <ProfesionalFormModal profesional={null} empresas={empresas} onClose={() => setNuevoAbierto(false)} onSaved={cargar} />}
      {editando && <ProfesionalFormModal profesional={editando} empresas={empresas} onClose={() => setEditando(null)} onSaved={cargar} />}
    </div>
  );
}
