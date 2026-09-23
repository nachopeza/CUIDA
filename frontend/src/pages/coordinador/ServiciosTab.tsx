import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { useSeleccion } from "../../lib/useSeleccion.js";
import { exportarCSV } from "../../lib/csv.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { SearchBox } from "../../components/SearchBox.js";
import { ThOrdenable } from "../../components/ThOrdenable.js";
import { useOrdenacion } from "../../lib/useOrdenacion.js";
import type { Necesidad } from "../../lib/types.js";

const VACIO = { nombre: "", descripcion: "", ivaPorcentaje: "4", precioBase: "" };

// Pestaña Servicios: el catálogo único de lo que la organización ofrece
// (sección "unifiquemos: Servicios son lo que ofrecemos — acompañamiento,
// comidas, limpieza etc. — Solicitudes son las que nos hacen los
// usuarios"). Todo editable en línea desde coordinación, sin submodal.
export function ServiciosTab() {
  const { token } = useAuth();
  const [servicios, setServicios] = useState<Necesidad[]>([]);
  const [form, setForm] = useState(VACIO);
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicion, setEdicion] = useState(VACIO);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  async function cargar() {
    setServicios(await api.get<Necesidad[]>("/necesidades/todas", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear() {
    if (!form.nombre.trim()) return;
    setCreando(true);
    try {
      await api.post(
        "/necesidades",
        {
          nombre: form.nombre,
          descripcion: form.descripcion || undefined,
          ivaPorcentaje: Number(form.ivaPorcentaje) || 4,
          precioBase: form.precioBase ? Number(form.precioBase) : undefined,
        },
        token,
      );
      setForm(VACIO);
      await cargar();
    } finally {
      setCreando(false);
    }
  }

  function abrirEdicion(s: Necesidad) {
    setEditandoId(s.id);
    setEdicion({
      nombre: s.nombre,
      descripcion: s.descripcion ?? "",
      ivaPorcentaje: String(Number(s.ivaPorcentaje)),
      precioBase: s.precioBase != null ? String(s.precioBase) : "",
    });
  }

  async function guardarEdicion(id: string) {
    await api.patch(
      `/necesidades/${id}`,
      {
        nombre: edicion.nombre,
        descripcion: edicion.descripcion || undefined,
        ivaPorcentaje: Number(edicion.ivaPorcentaje) || 4,
        precioBase: edicion.precioBase ? Number(edicion.precioBase) : undefined,
      },
      token,
    );
    setEditandoId(null);
    await cargar();
  }

  async function toggleActivo(s: Necesidad) {
    await api.patch(`/necesidades/${s.id}`, { activo: !s.activo }, token);
    await cargar();
  }

  const visibles = servicios.filter((s) => {
    if (!mostrarInactivos && s.activo === false) return false;
    const q = busqueda.trim().toLowerCase();
    if (q && !`${s.nombre} ${s.codigo} ${s.descripcion ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const orden = useOrdenacion(visibles, {
    nombre: (s) => s.nombre,
    iva: (s) => Number(s.ivaPorcentaje),
    precio: (s) => (s.precioBase != null ? Number(s.precioBase) : null),
    codigo: (s) => s.codigo,
  });
  const seleccion = useSeleccion(visibles);

  async function eliminarSeleccionados() {
    const filas = seleccion.seleccionadas;
    if (filas.length === 0) return;
    if (!confirm(`¿Eliminar ${filas.length} servicio(s) del catálogo? Los que ya se hayan pedido alguna vez no se pueden borrar.`)) return;
    const resultados = await Promise.all(
      filas.map((s) =>
        api
          .delete(`/necesidades/${s.id}`, token)
          .then(() => true)
          .catch(() => false),
      ),
    );
    const bloqueados = resultados.filter((r) => !r).length;
    seleccion.limpiar();
    await cargar();
    if (bloqueados > 0) alert(`${bloqueados} no se han podido eliminar porque ya se han usado en alguna solicitud. Desactívalos en su lugar.`);
  }

  function exportar() {
    const filas = seleccion.seleccionadas.length > 0 ? seleccion.seleccionadas : visibles;
    exportarCSV(
      filas,
      [
        { encabezado: "Código", valor: (s) => s.codigo },
        { encabezado: "Nombre", valor: (s) => s.nombre },
        { encabezado: "Descripción", valor: (s) => s.descripcion },
        { encabezado: "IVA %", valor: (s) => Number(s.ivaPorcentaje) },
        { encabezado: "Precio base", valor: (s) => (s.precioBase != null ? Number(s.precioBase) : "") },
        { encabezado: "Activo", valor: (s) => (s.activo === false ? "No" : "Sí") },
      ],
      "servicios",
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        Lo que la organización ofrece: acompañamiento, comidas, limpieza... Cada servicio lleva su propio % de IVA (4% superreducido para plazas concertadas o con prestación
        vinculada a dependencia; 10% reducido para contratación particular sin ayuda pública), que hereda cada solicitud al fijar su tarifa.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-2 tarjeta p-3 text-sm sm:grid-cols-5">
        <input
          placeholder="Nombre del servicio"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 sm:col-span-2"
        />
        <select value={form.ivaPorcentaje} onChange={(e) => setForm((f) => ({ ...f, ivaPorcentaje: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5">
          <option value="4">IVA 4% (concertado)</option>
          <option value="10">IVA 10% (particular)</option>
          <option value="21">IVA 21% (general)</option>
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Precio base €"
          value={form.precioBase}
          onChange={(e) => setForm((f) => ({ ...f, precioBase: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5"
        />
        <button onClick={crear} disabled={creando || !form.nombre.trim()} className="rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">
          Añadir servicio
        </button>
        <input
          placeholder="Descripción (opcional)"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          className="rounded-md border border-slate-300 px-2 py-1.5 sm:col-span-5"
        />
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o descripción…" className="w-full sm:max-w-xs" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
          Mostrar también los desactivados
        </label>
      </div>

      <ExportarBarra
        total={visibles.length}
        seleccionadas={seleccion.seleccionadas.length}
        onExportar={exportar}
        onSeleccionarTodo={seleccion.seleccionarTodo}
        onLimpiarSeleccion={seleccion.limpiar}
        onEliminar={eliminarSeleccionados}
        etiquetaEliminar="Eliminar servicios"
      />

      <div className="overflow-x-auto tarjeta">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-4 py-2.5">
                <input type="checkbox" checked={seleccion.todasMarcadas} onChange={seleccion.toggleTodos} />
              </th>
              <ThOrdenable campo="nombre" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                Servicio
              </ThOrdenable>
              <ThOrdenable campo="iva" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                IVA
              </ThOrdenable>
              <ThOrdenable campo="precio" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                Precio base
              </ThOrdenable>
              <ThOrdenable campo="codigo" campoActivo={orden.campo} direccion={orden.direccion} onOrdenar={orden.ordenarPor}>
                Código
              </ThOrdenable>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orden.ordenadas.map((s) =>
              editandoId === s.id ? (
                <tr key={s.id} className="bg-brand-50">
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={seleccion.ids.has(s.id)} onChange={() => seleccion.toggle(s.id)} />
                  </td>
                  <td className="px-4 py-2 sm:min-w-[220px]">
                    <input
                      value={edicion.nombre}
                      onChange={(e) => setEdicion((v) => ({ ...v, nombre: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <input
                      value={edicion.descripcion}
                      onChange={(e) => setEdicion((v) => ({ ...v, descripcion: e.target.value }))}
                      placeholder="Descripción"
                      className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={edicion.ivaPorcentaje}
                      onChange={(e) => setEdicion((v) => ({ ...v, ivaPorcentaje: e.target.value }))}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="4">4%</option>
                      <option value="10">10%</option>
                      <option value="21">21%</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={edicion.precioBase}
                      onChange={(e) => setEdicion((v) => ({ ...v, precioBase: e.target.value }))}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{s.codigo}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => guardarEdicion(s.id)} className="rounded-xl bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800">
                      Guardar
                    </button>
                    <button onClick={() => setEditandoId(null)} className="ml-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100">
                      Cancelar
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className={s.activo === false ? "opacity-50" : ""}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={seleccion.ids.has(s.id)} onChange={() => seleccion.toggle(s.id)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <IconoNecesidad codigo={s.codigo} className="mr-1.5 inline h-4 w-4 shrink-0 align-text-bottom text-slate-400" />
                    <span className="font-medium text-slate-800">{s.nombre}</span>
                    {s.descripcion && <span className="ml-1.5 text-xs text-slate-400">— {s.descripcion}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{Number(s.ivaPorcentaje)}%</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{s.precioBase != null ? `${Number(s.precioBase).toFixed(2)} €` : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{s.codigo}</td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <button onClick={() => abrirEdicion(s)} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100">
                      Editar
                    </button>
                    <button onClick={() => toggleActivo(s)} className="ml-1.5 rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100">
                      {s.activo === false ? "Reactivar" : "Desactivar"}
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
