import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import type { EmpresaColaboradora, Profesional } from "../../lib/types.js";

const ZONA_POR_DEFECTO = "Cantabria";

const CAMPOS_VACIOS = {
  nombre: "",
  apellidos: "",
  telefono: "",
  zona: ZONA_POR_DEFECTO,
  dni: "",
  numeroCuenta: "",
  bizum: "",
  foto: "",
  biografia: "",
  empresaColaboradoraId: "",
};

type Campos = typeof CAMPOS_VACIOS;

// Ficha de profesional en modal (alta o edición, según si se pasa
// `profesional`): mismo formulario para ambos casos, evitando duplicar el
// formulario inline que antes se repetía por fila.
export function ProfesionalFormModal({
  profesional,
  empresas,
  onClose,
  onSaved,
}: {
  profesional: Profesional | null;
  empresas: EmpresaColaboradora[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<Campos>(
    profesional
      ? {
          nombre: profesional.nombre,
          apellidos: profesional.apellidos,
          telefono: profesional.telefono ?? "",
          zona: profesional.zona ?? ZONA_POR_DEFECTO,
          dni: profesional.dni ?? "",
          numeroCuenta: profesional.numeroCuenta ?? "",
          bizum: profesional.bizum ?? "",
          foto: profesional.foto ?? "",
          biografia: profesional.biografia ?? "",
          empresaColaboradoraId: profesional.empresaColaboradoraId ?? "",
        }
      : CAMPOS_VACIOS,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function limpiar(p: Campos) {
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || undefined]));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      if (profesional) {
        await api.patch(`/profesionales/${profesional.id}`, { ...limpiar(form), empresaColaboradoraId: form.empresaColaboradoraId || null }, token);
      } else {
        await api.post("/profesionales", { ...limpiar(form), email: email || undefined, password: password || undefined }, token);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Revisa los datos.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title={profesional ? `${profesional.nombre} ${profesional.apellidos} · ${profesional.codigo}` : "Nuevo profesional"} onClose={onClose} size="lg">
      <form onSubmit={guardar} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input required placeholder="Nombre" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input required placeholder="Apellidos" value={form.apellidos} onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Zona" value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="DNI / carné" value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Número de cuenta (IBAN)" value={form.numeroCuenta} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Bizum" value={form.bizum} onChange={(e) => setForm((f) => ({ ...f, bizum: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Foto (URL)" value={form.foto} onChange={(e) => setForm((f) => ({ ...f, foto: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
        <textarea
          placeholder="Biografía / experiencia (tipo CV) — la ven coordinación y la familia al elegir profesional"
          value={form.biografia}
          onChange={(e) => setForm((f) => ({ ...f, biografia: e.target.value }))}
          rows={3}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <select
          value={form.empresaColaboradoraId}
          onChange={(e) => setForm((f) => ({ ...f, empresaColaboradoraId: e.target.value }))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Independiente (no trabaja para ninguna empresa)</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              Trabaja para: {emp.nombre}
            </option>
          ))}
        </select>

        {!profesional && (
          <>
            <input
              type="email"
              placeholder="Email de acceso (opcional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              minLength={6}
              placeholder="Contraseña (si le das email)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </>
        )}

        {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}

        <button type="submit" disabled={guardando} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50 sm:col-span-2">
          {guardando ? "Guardando…" : profesional ? "Guardar cambios" : "Crear profesional"}
        </button>
      </form>
    </Modal>
  );
}
