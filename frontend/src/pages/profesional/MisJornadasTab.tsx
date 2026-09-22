import { useMemo, useState } from "react";
import { IconCheck, IconChevronLeft, IconChevronRight, IconClock, IconEuro } from "../../components/icons.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { ExportarBarra } from "../../components/ExportarBarra.js";
import { exportarCSV } from "../../lib/csv.js";
import { cobroDeJornada as cobroDe, duracion, euros, horaDe, minutosEntre, minutosFichados } from "../../lib/economia.js";
import type { Visita } from "../../lib/types.js";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function clave(f: Date) {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

// Mis jornadas: los fichajes tal y como quedaron, la escaleta del mes y lo
// que se cobra por ellas. Es la pantalla que el profesional abre para saber
// qué ha hecho y qué va a ingresar.
export function MisJornadasTab({ visitas }: { visitas: Visita[] }) {
  const [mesRef, setMesRef] = useState(() => new Date());

  const mes = `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, "0")}`;
  const delMes = useMemo(
    () => visitas.filter((v) => v.fecha.slice(0, 7) === mes).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [visitas, mes],
  );

  const fichadas = delMes.filter((v) => v.horaInicioReal && v.horaFinReal);
  const minutosTotales = fichadas.reduce((acc, v) => acc + (minutosFichados(v.horaInicioReal, v.horaFinReal) ?? 0), 0);
  const aCobrar = fichadas.reduce((acc, v) => acc + cobroDe(v), 0);
  const yaPagado = fichadas.filter((v) => v.servicio?.pagoProfesionalEstado === "PAGADO").reduce((acc, v) => acc + cobroDe(v), 0);

  // Rejilla del mes: los días trabajados de un vistazo, que es la escaleta
  // que pedía verse.
  const primerDia = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
  const ultimoDia = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0);
  const offset = (primerDia.getDay() + 6) % 7;
  const porFecha = useMemo(() => {
    const m = new Map<string, Visita[]>();
    for (const v of delMes) {
      const k = v.fecha.slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(v);
    }
    return m;
  }, [delMes]);
  const hoy = clave(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))} aria-label="Mes anterior" className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50">
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-slate-700">
          {MESES[mesRef.getMonth()]} {mesRef.getFullYear()}
        </p>
        <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))} aria-label="Mes siguiente" className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50">
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Lo que se ha trabajado y lo que sale de ahí. La cifra que abre es el
          dinero, porque es lo que se viene a mirar. */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">Vas a cobrar este mes</p>
        <p className="text-4xl font-semibold leading-tight text-slate-900">{euros(aCobrar)}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
          <div>
            <dt className="text-slate-500">Tiempo fichado</dt>
            <dd className="font-semibold text-slate-800">{duracion(minutosTotales)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Jornadas</dt>
            <dd className="font-semibold text-slate-800">{fichadas.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Ya cobrado</dt>
            <dd className={`font-semibold ${yaPagado > 0 ? "text-brand-green-700" : "text-slate-400"}`}>{euros(yaPagado)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-2">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
          {DIAS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`h-${i}`} className="min-h-[46px] rounded-md bg-slate-50" />
          ))}
          {Array.from({ length: ultimoDia.getDate() }).map((_, i) => {
            const d = new Date(mesRef.getFullYear(), mesRef.getMonth(), i + 1);
            const k = clave(d);
            const delDia = porFecha.get(k) ?? [];
            const minutos = delDia.reduce((acc, v) => acc + (minutosFichados(v.horaInicioReal, v.horaFinReal) ?? minutosEntre(v.horaInicioProg, v.horaFinProg) ?? 0), 0);
            return (
              <div
                key={k}
                title={delDia.map((v) => `${v.horaInicioProg}–${v.horaFinProg} ${v.servicio?.solicitud.persona.nombre ?? ""}`).join("\n")}
                className={`min-h-[46px] rounded-md border p-1 text-center ${
                  delDia.length === 0 ? "border-slate-100" : k === hoy ? "border-brand bg-brand-50" : "border-brand-green-200 bg-brand-green-50"
                }`}
              >
                <p className={`text-xs ${k === hoy ? "font-bold text-brand-800" : "text-slate-500"}`}>{i + 1}</p>
                {minutos > 0 && <p className="text-[10px] font-medium text-brand-green-700">{duracion(minutos)}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <ExportarBarra
          total={delMes.length}
          seleccionadas={0}
          onExportar={() =>
            exportarCSV(
              delMes,
              [
                { encabezado: "Fecha", valor: (v) => new Date(v.fecha).toLocaleDateString("es-ES") },
                { encabezado: "Persona", valor: (v) => v.servicio?.solicitud.persona.nombre ?? "" },
                { encabezado: "Servicio", valor: (v) => v.servicio?.solicitud.necesidad.nombre ?? "" },
                { encabezado: "Entrada", valor: (v) => horaDe(v.horaInicioReal) },
                { encabezado: "Salida", valor: (v) => horaDe(v.horaFinReal) },
                { encabezado: "Tiempo", valor: (v) => { const m = minutosFichados(v.horaInicioReal, v.horaFinReal); return m == null ? "" : duracion(m); } },
                { encabezado: "Cobro", valor: (v) => String(cobroDe(v)) },
                { encabezado: "Estado", valor: (v) => v.estado },
              ],
              `mis-fichajes-${mes}`,
            )
          }
        />

        {delMes.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">No tienes jornadas este mes.</p>
        ) : (
          <ul className="space-y-1.5">
            {delMes.map((v) => {
              const minutos = minutosFichados(v.horaInicioReal, v.horaFinReal);
              const pagada = v.servicio?.pagoProfesionalEstado === "PAGADO";
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <IconoNecesidad codigo={v.servicio?.solicitud.necesidad.codigo} className="h-4 w-4 shrink-0 text-slate-400" />
                      {v.servicio?.solicitud.persona.nombre} {v.servicio?.solicitud.persona.apellidos}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(v.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                      {minutos != null ? (
                        <>
                          {" · "}
                          <span className="font-mono">
                            {horaDe(v.horaInicioReal)}–{horaDe(v.horaFinReal)}
                          </span>
                        </>
                      ) : (
                        <span className="text-amber-600"> · sin fichar</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="flex items-center justify-end gap-1 text-sm font-semibold text-slate-800">
                      <IconClock className="h-3.5 w-3.5 text-slate-400" />
                      {minutos != null ? duracion(minutos) : "—"}
                    </p>
                    {/* Una jornada sin fichar todavía no se ha ganado: su
                        importe es una previsión y se dice así, porque
                        tampoco entra en el total de arriba. */}
                    <p
                      className={`flex items-center justify-end gap-1 text-xs ${
                        minutos == null ? "text-slate-400" : pagada ? "text-brand-green-700" : "text-slate-500"
                      }`}
                    >
                      {pagada ? <IconCheck className="h-3 w-3" /> : <IconEuro className="h-3 w-3" />}
                      {euros(cobroDe(v))}
                      {minutos == null ? " previstos" : pagada ? " cobrado" : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
