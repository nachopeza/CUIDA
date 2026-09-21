import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { DocumentosProfesional } from "../../components/DocumentosProfesional.js";
import { FotoUpload } from "../../components/FotoUpload.js";
import { DisponibilidadPicker } from "../../components/DisponibilidadPicker.js";
import { parsearDisponibilidad, serializarDisponibilidad, type Disponibilidad } from "../../lib/disponibilidad.js";
import type { EmpresaColaboradora, Profesional, Servicio } from "../../lib/types.js";

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
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad>(parsearDisponibilidad(profesional?.disponibilidad));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Servicio[]>([]);
  const [cuenta, setCuenta] = useState<{ email: string; activo: boolean } | null>(null);
  const [passwordReseteada, setPasswordReseteada] = useState<string | null>(null);

  useEffect(() => {
    if (!profesional) return;
    api.get<Servicio[]>("/servicios", token).then((servicios) => setHistorial(servicios.filter((s) => s.profesionalId === profesional.id)));
    api.get<Profesional>(`/profesionales/${profesional.id}`, token).then((p) => setCuenta(p.usuario ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesional?.id]);

  function limpiar(p: Campos) {
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || undefined]));
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Revisa los datos.");
    } finally {
      setGuardando(false);
    }
  }

  async function resetearPassword() {
    if (!profesional) return;
    const res = await api.post<{ email: string; passwordGenerada: string }>(`/profesionales/${profesional.id}/cuenta/password`, {}, token);
    setPasswordReseteada(res.passwordGenerada);
  }

  // Glosario de pagos (sección "ver pagos, cobros, dinero pendiente... lo
  // que le hemos pagado"): a partir del mismo historial que ya se cargaba,
  // sin una llamada aparte — total ganado, ya pagado y pendiente.
  const serviciosPagados = historial.filter((s) => s.tarifaTipo === "PAGADO");
  const totalGanado = serviciosPagados.reduce((acc, s) => acc + Number(s.importeProfesional ?? s.tarifaImporte ?? 0), 0);
  const totalPagado = serviciosPagados.filter((s) => s.pagoProfesionalEstado === "PAGADO").reduce((acc, s) => acc + Number(s.importeProfesional ?? s.tarifaImporte ?? 0), 0);
  const totalPendiente = totalGanado - totalPagado;

  return (
    <Modal title={profesional ? `${profesional.nombre} ${profesional.apellidos} · ${profesional.codigo}` : "Nuevo profesional"} onClose={onClose} size="lg">
      <form onSubmit={guardar} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FotoUpload value={form.foto} onChange={(foto) => setForm((f) => ({ ...f, foto }))} nombre={form.nombre || "?"} />
        </div>
        <input required placeholder="Nombre" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input required placeholder="Apellidos" value={form.apellidos} onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Zona" value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="DNI / carné" value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Número de cuenta (IBAN)" value={form.numeroCuenta} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder="Bizum" value={form.bizum} onChange={(e) => setForm((f) => ({ ...f, bizum: e.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
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
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        >
          <option value="">Independiente (no trabaja para ninguna empresa)</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              Trabaja para: {emp.nombre}
            </option>
          ))}
        </select>

        <label className="text-xs text-slate-500 sm:col-span-2">
          Disponibilidad
          <div className="mt-1 rounded-md border border-slate-200 p-2.5">
            <DisponibilidadPicker value={disponibilidad} onChange={setDisponibilidad} />
          </div>
        </label>

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

      {profesional && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
          {/* Cuenta de acceso: cambios de contraseña desde coordinación
              (sección "cambios de datos contraseñas usuarios"). */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cuenta de acceso</p>
            {cuenta ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="text-slate-700">
                  {cuenta.email} {!cuenta.activo && <span className="text-rose-600">(inactiva)</span>}
                </p>
                {passwordReseteada ? (
                  <p className="mt-1 text-xs text-brand-green-700">
                    Nueva contraseña: <strong>{passwordReseteada}</strong> (apúntala, no se repetirá)
                  </p>
                ) : (
                  <button onClick={resetearPassword} className="mt-1 text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700">
                    Resetear contraseña
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Este profesional todavía no tiene cuenta de acceso.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Documentos</p>
            <DocumentosProfesional profesionalId={profesional.id} />
          </div>

          {/* Glosario de pagos (sección "ver pagos, cobros, dinero
              pendiente"): totales primero, detalle por servicio debajo. */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pagos</p>
            <dl className="mb-2 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-slate-50 px-2.5 py-2">
                <dt className="text-slate-400">Ganado</dt>
                <dd className="text-sm font-semibold text-slate-800">{totalGanado.toFixed(2)} €</dd>
              </div>
              <div className="rounded-md bg-brand-green-50 px-2.5 py-2">
                <dt className="text-brand-green-600">Pagado</dt>
                <dd className="text-sm font-semibold text-brand-green-700">{totalPagado.toFixed(2)} €</dd>
              </div>
              <div className="rounded-md bg-amber-50 px-2.5 py-2">
                <dt className="text-amber-600">Pendiente</dt>
                <dd className="text-sm font-semibold text-amber-700">{totalPendiente.toFixed(2)} €</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial de servicios</p>
            {historial.length === 0 ? (
              <p className="text-xs text-slate-400">Todavía no ha realizado ningún servicio.</p>
            ) : (
              <ul className="space-y-1">
                {historial.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span>
                      {s.codigo} · {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos} · {s.solicitud?.necesidad.nombre}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {s.tarifaTipo === "PAGADO" && <EstadoBadge estado={s.pagoProfesionalEstado ?? "PENDIENTE"} />}
                      <EstadoBadge estado={s.estado} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
