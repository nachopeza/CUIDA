import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import type { TipoServicioOfrecido } from "../../lib/types.js";

const VACIO = { nombre: "", descripcion: "", ivaPorcentaje: "4", precioBase: "" };

// Catálogo de lo que la organización vende (sección "se debe de tener una
// opción para registrar los servicios que ofrecemos, que se puedan
// tarificar... como si fuera un ERP"): gestión mínima — nombre + IVA + precio
// base — que luego alimenta la tarifa de cada Servicio concreto.
export function CatalogoServiciosModal({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [tipos, setTipos] = useState<TipoServicioOfrecido[]>([]);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setTipos(await api.get<TipoServicioOfrecido[]>("/catalogo-servicios", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    try {
      await api.post(
        "/catalogo-servicios",
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
      setGuardando(false);
    }
  }

  async function toggleActivo(t: TipoServicioOfrecido) {
    await api.patch(`/catalogo-servicios/${t.id}`, { activo: !t.activo }, token);
    await cargar();
  }

  return (
    <Modal title="Catálogo de servicios" onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Lo que la organización ofrece, cada uno con su tipo de IVA (4% superreducido para plazas concertadas o con prestación vinculada a dependencia; 10% reducido para
          contratación particular sin ayuda pública).
        </p>

        <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 text-sm sm:grid-cols-4">
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
          <input
            placeholder="Descripción (opcional)"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 sm:col-span-3"
          />
          <button
            onClick={crear}
            disabled={guardando || !form.nombre.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Añadir al catálogo
          </button>
        </div>

        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {tipos.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Todavía no hay servicios en el catálogo.</li>}
          {tipos.map((t) => (
            <li key={t.id} className={`flex items-center justify-between px-3 py-2 text-sm ${!t.activo ? "opacity-50" : ""}`}>
              <div>
                <p className="font-medium text-slate-800">
                  {t.nombre} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">IVA {Number(t.ivaPorcentaje)}%</span>
                </p>
                <p className="text-xs text-slate-400">
                  {t.codigo} {t.precioBase != null && `· ${t.precioBase} € base`} {t.descripcion && `· ${t.descripcion}`}
                </p>
              </div>
              <button onClick={() => toggleActivo(t)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
                {t.activo ? "Desactivar" : "Reactivar"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
