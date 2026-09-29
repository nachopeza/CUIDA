import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { QuitarEnLoteModal, type ElementoAQuitar } from "../../components/QuitarEnLoteModal.js";
import { api } from "../../lib/api.js";
import { Pagination, usePaginacion } from "../../components/Pagination.js";
import { ThOrdenable } from "../../components/ThOrdenable.js";
import { useOrdenacion } from "../../lib/useOrdenacion.js";
import { IconPlus } from "../../components/icons.js";
import { EmpresaFormModal } from "./EmpresaFormModal.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { useSeleccion } from "../../lib/useSeleccion.js";
import { exportarCSV } from "../../lib/csv.js";
import { SearchBox } from "../../components/SearchBox.js";
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

  const [verDeBaja, setVerDeBaja] = useState(false);
  const deBaja = empresas.filter((e) => e.estado === "INACTIVA").length;

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empresas.filter((e) => {
      if (!verDeBaja && e.estado === "INACTIVA") return false;
      return !q || `${e.nombre} ${e.codigo} ${e.cif ?? ""}`.toLowerCase().includes(q);
    });
  }, [empresas, busqueda, verDeBaja]);

  const orden = useOrdenacion(filtradas, {
    nombre: (e) => e.nombre,
    contacto: (e) => e.contacto,
    cif: (e) => e.cif,
    codigo: (e) => e.codigo,
  });

  const { items: pagina, pagina: paginaActual, totalPaginas, setPagina } = usePaginacion(orden.ordenadas);
  const seleccion = useSeleccion(filtradas);

  const [quitando, setQuitando] = useState<ElementoAQuitar[] | null>(null);
  function eliminarSeleccionadas() {
    if (seleccion.seleccionadas.length === 0) return;
    setQuitando(seleccion.seleccionadas.map((e) => ({ id: e.id, etiqueta: `${e.nombre} · ${e.codigo}` })));
  }

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
      {quitando && (
        <QuitarEnLoteModal
          singular="empresa"
          plural="empresas"
          elementos={quitando}
          eliminar={(id) => api.delete(`/empresas-colaboradoras/${id}`, token)}
          alternativa={{
            verbo: "Dar de baja",
            textoHecho: (n) => `${n} de baja`,
            explicacion: "Pasan a inactivas: no se les puede asignar servicios nuevos, pero lo que se hizo con ellas se conserva.",
            aplicar: async (id) => {
              await api.patch(`/empresas-colaboradoras/${id}`, { estado: "INACTIVA" }, token);
            },
          }}
          onClose={() => setQuitando(null)}
          onTerminado={async () => {
            seleccion.limpiar();
            await cargar();
          }}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, código o CIF…" className="flex-1 sm:max-w-xs" />
        {deBaja > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={verDeBaja} onChange={(e) => setVerDeBaja(e.target.checked)} />
            Ver de baja ({deBaja})
          </label>
        )}
        <button onClick={() => setNuevoAbierto(true)} className="ml-auto flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-800">
          <IconPlus className="h-4 w-4" /> Nueva empresa
        </button>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay empresas colaboradoras dadas de alta.</p>
      ) : (
        <div>
          <ExportarBarra
            total={filtradas.length}
            seleccionadas={seleccion.seleccionadas.length}
            onExportar={exportar}
            onSeleccionarTodo={seleccion.seleccionarTodo}
            onLimpiarSeleccion={seleccion.limpiar}
            onEliminar={eliminarSeleccionadas}
            etiquetaEliminar="Eliminar empresas"
          />
          <div className="overflow-x-auto tarjeta">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-[#f1f7fa] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="w-8 px-4 py-2.5">
                    <input type="checkbox" checked={seleccion.todasMarcadas} onChange={seleccion.toggleTodos} />
                  </th>
                  <ThOrdenable campo="nombre" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Nombre
                  </ThOrdenable>
                  <ThOrdenable campo="contacto" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Contacto
                  </ThOrdenable>
                  <ThOrdenable campo="cif" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    CIF
                  </ThOrdenable>
                  <th className="px-4 py-2.5">Encargo RGPD</th>
                  <ThOrdenable campo="codigo" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Código
                  </ThOrdenable>
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
                    <td className="px-4 py-2.5">
                      {emp.encargoFirmado ? (
                        <span className="rounded-full bg-brand-green-100 px-2 py-0.5 text-[11px] font-medium text-brand-green-700">
                          Encargo firmado
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700" title="Sin contrato de encargo de tratamiento (art. 28 RGPD) no se le pueden asignar servicios">
                          Sin contrato RGPD
                        </span>
                      )}
                    </td>
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
