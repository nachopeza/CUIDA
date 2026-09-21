import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { DocumentosProfesional } from "../../components/DocumentosProfesional.js";
import { FotoUpload } from "../../components/FotoUpload.js";
import { DisponibilidadPicker } from "../../components/DisponibilidadPicker.js";
import { parsearDisponibilidad, serializarDisponibilidad, type Disponibilidad } from "../../lib/disponibilidad.js";
import type { Profesional } from "../../lib/types.js";

const PERFIL_VACIO = { telefono: "", zona: "", dni: "", numeroCuenta: "", bizum: "", foto: "", biografia: "" };
type Perfil = typeof PERFIL_VACIO;

// "Otra [pestaña] donde pueda configurar su perfil y sus datos" (sección
// Profesional): el propio profesional edita sus datos de contacto y cobro.
export function MiPerfilTab() {
  const { token, usuario } = useAuth();
  const [profesional, setProfesional] = useState<Profesional | null>(null);
  const [form, setForm] = useState<Perfil>(PERFIL_VACIO);
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad>(parsearDisponibilidad(null));
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    if (!usuario?.profesionalId) return;
    const p = await api.get<Profesional>(`/profesionales/${usuario.profesionalId}`, token);
    setProfesional(p);
    setForm({
      telefono: p.telefono ?? "",
      zona: p.zona ?? "",
      dni: p.dni ?? "",
      numeroCuenta: p.numeroCuenta ?? "",
      bizum: p.bizum ?? "",
      foto: p.foto ?? "",
      biografia: p.biografia ?? "",
    });
    setDisponibilidad(parsearDisponibilidad(p.disponibilidad));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.profesionalId]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!usuario?.profesionalId) return;
    setGuardando(true);
    try {
      const datos = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v || undefined]));
      await api.patch(`/profesionales/${usuario.profesionalId}`, { ...datos, disponibilidad: serializarDisponibilidad(disponibilidad) }, token);
      setMensaje("Perfil actualizado.");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  if (!profesional) return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <Card title="Mi perfil">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <FotoUpload value={form.foto} onChange={(foto) => setForm((f) => ({ ...f, foto }))} nombre={profesional.nombre} />
        <div>
          <p className="font-semibold text-slate-800">
            {profesional.nombre} {profesional.apellidos}
          </p>
          <p className="text-xs text-slate-400">
            {profesional.codigo} · {profesional.empresaColaboradora ? `Trabaja para ${profesional.empresaColaboradora.nombre}` : "Independiente"}
          </p>
        </div>
      </div>

      {/* Biografía tipo CV (sección "el perfil debe ser más profundo... para
          que los familiares también acepten y vean las cualidades"):
          visible para coordinación y familia al elegir o confirmar
          profesional, no solo un nombre en una lista. */}
      {mensaje && <div className="mb-3 rounded-lg border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-sm text-brand-green-700">{mensaje}</div>}

      <form onSubmit={guardar} className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <label className="text-xs text-slate-500 sm:col-span-2">
          Biografía / experiencia (tipo CV)
          <textarea
            value={form.biografia}
            onChange={(e) => setForm((f) => ({ ...f, biografia: e.target.value }))}
            rows={4}
            placeholder="Experiencia, formación, idiomas, especialidades…"
            className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-xs text-slate-500">
          Teléfono
          <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-xs text-slate-500">
          Zona
          <input value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-xs text-slate-500">
          DNI / carné
          <input value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-xs text-slate-500">
          Número de cuenta (IBAN)
          <input value={form.numeroCuenta} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-xs text-slate-500 sm:col-span-2">
          Bizum
          <input value={form.bizum} onChange={(e) => setForm((f) => ({ ...f, bizum: e.target.value }))} className="mt-0.5 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-xs text-slate-500 sm:col-span-2">
          Disponibilidad
          <div className="mt-1 rounded-md border border-slate-200 p-2.5">
            <DisponibilidadPicker value={disponibilidad} onChange={setDisponibilidad} />
          </div>
        </label>
        <button type="submit" disabled={guardando} className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-800 disabled:opacity-50 sm:col-span-2">
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Mis documentos</p>
        <DocumentosProfesional profesionalId={profesional.id} />
      </div>
    </Card>
  );
}
