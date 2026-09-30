import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { BajaProfesionalModal } from "../../components/BajaProfesionalModal.js";
import { ExpedienteDocumentos } from "../../components/ExpedienteDocumentos.js";
import { FotoUpload } from "../../components/FotoUpload.js";
import { DisponibilidadPicker } from "../../components/DisponibilidadPicker.js";
import { parsearDisponibilidad, serializarDisponibilidad, type Disponibilidad } from "../../lib/disponibilidad.js";
import {
  CARNES,
  COMUNIDADES,
  TITULACIONES,
  municipiosDe,
  type CarneConducir,
  type Titulacion,
} from "../../lib/territorio.js";
import type { EmpresaColaboradora, Profesional, Servicio } from "../../lib/types.js";

// La organización piloto opera en Cantabria: es lo que más se va a elegir.
const COMUNIDAD_POR_DEFECTO = "CB";

const CAMPOS_VACIOS = {
  nombre: "",
  apellidos: "",
  telefono: "",
  comunidad: COMUNIDAD_POR_DEFECTO,
  municipio: "",
  zona: "",
  carneConducir: "NO" as CarneConducir,
  vehiculoPropio: false,
  titulacion: "" as Titulacion | "",
  dni: "",
  numeroCuenta: "",
  bizum: "",
  foto: "",
  biografia: "",
  empresaColaboradoraId: "",
};

type Campos = typeof CAMPOS_VACIOS;

// El formulario del profesional —alta o edición según si se pasa `profesional`—.
// Lo usan la ventana de alta y la pestaña «Datos» de su ficha: el mismo
// formulario para los dos casos, con los mismos campos y los mismos botones.
export function ProfesionalFormulario({
  profesional,
  empresas,
  onSaved,
  onCancelar,
}: {
  profesional: Profesional | null;
  empresas: EmpresaColaboradora[];
  onSaved: () => void;
  onCancelar?: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<Campos>(
    profesional
      ? {
          nombre: profesional.nombre,
          apellidos: profesional.apellidos,
          telefono: profesional.telefono ?? "",
          comunidad: profesional.comunidad ?? COMUNIDAD_POR_DEFECTO,
          municipio: profesional.municipio ?? "",
          zona: profesional.zona ?? "",
          carneConducir: (profesional.carneConducir ?? "NO") as CarneConducir,
          vehiculoPropio: profesional.vehiculoPropio ?? false,
          titulacion: (profesional.titulacion ?? "") as Titulacion | "",
          dni: profesional.dni ?? "",
          numeroCuenta: profesional.numeroCuenta ?? "",
          bizum: profesional.bizum ?? "",
          foto: profesional.foto ?? "",
          biografia: profesional.biografia ?? "",
          empresaColaboradoraId: profesional.empresaColaboradoraId ?? "",
        }
      : CAMPOS_VACIOS,
  );
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad>(parsearDisponibilidad(profesional?.disponibilidad));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los campos vacíos no se mandan, para no pisar lo que ya hubiera. Los
  // booleanos sí van siempre: `false` es una respuesta, no un hueco, y si se
  // colaba en la regla de "vacío" no había forma de desmarcar el vehículo.
  // La titulación vacía va como null, que es lo que la borra.
  function limpiar(p: Campos) {
    return Object.fromEntries(
      Object.entries(p).map(([k, v]) => {
        if (typeof v === "boolean") return [k, v];
        if (k === "titulacion") return [k, v || null];
        return [k, v || undefined];
      }),
    );
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const datos = { ...limpiar(form), disponibilidad: serializarDisponibilidad(disponibilidad) };
      if (profesional) {
        await api.patch(`/profesionales/${profesional.id}`, { ...datos, empresaColaboradoraId: form.empresaColaboradoraId || null }, token);
      } else {
        await api.post("/profesionales", { ...datos, email: email || undefined, password: password || undefined }, token);
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
      <div className="sm:col-span-2">
        <FotoUpload value={form.foto} onChange={(foto) => setForm((f) => ({ ...f, foto }))} nombre={form.nombre || "?"} />
      </div>
      <label className="text-xs text-slate-500">
        Nombre
        <input required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500">
        Apellidos
        <input required value={form.apellidos} onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500">
        Teléfono
        <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500">
        DNI
        <input value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} className="campo mt-0.5" />
      </label>

      {/* Dónde trabaja, de una lista cerrada: al elegir comunidad cambian
          los municipios. Antes era un campo libre y cada ficha lo escribía
          a su manera, así que no se podía filtrar por zona. */}
      <label className="text-xs text-slate-500">
        Comunidad
        <select
          value={form.comunidad}
          onChange={(e) => setForm((f) => ({ ...f, comunidad: e.target.value, municipio: "" }))}
          className="campo mt-0.5"
        >
          <option value="">Sin indicar</option>
          {COMUNIDADES.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Municipio
        <select
          value={form.municipio}
          onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
          disabled={!form.comunidad}
          className="campo mt-0.5 disabled:bg-slate-100"
        >
          <option value="">{form.comunidad ? "Toda la comunidad" : "Elige comunidad primero"}</option>
          {municipiosDe(form.comunidad).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">
        Barrio o zona concreta
        <input value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} placeholder="Opcional" className="campo mt-0.5" />
      </label>

      <label className="text-xs text-slate-500">
        Carné de conducir
        <select
          value={form.carneConducir}
          onChange={(e) => setForm((f) => ({ ...f, carneConducir: e.target.value as CarneConducir }))}
          className="campo mt-0.5"
        >
          {CARNES.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Titulación
        <select
          value={form.titulacion}
          onChange={(e) => setForm((f) => ({ ...f, titulacion: e.target.value as Titulacion | "" }))}
          className="campo mt-0.5"
        >
          <option value="">Sin indicar</option>
          {TITULACIONES.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.vehiculoPropio}
          onChange={(e) => setForm((f) => ({ ...f, vehiculoPropio: e.target.checked }))}
        />
        Tiene vehículo propio
      </label>
      <label className="text-xs text-slate-500">
        Número de cuenta (IBAN)
        <input value={form.numeroCuenta} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">
        Bizum
        <input value={form.bizum} onChange={(e) => setForm((f) => ({ ...f, bizum: e.target.value }))} className="campo mt-0.5" />
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">
        Biografía y experiencia
        <textarea
          placeholder="Tipo CV: la ven coordinación y la familia al elegir profesional"
          value={form.biografia}
          onChange={(e) => setForm((f) => ({ ...f, biografia: e.target.value }))}
          rows={3}
          className="campo mt-0.5"
        />
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">
        Empresa
        <select value={form.empresaColaboradoraId} onChange={(e) => setForm((f) => ({ ...f, empresaColaboradoraId: e.target.value }))} className="campo mt-0.5">
          <option value="">Independiente (no trabaja para ninguna empresa)</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              Trabaja para: {emp.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-slate-500 sm:col-span-2">
        Disponibilidad
        <div className="mt-1 rounded-lg border border-slate-200 p-3">
          <DisponibilidadPicker value={disponibilidad} onChange={setDisponibilidad} />
        </div>
      </label>

      {!profesional && (
        <>
          <label className="text-xs text-slate-500">
            Email de acceso
            <input type="email" placeholder="Opcional" value={email} onChange={(e) => setEmail(e.target.value)} className="campo mt-0.5" />
          </label>
          <label className="text-xs text-slate-500">
            Contraseña
            <input type="password" minLength={6} placeholder="Si le das email" value={password} onChange={(e) => setPassword(e.target.value)} className="campo mt-0.5" />
          </label>
        </>
      )}

      {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="boton-secundario">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={guardando} className="boton-principal">
          {guardando ? "Guardando…" : profesional ? "Guardar cambios" : "Crear profesional"}
        </button>
      </div>
    </form>
  );
}

// La ventana de alta de un profesional nuevo.
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
  return (
    <Modal title={profesional ? `${profesional.nombre} ${profesional.apellidos} · ${profesional.codigo}` : "Nuevo profesional"} onClose={onClose} size="lg">
      <ProfesionalFormulario
        profesional={profesional}
        empresas={empresas}
        onCancelar={onClose}
        onSaved={() => {
          onSaved();
          onClose();
        }}
      />
    </Modal>
  );
}
