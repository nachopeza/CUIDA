import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { SearchBox } from "../../components/SearchBox.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { euros, minutosEntre, porHora } from "../../lib/economia.js";
import type { Servicio } from "../../lib/types.js";

function fecha(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString("es-ES") : null;
}

// "Debe tener un apartado donde pueda buscar solicitudes de su estilo o
// propuestas" (sección Profesional). El profesional necesita ver la ficha
// completa antes de proponerse (sección "debe ver lugar del servicio,
// salario, días, tipo de trabajo, horas, etc. súper completo para saber si
// le interesa y le encaja con su perfil"), no solo un nombre y una fecha.
export function BuscarSolicitudesTab() {
  const { token } = useAuth();
  const [disponibles, setDisponibles] = useState<Servicio[]>([]);
  const [interesados, setInteresados] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");

  async function cargar() {
    setDisponibles(await api.get<Servicio[]>("/servicios/disponibles", token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function proponerse(servicioId: string) {
    await api.post(`/servicios/${servicioId}/interes`, {}, token);
    setInteresados((prev) => new Set(prev).add(servicioId));
  }

  const filtradas = disponibles.filter((s) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    const texto = `${s.codigo} ${s.solicitud?.necesidad.nombre ?? ""} ${s.solicitud?.descripcionLibre ?? ""} ${s.solicitud?.persona.direccion ?? ""}`;
    return texto.toLowerCase().includes(q);
  });

  return (
    <Card title="Solicitudes disponibles">
      {disponibles.length > 0 && (
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por servicio, zona o descripción…" className="mb-3 w-full sm:max-w-xs" />
      )}
      {filtradas.length === 0 && <p className="text-sm text-slate-500">Ahora mismo no hay solicitudes sin cubrir.</p>}

      <div className="space-y-3">
        {filtradas.map((s) => {
          const plan = s.solicitud?.plan;
          const recurrente = s.tipoServicio === "RECURRENTE";
          const indefinido = plan != null && !plan.fechaFin;
          const tarifaPorHora = porHora(s.importeProfesional, minutosEntre(plan?.horaInicio, plan?.horaFin) ?? s.minutosPrevistos);
          return (
            <div key={s.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">
                    <IconoNecesidad codigo={s.solicitud?.necesidad.codigo} className="mr-1.5 inline h-4 w-4 shrink-0 align-text-bottom" />
                    {s.solicitud?.necesidad.nombre}
                  </p>
                  <p className="text-xs text-slate-400">
                    {s.codigo} · {recurrente ? "Recurrente" : "Puntual"}
                    {indefinido && " · indefinido"}
                  </p>
                </div>
                {interesados.has(s.id) ? (
                  <span className="rounded-full bg-brand-green-50 px-3 py-1 text-xs font-medium text-brand-green-700">Avisado a coordinación</span>
                ) : (
                  <button onClick={() => proponerse(s.id)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">
                    Me interesa
                  </button>
                )}
              </div>

              {s.solicitud?.descripcionLibre && <p className="mb-2 text-sm text-slate-600">{s.solicitud.descripcionLibre}</p>}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-slate-400">Lugar</dt>
                  <dd className="text-slate-700">{s.solicitud?.persona.direccion || "A concretar"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Cuándo</dt>
                  <dd className="text-slate-700">
                    {fecha(plan?.fechaInicio) ?? "A concretar"}
                    {plan?.fechaFin ? ` a ${fecha(plan.fechaFin)}` : indefinido ? " · indefinido" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Horario</dt>
                  <dd className="text-slate-700">
                    {plan?.horaInicio && plan.horaFin ? `${plan.horaInicio}-${plan.horaFin}` : plan?.franjaHoraria || "A concretar"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Días</dt>
                  <dd className="text-slate-700">{plan?.recurrencia || (recurrente ? "A concretar" : "Puntual")}</dd>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <dt className="text-slate-400">Lo que cobrarías</dt>
                  {/* Ponía "por hora" en los recurrentes y no lo es: el
                      importe es de la jornada. El precio de la hora se saca
                      de ese importe y su duración. */}
                  <dd className="font-medium text-brand-green-700">
                    {s.tarifaTipo === "VOLUNTARIO"
                      ? "Voluntario (sin remuneración)"
                      : s.importeProfesional != null
                        ? `${euros(s.importeProfesional)}${recurrente ? " por jornada" : " por el servicio"}`
                        : "Pendiente de concretar con coordinación"}
                    {tarifaPorHora && <span className="ml-1.5 font-normal text-slate-500">· {tarifaPorHora}</span>}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
