import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { SearchBox } from "../../components/SearchBox.js";
import { exportarCSV } from "../../lib/csv.js";
import { IconCheck, IconDownload, IconX } from "../../components/icons.js";
import type { FamiliarRelacion } from "../../lib/types.js";

// ---------------------------------------------------------------------------
// Familiares y contactos
//
// Cada vínculo entre una persona atendida y quien la representa vivía sólo
// dentro de la ficha de esa persona. Para contestar "¿quién puede pedir un
// servicio por Herminia?" o "¿a quién llamo si pasa algo?" había que abrir las
// fichas una a una.
//
// Aquí están todos, con lo que cada uno puede hacer. Los permisos no son
// decorativos: de ellos depende quién ve lo que se cobra y quién puede pedir
// en nombre de otra persona.
// ---------------------------------------------------------------------------

function Permiso({ activo, etiqueta }: { activo: boolean; etiqueta: string }) {
  return (
    <span
      title={etiqueta}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        activo ? "bg-brand-green-50 text-brand-green-700" : "bg-slate-100 text-slate-400"
      }`}
    >
      {activo ? <IconCheck className="h-3 w-3" /> : <IconX className="h-3 w-3" />}
      {etiqueta}
    </span>
  );
}

export function ContactosTab({ onAbrirPersona }: { onAbrirPersona: (personaId: string) => void }) {
  const { token } = useAuth();
  const [relaciones, setRelaciones] = useState<FamiliarRelacion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [soloActivos, setSoloActivos] = useState(true);

  useEffect(() => {
    api
      .get<FamiliarRelacion[]>("/personas/familiares", token)
      .then(setRelaciones)
      .catch(() => setRelaciones([]));
  }, [token]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return relaciones.filter((r) => {
      if (soloActivos && r.revocadoAt) return false;
      if (!q) return true;
      return `${r.usuario?.nombre ?? ""} ${r.usuario?.email ?? ""} ${r.persona?.nombre ?? ""} ${r.persona?.apellidos ?? ""} ${r.parentesco}`
        .toLowerCase()
        .includes(q);
    });
  }, [relaciones, busqueda, soloActivos]);

  const representantes = visibles.filter((r) => r.esRepresentante).length;

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-slate-500">
        Quién está autorizado por cada persona atendida y qué puede hacer en su nombre. {visibles.length} vínculos,{" "}
        {representantes} con representación legal.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por contacto, persona o parentesco…" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Sólo vínculos vigentes
        </label>
        <button
          onClick={() =>
            exportarCSV(
              visibles,
              [
                { encabezado: "Contacto", valor: (r) => r.usuario?.nombre ?? r.usuario?.email ?? "—" },
                { encabezado: "Email", valor: (r) => r.usuario?.email ?? "" },
                { encabezado: "Parentesco", valor: (r) => r.parentesco },
                { encabezado: "Persona atendida", valor: (r) => (r.persona ? `${r.persona.nombre} ${r.persona.apellidos}` : "") },
                { encabezado: "Representante", valor: (r) => (r.esRepresentante ? "Sí" : "No") },
                { encabezado: "Puede pedir", valor: (r) => (r.puedeSolicitar ? "Sí" : "No") },
                { encabezado: "Ve historial", valor: (r) => (r.puedeVerHistorial ? "Sí" : "No") },
                { encabezado: "Ve importes", valor: (r) => (r.puedeVerImportes ? "Sí" : "No") },
                { encabezado: "Vigente", valor: (r) => (r.revocadoAt ? "Revocado" : "Sí") },
              ],
              "familiares-y-contactos",
            )
          }
          className="boton-secundario-sm ml-auto"
        >
          <IconDownload className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="tarjeta px-4 py-6 text-center text-sm text-slate-400">
          No hay ningún familiar o contacto vinculado todavía. Se dan de alta desde la ficha de cada persona.
        </p>
      ) : (
        <div className="overflow-x-auto tarjeta">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-[#f1f7fa] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Contacto</th>
                <th className="px-4 py-2.5">Persona atendida</th>
                <th className="px-4 py-2.5">Parentesco</th>
                <th className="px-4 py-2.5">Qué puede hacer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((r) => (
                <tr key={r.id} className={`transition hover:bg-slate-50/70 ${r.revocadoAt ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-slate-800">{r.usuario?.nombre ?? r.usuario?.email ?? "—"}</span>
                    <span className="block truncate text-xs text-slate-400">{r.usuario?.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.persona ? (
                      <button onClick={() => onAbrirPersona(r.persona!.id)} className="text-left text-slate-700 hover:underline">
                        {r.persona.nombre} {r.persona.apellidos}
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600">{r.parentesco}</span>
                    {r.esRepresentante && (
                      <span className="ml-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                        Representante
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.revocadoAt ? (
                      <span className="text-xs text-slate-400">Vínculo revocado</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        <Permiso activo={r.puedeSolicitar} etiqueta="Pedir servicios" />
                        <Permiso activo={r.puedeVerHistorial} etiqueta="Ver historial" />
                        <Permiso activo={r.puedeVerImportes} etiqueta="Ver importes" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
