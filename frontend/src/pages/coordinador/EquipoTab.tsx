import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { SearchBox } from "../../components/SearchBox.js";
import { IconCheck, IconPlus, IconUsers } from "../../components/icons.js";
import type { MiembroEquipo } from "../../lib/types.js";

const ROLES = [
  { valor: "COORDINADOR", etiqueta: "Coordinación", ayuda: "Gestiona solicitudes, servicios, agenda e incidencias" },
  { valor: "ORGANIZACION", etiqueta: "Dirección", ayuda: "Todo lo de coordinación más finanzas y organización" },
  { valor: "ADMIN", etiqueta: "Administración", ayuda: "Configuración del sistema, catálogo y permisos" },
] as const;

function etiquetaRol(rol: string) {
  return ROLES.find((r) => r.valor === rol)?.etiqueta ?? rol.toLowerCase();
}

function fecha(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

// El equipo de la empresa: quien trabaja en la oficina. Coordinación,
// administración, dirección y cualquier otro puesto que no vaya a casa de
// nadie — eso son los profesionales, que tienen su propia área.
export function EquipoTab() {
  const { token } = useAuth();
  const [miembros, setMiembros] = useState<MiembroEquipo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [alta, setAlta] = useState(false);
  const [editando, setEditando] = useState<MiembroEquipo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    setMiembros(await api.get<MiembroEquipo[]>("/equipo", token));
  }

  useEffect(() => {
    cargar().catch(() => setMiembros([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function accion(fn: () => Promise<unknown>, exito: string) {
    setError(null);
    setAviso(null);
    try {
      await fn();
      await cargar();
      setAviso(exito);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido completar");
    }
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = miembros.filter((m) => (!q ? true : `${m.nombre ?? ""} ${m.email} ${m.puesto ?? ""}`.toLowerCase().includes(q)));
  const activos = miembros.filter((m) => m.activo).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">
          {activos} {activos === 1 ? "persona" : "personas"} en la oficina
          {miembros.length > activos && ` · ${miembros.length - activos} de baja`}
        </p>
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar…" className="ml-auto w-full sm:w-56" />
        <button
          onClick={() => setAlta(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800"
        >
          <IconPlus className="h-3.5 w-3.5" /> Dar de alta
        </button>
      </div>

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {aviso && <p className="rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">{aviso}</p>}

      {visibles.length === 0 ? (
        <p className="tarjeta px-4 py-8 text-center text-sm text-slate-400">
          Nadie coincide con la búsqueda.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 tarjeta">
          {visibles.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <button onClick={() => setEditando(m)} className="min-w-0 flex-1 text-left">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 hover:underline">
                  {m.nombre ?? m.email}
                  {m.esTu && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">tú</span>}
                  {!m.activo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">de baja</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {m.puesto ?? etiquetaRol(m.rol)} · {m.email}
                  {m.telefono && ` · ${m.telefono}`}
                  {m.fechaAlta && ` · desde ${fecha(m.fechaAlta)}`}
                </p>
              </button>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{etiquetaRol(m.rol)}</span>
            </li>
          ))}
        </ul>
      )}

      {(alta || editando) && (
        <FichaMiembro
          miembro={editando}
          onClose={() => {
            setAlta(false);
            setEditando(null);
          }}
          onGuardar={async (datos, id) => {
            await accion(
              () => (id ? api.patch(`/equipo/${id}`, datos, token) : api.post("/equipo", datos, token)),
              id ? "Datos guardados" : "Alta hecha",
            );
            setAlta(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function FichaMiembro({
  miembro,
  onClose,
  onGuardar,
}: {
  miembro: MiembroEquipo | null;
  onClose: () => void;
  onGuardar: (datos: Record<string, unknown>, id?: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    nombre: miembro?.nombre ?? "",
    email: miembro?.email ?? "",
    password: "",
    rol: (miembro?.rol ?? "COORDINADOR") as string,
    puesto: miembro?.puesto ?? "",
    telefono: miembro?.telefono ?? "",
    activo: miembro?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const esAlta = miembro === null;

  async function guardar() {
    setGuardando(true);
    try {
      const datos: Record<string, unknown> = {
        nombre: form.nombre,
        rol: form.rol,
        puesto: form.puesto || null,
        telefono: form.telefono || null,
      };
      if (esAlta) {
        datos.email = form.email;
        datos.password = form.password;
      } else {
        datos.activo = form.activo;
        // Sólo se manda la contraseña si de verdad se ha escrito una: un
        // campo vacío no debe borrarle el acceso a nadie.
        if (form.password) datos.password = form.password;
      }
      await onGuardar(datos, miembro?.id);
    } finally {
      setGuardando(false);
    }
  }

  const rolElegido = ROLES.find((r) => r.valor === form.rol);
  const puedeGuardar = form.nombre.trim() && (!esAlta || (form.email.trim() && form.password.length >= 6));

  return (
    <Modal title={esAlta ? "Dar de alta a alguien" : (miembro?.nombre ?? miembro?.email ?? "")} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Nombre
          <input
            type="text"
            autoFocus
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            className="mt-1 w-full campo font-normal normal-case"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Puesto
            <input
              type="text"
              value={form.puesto}
              onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))}
              placeholder="Coordinación · Administración · Calidad"
              className="mt-1 w-full campo font-normal normal-case"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Teléfono
            <input
              type="text"
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              className="mt-1 w-full campo font-normal normal-case"
            />
          </label>
        </div>

        {esAlta && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Correo de acceso
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full campo font-normal normal-case"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Contraseña inicial
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="mt-1 w-full campo font-normal normal-case"
              />
            </label>
          </div>
        )}

        {/* El permiso se elige diciendo qué va a hacer, no eligiendo una
            palabra del sistema. */}
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Qué puede hacer</legend>
          <div className="mt-1 space-y-1.5">
            {ROLES.map((r) => (
              <label
                key={r.valor}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${
                  form.rol === r.valor ? "border-brand bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input type="radio" checked={form.rol === r.valor} onChange={() => setForm((f) => ({ ...f, rol: r.valor }))} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{r.etiqueta}</span>
                  <span className="block text-xs text-slate-500">{r.ayuda}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {!esAlta && (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nueva contraseña
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Dejar vacío para no cambiarla"
                className="mt-1 w-full campo font-normal normal-case"
              />
            </label>
            {!miembro?.esTu && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
                Tiene acceso a la aplicación
              </label>
            )}
          </>
        )}

        {rolElegido && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">{rolElegido.ayuda}.</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="campo py-2 text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando || !puedeGuardar}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            <IconCheck className="h-4 w-4" /> {guardando ? "Guardando…" : esAlta ? "Dar de alta" : "Guardar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
