import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import type { EmpresaColaboradora } from "../../lib/types.js";

const CAMPOS_VACIOS = { nombre: "", contacto: "", cif: "", direccion: "", numeroCuenta: "" };
type Campos = typeof CAMPOS_VACIOS;

// El formulario de una empresa colaboradora, alta o edición según si se pasa
// `empresa`. Lo usan la ventana de alta y la pestaña «Datos» de su ficha.
export function EmpresaFormulario({ empresa, onSaved, onCancelar }: { empresa: EmpresaColaboradora | null; onSaved: () => void; onCancelar?: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<Campos>(
    empresa
      ? {
          nombre: empresa.nombre,
          contacto: empresa.contacto ?? "",
          cif: empresa.cif ?? "",
          direccion: empresa.direccion ?? "",
          numeroCuenta: empresa.numeroCuenta ?? "",
        }
      : CAMPOS_VACIOS,
  );
  // El contrato de encargo del tratamiento va aparte del resto de campos
  // porque no es un dato administrativo: sin él no se le puede asignar ni un
  // servicio, así que es una condición para trabajar con ella.
  const [encargoFirmado, setEncargoFirmado] = useState(empresa?.encargoFirmado ?? false);
  const [encargoFecha, setEncargoFecha] = useState(empresa?.encargoFecha ? empresa.encargoFecha.slice(0, 10) : "");
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
      if (empresa) {
        await api.patch(
          `/empresas-colaboradoras/${empresa.id}`,
          { ...limpiar(form), encargoFirmado, encargoFecha: encargoFirmado ? encargoFecha || undefined : null },
          token,
        );
      } else {
        await api.post("/empresas-colaboradoras", limpiar(form), token);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Revisa los datos.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-xs text-slate-500">
        Nombre de la empresa
        <input required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500">
        Persona de contacto
        <input placeholder="Opcional" value={form.contacto} onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500">
        CIF
        <input value={form.cif} onChange={(e) => setForm((f) => ({ ...f, cif: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500">
        Dirección
        <input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">
        Número de cuenta (IBAN)
        <input value={form.numeroCuenta} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))} className="campo mt-0.5" />
      </label>

      {empresa && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={encargoFirmado}
              onChange={(e) => setEncargoFirmado(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="font-medium text-slate-700">Contrato de encargo de tratamiento firmado</span>
              <span className="block text-xs text-slate-500">
                Asignarle un servicio le entrega el nombre, la dirección y el plan de cuidados de la persona. El art. 28.3 del
                RGPD exige el contrato antes de esa cesión, no después: sin marcarlo, CUIDA no dejará asignarle servicios.
              </span>
            </span>
          </label>
          {encargoFirmado && (
            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              Firmado el
              <input
                type="date"
                value={encargoFecha}
                onChange={(e) => setEncargoFecha(e.target.value)}
                className="campo !w-auto !py-1.5 !text-xs"
              />
            </label>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="boton-secundario">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={guardando} className="boton-principal">
          {guardando ? "Guardando…" : empresa ? "Guardar cambios" : "Crear empresa colaboradora"}
        </button>
      </div>
    </form>
  );
}

// La ventana de alta de una empresa nueva.
export function EmpresaFormModal({ empresa, onClose, onSaved }: { empresa: EmpresaColaboradora | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal title={empresa ? `${empresa.nombre} · ${empresa.codigo}` : "Nueva empresa colaboradora"} onClose={onClose} size="lg">
      <EmpresaFormulario
        empresa={empresa}
        onCancelar={onClose}
        onSaved={() => {
          onSaved();
          onClose();
        }}
      />
    </Modal>
  );
}
