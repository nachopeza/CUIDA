import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Pagination, usePaginacion } from "../../components/Pagination.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { SearchBox } from "../../components/SearchBox.js";
import { ThOrdenable } from "../../components/ThOrdenable.js";
import { useSeleccion } from "../../lib/useSeleccion.js";
import { useOrdenacion } from "../../lib/useOrdenacion.js";
import { exportarCSV } from "../../lib/csv.js";
import type { Persona } from "../../lib/types.js";
import { IconSettings } from "../../components/icons.js";

// Portal de usuarios (sección "el portal de usuarios es muy importante.
// Buscar usuarios, saber qué servicios han solicitado"): buscador, columnas
// ordenables y ficha unificada por usuario, con el mismo patrón de lista que
// el resto del panel. El alta ("+ Usuario") y la ficha las controla el panel
// de coordinación, para que también funcionen desde la búsqueda global.
export function PersonasTab({ onAbrirFicha, refreshKey }: { onAbrirFicha: (id: string) => void; refreshKey: number }) {
  const { token } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [conAcceso, setConAcceso] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  async function cargar() {
    setPersonas(await api.get<Persona[]>("/personas", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const filtradas = personas.filter((p) => {
    const q = busqueda.trim().toLowerCase();
    if (q && !`${p.nombre} ${p.apellidos} ${p.codigo} ${p.usuario?.email ?? ""}`.toLowerCase().includes(q)) return false;
    if (conAcceso === "si" && !p.usuario) return false;
    if (conAcceso === "no" && p.usuario) return false;
    return true;
  });

  const orden = useOrdenacion(filtradas, {
    nombre: (p) => `${p.apellidos} ${p.nombre}`,
    codigo: (p) => p.codigo,
    email: (p) => p.usuario?.email,
    telefono: (p) => p.telefono,
    estado: (p) => p.estado,
  });

  const { items: pagina, pagina: paginaActual, totalPaginas, setPagina } = usePaginacion(orden.ordenadas);
  const seleccion = useSeleccion(filtradas);

  function exportar() {
    const filas = seleccion.seleccionadas.length > 0 ? seleccion.seleccionadas : filtradas;
    exportarCSV(
      filas,
      [
        { encabezado: "Código", valor: (p) => p.codigo },
        { encabezado: "Nombre", valor: (p) => `${p.nombre} ${p.apellidos}` },
        { encabezado: "Email", valor: (p) => p.usuario?.email },
        { encabezado: "Teléfono", valor: (p) => p.telefono },
        { encabezado: "Estado", valor: (p) => p.estado },
      ],
      "usuarios",
    );
  }

  async function eliminarSeleccionados() {
    const filas = seleccion.seleccionadas;
    if (filas.length === 0) return;
    if (!confirm(`¿Eliminar ${filas.length} usuario(s)? Los que ya tengan solicitudes o facturas no se pueden borrar.`)) return;
    const resultados = await Promise.all(
      filas.map((p) =>
        api
          .delete(`/personas/${p.id}`, token)
          .then(() => true)
          .catch(() => false),
      ),
    );
    const bloqueados = resultados.filter((r) => !r).length;
    seleccion.limpiar();
    await cargar();
    if (bloqueados > 0) alert(`${bloqueados} no se han podido eliminar porque ya tienen solicitudes o facturas.`);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, código o email…" className="flex-1 sm:max-w-xs" />
        <select
          value={orden.campo ?? ""}
          onChange={(e) => e.target.value && orden.ordenarPor(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-2 text-xs"
        >
          <option value="">Ordenar por…</option>
          <option value="nombre">Nombre</option>
          <option value="codigo">Código</option>
          <option value="email">Email</option>
          <option value="telefono">Teléfono</option>
          <option value="estado">Estado</option>
        </select>
        <button
          onClick={() => setFiltrosAbiertos((v) => !v)}
          className={`rounded-md border px-3 py-2 text-xs font-medium ${conAcceso ? "border-brand bg-brand-50 text-brand-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
        >
          <IconSettings className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
            Filtros avanzados
        </button>
      </div>

      {filtrosAbiertos && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <label className="text-slate-500">
            Acceso a la app
            <select value={conAcceso} onChange={(e) => setConAcceso(e.target.value)} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5">
              <option value="">Todos</option>
              <option value="si">Con cuenta de acceso</option>
              <option value="no">Sin cuenta todavía</option>
            </select>
          </label>
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="text-sm text-slate-500">Sin usuarios que mostrar.</p>
      ) : (
        <div>
          <ExportarBarra
            total={filtradas.length}
            seleccionadas={seleccion.seleccionadas.length}
            onExportar={exportar}
            onSeleccionarTodo={seleccion.seleccionarTodo}
            onLimpiarSeleccion={seleccion.limpiar}
            onEliminar={eliminarSeleccionados}
            etiquetaEliminar="Eliminar usuarios"
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
                  <ThOrdenable campo="email" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Acceso
                  </ThOrdenable>
                  <ThOrdenable campo="telefono" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Teléfono
                  </ThOrdenable>
                  <ThOrdenable campo="estado" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Estado
                  </ThOrdenable>
                  <ThOrdenable campo="codigo" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                    Código
                  </ThOrdenable>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagina.map((p) => (
                  <tr key={p.id} onClick={() => onAbrirFicha(p.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={seleccion.ids.has(p.id)} onChange={() => seleccion.toggle(p.id)} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {p.nombre} {p.apellidos}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{p.usuario?.email ?? "Sin acceso todavía"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{p.telefono ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{p.estado}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{p.codigo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} total={filtradas.length} />
          </div>
        </div>
      )}
    </div>
  );
}
