import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { DocumentosProfesional } from "../../components/DocumentosProfesional.js";
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
  const [historial, setHistorial] = useState<Servicio[]>([]);
  const [cuenta, setCuenta] = useState<{ email: string; activo: boolean } | null>(null);
  const [passwordReseteada, setPasswordReseteada] = useState<string | null>(null);

  useEffect(() => {
    if (!profesional) return;
    api.get<Servicio[]>("/servicios", token).then((servicios) => setHistorial(servicios.filter((s) => s.profesionalId === profesional.id)));
    api.get<Profesional>(`/profesionales/${profesional.id}`, token).then((p) => setCuenta(p.usuario ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesional?.id]);

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
        <input required placeholder="Nombre" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="campo" />
        <input required placeholder="Apellidos" value={form.apellidos} onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} className="campo" />
        <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="campo" />
        <input placeholder="DNI" value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} className="campo" />

        {/* Dónde trabaja, de una lista cerrada: al elegir comunidad cambian
            los municipios. Antes era un campo libre y cada ficha lo escribía
            a su manera, así que no se podía filtrar por zona. */}
        <label className="text-xs text-slate-500">
          Comunidad
          <select
            value={form.comunidad}
            onChange={(e) => setForm((f) => ({ ...f, comunidad: e.target.value, municipio: "" }))}
            className="mt-0.5 w-full campo text-slate-800"
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
            className="mt-0.5 w-full campo text-slate-800 disabled:bg-slate-100"
          >
            <option value="">{form.comunidad ? "Toda la comunidad" : "Elige comunidad primero"}</option>
            {municipiosDe(form.comunidad).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <input
          placeholder="Barrio o zona concreta (opcional)"
          value={form.zona}
          onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))}
          className="campo sm:col-span-2"
        />

        <label className="text-xs text-slate-500">
          Carné de conducir
          <select
            value={form.carneConducir}
            onChange={(e) => setForm((f) => ({ ...f, carneConducir: e.target.value as CarneConducir }))}
            className="mt-0.5 w-full campo text-slate-800"
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
            className="mt-0.5 w-full campo text-slate-800"
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
        <input placeholder="Número de cuenta (IBAN)" value={form.numeroCuenta} onChange={(e) => setForm((f) => ({ ...f, numeroCuenta: e.target.value }))} className="campo" />
        <input placeholder="Bizum" value={form.bizum} onChange={(e) => setForm((f) => ({ ...f, bizum: e.target.value }))} className="campo sm:col-span-2" />
        <textarea
          placeholder="Biografía / experiencia (tipo CV) — la ven coordinación y la familia al elegir profesional"
          value={form.biografia}
          onChange={(e) => setForm((f) => ({ ...f, biografia: e.target.value }))}
          rows={3}
          className="campo sm:col-span-2"
        />
        <select
          value={form.empresaColaboradoraId}
          onChange={(e) => setForm((f) => ({ ...f, empresaColaboradoraId: e.target.value }))}
          className="campo sm:col-span-2"
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
              className="campo"
            />
            <input
              type="password"
              minLength={6}
              placeholder="Contraseña (si le das email)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="campo"
            />
          </>
        )}

        {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}

        <button type="submit" disabled={guardando} className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50 sm:col-span-2">
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
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
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
              <div className="rounded-xl bg-slate-50 px-2.5 py-2">
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
                  <li key={s.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs">
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
