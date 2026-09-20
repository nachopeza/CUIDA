import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import type { VisitaAgenda } from "../../lib/types.js";

function claveDia(fechaISO: string) {
  return new Date(fechaISO).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function claveFecha(fecha: Date) {
  return fecha.toISOString().slice(0, 10);
}

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Rejilla mensual (sección coordinación: "el calendario se debe poder ver
// también en formato calendario o alguna forma visual"), sin dependencias
// externas: cada celda es un día del mes con chips de las visitas de ese día.
function VistaCalendario({ visitas, onDia }: { visitas: VisitaAgenda[]; onDia: (fecha: string) => void }) {
  const [mesRef, setMesRef] = useState(() => new Date());

  const porFecha = useMemo(() => {
    const mapa = new Map<string, VisitaAgenda[]>();
    for (const v of visitas) {
      const clave = claveFecha(new Date(v.fecha));
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(v);
    }
    return mapa;
  }, [visitas]);

  const primerDiaMes = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
  const ultimoDiaMes = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0);
  // Lunes = 0 ... Domingo = 6, para que la rejilla empiece en lunes.
  const offsetInicio = (primerDiaMes.getDay() + 6) % 7;

  const celdas: (Date | null)[] = [];
  for (let i = 0; i < offsetInicio; i++) celdas.push(null);
  for (let d = 1; d <= ultimoDiaMes.getDate(); d++) celdas.push(new Date(mesRef.getFullYear(), mesRef.getMonth(), d));

  const hoy = claveFecha(new Date());

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
        >
          ← Anterior
        </button>
        <p className="text-sm font-semibold text-slate-700">
          {MESES[mesRef.getMonth()]} {mesRef.getFullYear()}
        </p>
        <button
          onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
        >
          Siguiente →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((dia, i) => {
          if (!dia) return <div key={i} className="min-h-[64px] rounded-md bg-slate-50" />;
          const clave = claveFecha(dia);
          const visitasDelDia = porFecha.get(clave) ?? [];
          return (
            <button
              key={clave}
              onClick={() => onDia(clave)}
              className={`min-h-[64px] rounded-md border p-1 text-left align-top ${
                clave === hoy ? "border-brand bg-brand-green-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-xs font-semibold text-slate-600">{dia.getDate()}</p>
              <div className="mt-0.5 space-y-0.5">
                {visitasDelDia.slice(0, 2).map((v) => (
                  <p key={v.id} className="truncate rounded bg-brand-100 px-1 text-[10px] text-brand-800">
                    {v.horaInicioProg ?? ""} {v.servicio.profesional?.nombre ?? "Sin asignar"}
                  </p>
                ))}
                {visitasDelDia.length > 2 && <p className="text-[10px] text-slate-400">+{visitasDelDia.length - 2} más</p>}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// Escaleta de coordinación (sección 9): qué profesional tiene qué servicio
// qué día, de un vistazo, sin necesidad de entrar visita por visita.
export function CalendarioTab() {
  const { token } = useAuth();
  const [visitas, setVisitas] = useState<VisitaAgenda[]>([]);
  const [vista, setVista] = useState<"lista" | "calendario">("lista");
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  async function cargar() {
    setVisitas(await api.get<VisitaAgenda[]>("/agenda", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function revisar(visitaId: string) {
    await api.post(`/visitas/${visitaId}/revisar`, {}, token);
    await cargar();
  }

  const porDia = new Map<string, VisitaAgenda[]>();
  for (const v of visitas) {
    const clave = claveDia(v.fecha);
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave)!.push(v);
  }

  const visitasDelDiaSeleccionado = diaSeleccionado ? visitas.filter((v) => claveFecha(new Date(v.fecha)) === diaSeleccionado) : [];

  function filaVisita(v: VisitaAgenda) {
    return (
      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 font-mono text-xs text-slate-500">{v.horaInicioProg ?? "--:--"}</span>
          <div>
            <p className="font-medium">
              {v.servicio.profesional ? `${v.servicio.profesional.nombre} ${v.servicio.profesional.apellidos}` : "Sin profesional asignado"}
            </p>
            <p className="text-xs text-slate-400">
              {v.servicio.solicitud.persona.nombre} {v.servicio.solicitud.persona.apellidos} · {v.servicio.solicitud.necesidad.nombre}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EstadoBadge estado={v.estado} />
          {v.estado === "FINALIZADA" && (
            <button onClick={() => revisar(v.id)} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">
              Verificar y archivar
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div>
      <div className="mb-3 flex gap-2 text-sm">
        <button
          onClick={() => setVista("lista")}
          className={`rounded-md px-3 py-1.5 font-medium ${vista === "lista" ? "bg-brand text-white" : "border border-slate-300 bg-white text-slate-600"}`}
        >
          Lista
        </button>
        <button
          onClick={() => setVista("calendario")}
          className={`rounded-md px-3 py-1.5 font-medium ${vista === "calendario" ? "bg-brand text-white" : "border border-slate-300 bg-white text-slate-600"}`}
        >
          Calendario
        </button>
      </div>

      {visitas.length === 0 && <p className="text-sm text-slate-500">Todavía no hay visitas programadas.</p>}

      {vista === "lista" &&
        Array.from(porDia.entries()).map(([dia, visitasDelDia]) => (
          <Card key={dia} title={dia.charAt(0).toUpperCase() + dia.slice(1)}>
            <ul className="divide-y divide-slate-100">{visitasDelDia.map(filaVisita)}</ul>
          </Card>
        ))}

      {vista === "calendario" && (
        <>
          <VistaCalendario visitas={visitas} onDia={setDiaSeleccionado} />
          {diaSeleccionado && (
            <Card title={new Date(diaSeleccionado).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}>
              {visitasDelDiaSeleccionado.length === 0 ? (
                <p className="text-sm text-slate-500">Sin visitas ese día.</p>
              ) : (
                <ul className="divide-y divide-slate-100">{visitasDelDiaSeleccionado.map(filaVisita)}</ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
