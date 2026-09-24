import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Avatar } from "../../components/Avatar.js";
import { SearchBox } from "../../components/SearchBox.js";
import { DIAS_SEMANA, parsearDisponibilidad } from "../../lib/disponibilidad.js";
import { IconAlert } from "../../components/icons.js";
import type { Ausencia, FichaProfesional, Servicio } from "../../lib/types.js";

// ---------------------------------------------------------------------------
// Disponibilidad
//
// Quién puede trabajar, qué días y quién no está. Antes estaba repartido: la
// disponibilidad semanal dentro de la ficha de cada profesional y las
// ausencias dentro de Equipo. Para cubrir una jornada del jueves había que
// abrir siete fichas y acordarse de mirar también las vacaciones.
//
// Aquí se lee en una sola rejilla: cada fila es una persona, cada columna un
// día de la semana.
// ---------------------------------------------------------------------------

const NOMBRE_DIA: Record<string, string> = { L: "Lunes", M: "Martes", X: "Miércoles", J: "Jueves", V: "Viernes", S: "Sábado", D: "Domingo" };

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DisponibilidadTab() {
  const { token } = useAuth();
  const [plantilla, setPlantilla] = useState<FichaProfesional[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    void (async () => {
      const [eq, aus, servs] = await Promise.all([
        api.get<FichaProfesional[]>("/personal", token).catch(() => []),
        api.get<Ausencia[]>("/personal/ausencias", token).catch(() => []),
        api.get<Servicio[]>("/servicios", token).catch(() => []),
      ]);
      setPlantilla(eq);
      setAusencias(aus);
      setServicios(servs);
    })();
  }, [token]);

  const hoy = hoyISO();

  // Cuántas jornadas tiene cada quien por delante: la disponibilidad sin la
  // carga engaña, porque alguien puede estar disponible los cinco días y
  // tenerlos los cinco ocupados.
  const cargaPorProfesional = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const s of servicios) {
      for (const v of s.visitas ?? []) {
        const quien = v.profesionalId ?? s.profesionalId;
        if (!quien) continue;
        if (v.fecha.slice(0, 10) < hoy) continue;
        if (["REVISADA", "FINALIZADA", "CANCELADA"].includes(v.estado)) continue;
        cuenta.set(quien, (cuenta.get(quien) ?? 0) + 1);
      }
    }
    return cuenta;
  }, [servicios, hoy]);

  const ausenciasVigentes = useMemo(
    () => ausencias.filter((a) => a.estado === "APROBADA" && a.desde.slice(0, 10) <= hoy && a.hasta.slice(0, 10) >= hoy),
    [ausencias, hoy],
  );
  const pedidas = ausencias.filter((a) => a.estado === "SOLICITADA");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return plantilla.filter((p) => !q || `${p.nombre} ${p.apellidos} ${p.codigo}`.toLowerCase().includes(q));
  }, [plantilla, busqueda]);

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-slate-500">
        Qué días trabaja cada profesional, quién no está hoy y cuántas jornadas tiene por delante. Es lo que hay que mirar antes
        de asignar a alguien: estar disponible y estar libre no son lo mismo.
      </p>

      {(ausenciasVigentes.length > 0 || pedidas.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {ausenciasVigentes.length > 0 && (
            <span className="pastilla bg-amber-50 text-amber-700">
              <IconAlert className="h-3.5 w-3.5" /> {ausenciasVigentes.length} de ausencia hoy
            </span>
          )}
          {pedidas.length > 0 && (
            <span className="pastilla bg-slate-100 text-slate-600">{pedidas.length} petición(es) de días sin responder</span>
          )}
        </div>
      )}

      <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar profesional…" />

      {visibles.length === 0 ? (
        <p className="tarjeta px-4 py-6 text-center text-sm text-slate-400">Ningún profesional con ese nombre.</p>
      ) : (
        <div className="overflow-x-auto tarjeta">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-[#f1f7fa] text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Profesional</th>
                {DIAS_SEMANA.map((d) => (
                  <th key={d} className="px-2 py-2.5 text-center" title={NOMBRE_DIA[d]}>
                    {d}
                  </th>
                ))}
                <th className="px-4 py-2.5">Franja</th>
                <th className="px-4 py-2.5 text-right">Jornadas</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((p) => {
                const disp = parsearDisponibilidad(p.disponibilidad);
                const fuera = ausenciasVigentes.find((a) => a.profesional?.id === p.id);
                const carga = cargaPorProfesional.get(p.id) ?? 0;
                return (
                  <tr key={p.id} className="transition hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Avatar foto={p.foto} nombre={p.nombre} apellidos={p.apellidos} className="h-8 w-8" />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate font-medium text-slate-800">
                            {p.nombre} {p.apellidos}
                          </span>
                          <span className="block truncate text-xs text-slate-400">{p.municipio ?? p.zona ?? p.codigo}</span>
                        </span>
                      </span>
                    </td>
                    {DIAS_SEMANA.map((d) => {
                      const trabaja = disp.dias.includes(d);
                      return (
                        <td key={d} className="px-2 py-2.5 text-center">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${trabaja ? "bg-brand-green-500" : "bg-slate-200"}`}
                            aria-label={trabaja ? `Trabaja el ${NOMBRE_DIA[d]}` : `No trabaja el ${NOMBRE_DIA[d]}`}
                          />
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {disp.dias.length === 0 ? <span className="text-slate-400">Sin poner</span> : disp.franja}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{carga}</td>
                    <td className="px-4 py-2.5">
                      {fuera ? (
                        <span className="pastilla bg-amber-100 text-amber-700">
                          Fuera hasta el {new Date(fuera.hasta).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                        </span>
                      ) : p.bloqueado ? (
                        <span className="pastilla bg-rose-100 text-rose-700">No puede trabajar</span>
                      ) : p.estado === "PENDIENTE" ? (
                        <span className="pastilla bg-slate-100 text-slate-500">Alta sin verificar</span>
                      ) : (
                        <span className="pastilla bg-brand-green-50 text-brand-green-700">Disponible</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
