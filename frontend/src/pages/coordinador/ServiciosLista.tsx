import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../../components/Avatar.js";
import { EstadoBadge } from "../../components/EstadoBadge.js";
import { SearchBox } from "../../components/SearchBox.js";
import { Pagination, usePaginacion } from "../../components/Pagination.js";
import { IconoNecesidad } from "../../lib/necesidadIconos.js";
import { IconAlert, IconCalendar, IconCheck, IconChat, IconClock, IconPencil, IconPhone, IconPin, IconPlay, IconBriefcase } from "../../components/icons.js";
import { duracion, euros, minutosEntre } from "../../lib/economia.js";
import { diasPorSemana } from "../../lib/recurrencia.js";
import { estadoDeSolicitud, tieneIncidencia, type ClaveEstado } from "../../lib/estadoUnificado.js";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import type { EstadoHistorialEntry, Incidencia, Profesional, Solicitud, Visita } from "../../lib/types.js";

// ---------------------------------------------------------------------------
// Servicios: lo que está en marcha, con quién y qué ha pasado con el dinero
//
// La pantalla de solicitudes y la de servicios compartían tabla y casillas, y
// se leían igual aunque preguntan cosas distintas. Una solicitud es una
// petición que se resuelve; un servicio es un contrato vivo: interesa quién lo
// hace, cuándo es lo próximo, cuánto tiempo a la semana ocupa y cómo va lo
// económico. Es la disposición de la maqueta: cifras arriba, lista a la
// izquierda y, al elegir una fila, su ficha resumida a la derecha.
// ---------------------------------------------------------------------------

type Pestana = "resumen" | "visitas" | "historial" | "economia";

const ROTULO_ESTADO: Record<ClaveEstado, string> = {
  nueva: "Nueva",
  buscando: "Buscando",
  por_confirmar: "Por confirmar",
  en_curso: "En curso",
  por_verificar: "Por verificar",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

function diaClave(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nombreDelDia(iso: string): string {
  const hoy = new Date();
  const d = (n: number) => diaClave(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n));
  const dia = iso.slice(0, 10);
  if (dia === d(0)) return "Hoy";
  if (dia === d(1)) return "Mañana";
  if (dia === d(-1)) return "Ayer";
  const [a, m, j] = dia.split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// La próxima jornada por hacer, o la última que hubo si ya no queda ninguna.
function proximaVisita(s: Solicitud): { visita: Visita; pasada: boolean } | null {
  const visitas = s.servicio?.visitas ?? [];
  const porHacer = visitas
    .filter((v) => ["PROGRAMADA", "CONFIRMADA", "EN_CURSO"].includes(v.estado))
    .sort((a, b) => `${a.fecha}${a.horaInicioProg ?? ""}`.localeCompare(`${b.fecha}${b.horaInicioProg ?? ""}`));
  if (porHacer[0]) return { visita: porHacer[0], pasada: false };
  const ultima = [...visitas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return ultima ? { visita: ultima, pasada: true } : null;
}

// Cuánto tiempo a la semana ocupa: días por sesión × lo que dura cada una.
function duracionSemanal(s: Solicitud): { total: string; detalle: string | null } | null {
  const plan = s.plan;
  const sesion = minutosEntre(plan?.horaInicio, plan?.horaFin) ?? s.servicio?.minutosPrevistos ?? null;
  if (!sesion) return null;
  if (s.servicio?.tipoServicio !== "RECURRENTE") return { total: duracion(sesion), detalle: null };
  const dias = diasPorSemana(plan?.recurrencia);
  if (!dias) return { total: duracion(sesion), detalle: "por jornada" };
  return { total: duracion(dias * sesion), detalle: `${dias} × ${duracion(sesion)}` };
}

function KPI({ icono, valor, etiqueta, tono, activo, onClick }: {
  icono: React.ReactNode;
  valor: number;
  etiqueta: string;
  tono: "azul" | "verde" | "ambar" | "gris" | "rojo";
  activo: boolean;
  onClick: () => void;
}) {
  const circulo = {
    azul: "bg-brand-50 text-brand",
    verde: "bg-brand-green-100 text-brand-green-700",
    ambar: "bg-amber-100 text-amber-600",
    gris: "bg-slate-100 text-slate-500",
    rojo: "bg-rose-100 text-rose-600",
  }[tono];
  const fondo = tono === "rojo" && valor > 0 ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition hover:shadow-sm ${fondo} ${activo ? "ring-2 ring-brand-300" : ""}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${circulo}`}>{icono}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-none text-slate-800">{valor}</span>
        <span className={`mt-1 block truncate text-xs ${tono === "rojo" && valor > 0 ? "text-rose-600" : "text-slate-500"}`}>{etiqueta}</span>
      </span>
    </button>
  );
}

function Selector({ etiqueta, valor, onCambiar, children }: { etiqueta: string; valor: string; onCambiar: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {etiqueta}
      <select value={valor} onChange={(e) => onCambiar(e.target.value)} className="-ml-0.5 mt-0.5 block w-full min-w-[6.5rem] bg-transparent text-sm font-normal normal-case tracking-normal text-slate-700 focus:outline-none">
        {children}
      </select>
    </label>
  );
}

export function ServiciosLista({
  solicitudes,
  profesionales,
  incidencias,
  onAbrirFicha,
  onAbrirPersona,
}: {
  solicitudes: Solicitud[];
  profesionales: Profesional[];
  incidencias: Incidencia[];
  onAbrirFicha: (solicitudId: string) => void;
  onAbrirPersona: (personaId: string) => void;
}) {
  const { token } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<"" | ClaveEstado | "con_incidencia">("");
  const [tipo, setTipo] = useState("");
  const [necesidad, setNecesidad] = useState("");
  const [profesional, setProfesional] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [historial, setHistorial] = useState<EstadoHistorialEntry[] | null>(null);

  // Sólo lo que ya es un servicio: lo que busca profesional o espera respuesta
  // sigue siendo una solicitud.
  const servicios = useMemo(
    () => solicitudes.filter((s) => s.servicio && ["en_curso", "por_verificar", "finalizada"].includes(estadoDeSolicitud(s))),
    [solicitudes],
  );

  const conIncidencia = (s: Solicitud) => tieneIncidencia(s) || incidencias.some((i) => i.servicioId === s.servicio?.id && !["RESUELTA", "CERRADA"].includes(i.estado));

  const cuentas = useMemo(
    () => ({
      todos: servicios.length,
      en_curso: servicios.filter((s) => estadoDeSolicitud(s) === "en_curso").length,
      por_verificar: servicios.filter((s) => estadoDeSolicitud(s) === "por_verificar" || (s.servicio?.visitas ?? []).some((v) => v.estado === "FINALIZADA")).length,
      finalizada: servicios.filter((s) => estadoDeSolicitud(s) === "finalizada").length,
      con_incidencia: servicios.filter(conIncidencia).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [servicios, incidencias],
  );

  const necesidades = useMemo(() => [...new Map(servicios.map((s) => [s.necesidad.id, s.necesidad.nombre])).entries()], [servicios]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return servicios.filter((s) => {
      if (estado === "con_incidencia" && !conIncidencia(s)) return false;
      if (estado === "por_verificar" && !(estadoDeSolicitud(s) === "por_verificar" || (s.servicio?.visitas ?? []).some((v) => v.estado === "FINALIZADA"))) return false;
      if (estado && estado !== "con_incidencia" && estado !== "por_verificar" && estadoDeSolicitud(s) !== estado) return false;
      if (tipo && s.servicio?.tipoServicio !== tipo) return false;
      if (necesidad && s.necesidad.id !== necesidad) return false;
      if (profesional === "__sin__" && s.servicio?.profesionalId) return false;
      if (profesional && profesional !== "__sin__" && s.servicio?.profesionalId !== profesional) return false;
      if (q) {
        const texto = `${s.persona.nombre} ${s.persona.apellidos} ${s.codigo} ${s.necesidad.nombre} ${s.servicio?.profesional?.nombre ?? ""} ${s.servicio?.profesional?.apellidos ?? ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios, busqueda, estado, tipo, necesidad, profesional, incidencias]);

  const { items: pagina, pagina: paginaActual, totalPaginas, setPagina } = usePaginacion(filtrados);

  const seleccionada = servicios.find((s) => s.id === elegida) ?? null;

  // Sin nada elegido, el panel enseña el primero de la lista: una columna
  // vacía a la derecha es espacio perdido.
  useEffect(() => {
    if (!elegida && filtrados[0]) setElegida(filtrados[0].id);
    if (elegida && !servicios.some((s) => s.id === elegida)) setElegida(filtrados[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados.length, servicios.length]);

  // El historial se pide al abrir su pestaña, no para las cincuenta filas.
  useEffect(() => {
    setHistorial(null);
    if (pestana !== "historial" || !seleccionada?.servicio) return;
    api
      .get<{ estadoHistorial?: EstadoHistorialEntry[] }>(`/servicios/${seleccionada.servicio.id}`, token)
      .then((r) => setHistorial(r.estadoHistorial ?? []))
      .catch(() => setHistorial([]));
  }, [pestana, seleccionada?.servicio?.id, token]);

  function alElegir(s: Solicitud) {
    setElegida(s.id);
    setPestana("resumen");
    // Por debajo de 1536 px no hay panel a la derecha (la tabla pierde
    // columnas si comparte el ancho): la fila abre la ficha completa.
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1536px)").matches) onAbrirFicha(s.id);
  }

  return (
    <div className="space-y-4">
      <p className="-mt-2 text-sm text-slate-500">Gestiona todos los servicios activos, sus profesionales, visitas y estado económico.</p>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <KPI icono={<IconBriefcase className="h-5 w-5" />} valor={cuentas.todos} etiqueta="Todos los servicios" tono="azul" activo={estado === ""} onClick={() => setEstado("")} />
        <KPI icono={<IconPlay className="h-5 w-5" />} valor={cuentas.en_curso} etiqueta="En curso" tono="verde" activo={estado === "en_curso"} onClick={() => setEstado(estado === "en_curso" ? "" : "en_curso")} />
        <KPI icono={<IconClock className="h-5 w-5" />} valor={cuentas.por_verificar} etiqueta="Por verificar" tono="ambar" activo={estado === "por_verificar"} onClick={() => setEstado(estado === "por_verificar" ? "" : "por_verificar")} />
        <KPI icono={<IconCheck className="h-5 w-5" />} valor={cuentas.finalizada} etiqueta="Finalizados" tono="gris" activo={estado === "finalizada"} onClick={() => setEstado(estado === "finalizada" ? "" : "finalizada")} />
        <KPI icono={<IconAlert className="h-5 w-5" />} valor={cuentas.con_incidencia} etiqueta="Con incidencia" tono="rojo" activo={estado === "con_incidencia"} onClick={() => setEstado(estado === "con_incidencia" ? "" : "con_incidencia")} />
      </div>

      <div className="flex flex-wrap items-stretch gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por persona, servicio, profesional…" className="min-w-[14rem] flex-1 self-center" />
        <Selector etiqueta="Estado" valor={estado} onCambiar={(v) => setEstado(v as typeof estado)}>
          <option value="">Todos</option>
          {(["en_curso", "por_verificar", "finalizada"] as ClaveEstado[]).map((c) => (
            <option key={c} value={c}>
              {ROTULO_ESTADO[c]}
            </option>
          ))}
          <option value="con_incidencia">Con incidencia</option>
        </Selector>
        <Selector etiqueta="Tipo" valor={tipo} onCambiar={setTipo}>
          <option value="">Todos</option>
          <option value="PUNTUAL">Puntual</option>
          <option value="RECURRENTE">Recurrente</option>
        </Selector>
        <Selector etiqueta="Servicio" valor={necesidad} onCambiar={setNecesidad}>
          <option value="">Todos</option>
          {necesidades.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Profesional" valor={profesional} onCambiar={setProfesional}>
          <option value="">Todos</option>
          <option value="__sin__">Sin asignar</option>
          {profesionales.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.apellidos}
            </option>
          ))}
        </Selector>
        {(busqueda || estado || tipo || necesidad || profesional) && (
          <button
            onClick={() => {
              setBusqueda("");
              setEstado("");
              setTipo("");
              setNecesidad("");
              setProfesional("");
            }}
            className="self-center text-xs text-slate-500 underline decoration-dotted hover:text-slate-700"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          {filtrados.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Ningún servicio coincide con lo que buscas.</p>
          ) : (
            <div className="tarjeta overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Persona / Servicio</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3">Profesional</th>
                    <th className="px-3 py-3">Próxima visita</th>
                    <th className="px-3 py-3">Duración semanal</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((s) => {
                    const pro = s.servicio?.profesional;
                    const prox = proximaVisita(s);
                    const dur = duracionSemanal(s);
                    const dias = s.servicio?.tipoServicio === "RECURRENTE" ? diasPorSemana(s.plan?.recurrencia) : null;
                    const activa = s.id === elegida;
                    const incidencia = conIncidencia(s);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => alElegir(s)}
                        className={`cursor-pointer border-b border-slate-50 last:border-0 transition ${activa ? "bg-brand-green-50/70" : "hover:bg-slate-50/70"}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar foto={null} nombre={s.persona.nombre} apellidos={s.persona.apellidos} className="h-9 w-9" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-800">
                                {s.persona.nombre} {s.persona.apellidos}
                              </p>
                              <p className="truncate text-xs text-slate-500">{s.necesidad.nombre}</p>
                              <p className="text-[11px] text-slate-400">{s.codigo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {s.servicio?.tipoServicio === "RECURRENTE" ? "Recurrente" : "Puntual"}
                          {dias != null && <span className="block text-xs text-slate-400">{dias} {dias === 1 ? "día" : "días"}/semana</span>}
                          {s.servicio?.tipoServicio === "RECURRENTE" && s.plan && !s.plan.fechaFin && <span className="block text-[11px] text-slate-400">Indefinido</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {incidencia ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600">
                              <IconAlert className="h-3.5 w-3.5" /> Con incidencia
                            </span>
                          ) : (
                            <EstadoBadge estado={s.servicio!.estado === "CONFIRMADO" ? "EN_CURSO" : s.servicio!.estado} />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {pro ? (
                            <div className="flex items-center gap-2">
                              <Avatar foto={pro.foto} nombre={pro.nombre} apellidos={pro.apellidos} className="h-8 w-8" />
                              <span className="text-slate-700">
                                {pro.nombre}
                                <span className="block">{pro.apellidos}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-700">Sin asignar</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {prox ? (
                            <>
                              <span className={`block ${prox.pasada ? "text-slate-500" : "font-medium text-brand-800"}`}>{nombreDelDia(prox.visita.fecha)}</span>
                              <span className="block text-xs text-slate-500">
                                {prox.visita.horaInicioProg && prox.visita.horaFinProg ? `${prox.visita.horaInicioProg} - ${prox.visita.horaFinProg}` : ""}
                                {prox.pasada ? " · última" : ""}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {dur ? (
                            <>
                              <span className="block text-slate-700">{dur.total}</span>
                              {dur.detalle && <span className="block text-xs text-slate-400">({dur.detalle})</span>}
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {<Pagination pagina={paginaActual} totalPaginas={totalPaginas} onChange={setPagina} total={filtrados.length} />}
            </div>
          )}
        </div>

        {/* La ficha resumida de la fila elegida. En pantalla estrecha no
            cabe, y ahí la fila abre la ficha completa. */}
        <aside className="hidden 2xl:block">
          {seleccionada ? (
            <PanelServicio
              s={seleccionada}
              pestana={pestana}
              onPestana={setPestana}
              historial={historial}
              onAbrirFicha={() => onAbrirFicha(seleccionada.id)}
              onAbrirPersona={() => onAbrirPersona(seleccionada.persona.id)}
            />
          ) : (
            <p className="tarjeta px-4 py-8 text-center text-sm text-slate-400">Elige un servicio para ver su resumen.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function PanelServicio({ s, pestana, onPestana, historial, onAbrirFicha, onAbrirPersona }: {
  s: Solicitud;
  pestana: Pestana;
  onPestana: (p: Pestana) => void;
  historial: EstadoHistorialEntry[] | null;
  onAbrirFicha: () => void;
  onAbrirPersona: () => void;
}) {
  const srv = s.servicio!;
  const pro = srv.profesional;
  const prox = proximaVisita(s);
  const visitas = [...(srv.visitas ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const dias = srv.tipoServicio === "RECURRENTE" ? diasPorSemana(s.plan?.recurrencia) : null;
  const dur = duracionSemanal(s);

  // Lo económico del mes en curso, sumado de lo que el motor de tiempo dejó
  // escrito en cada jornada: ninguna pantalla vuelve a calcularlo por su cuenta.
  const mes = diaClave(new Date()).slice(0, 7);
  const delMes = visitas.filter((v) => v.fecha.slice(0, 7) === mes && v.importeCliente != null);
  const suma = (f: (v: Visita) => number) => delMes.reduce((a, v) => a + f(v), 0);
  const generado = suma((v) => Number(v.importeCliente ?? 0));
  const sinFacturar = suma((v) => (v.facturaId ? 0 : Number(v.importeCliente ?? 0)));
  const aProfesional = suma((v) => Number(v.importeProfesional ?? 0));
  const margen = suma((v) => Number(v.importeCuida ?? 0));

  const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
    { clave: "resumen", etiqueta: "Resumen" },
    { clave: "visitas", etiqueta: "Visitas" },
    { clave: "historial", etiqueta: "Historial" },
    { clave: "economia", etiqueta: "Economía" },
  ];

  return (
    <div className="tarjeta sticky top-4 p-4">
      <div className="flex items-start gap-3">
        <Avatar foto={null} nombre={s.persona.nombre} apellidos={s.persona.apellidos} className="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <button onClick={onAbrirPersona} className="text-left">
            <p className="truncate text-base font-semibold text-slate-800 hover:underline">
              {s.persona.nombre} {s.persona.apellidos}
            </p>
          </button>
          <p className="text-xs text-slate-400">{s.persona.codigo}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            {s.persona.telefono && (
              <span className="flex items-center gap-1">
                <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {s.persona.telefono}
              </span>
            )}
            {(s.persona.municipio || s.persona.direccion) && (
              <span className="flex items-center gap-1">
                <IconPin className="h-3.5 w-3.5 text-slate-400" /> {s.persona.municipio ?? s.persona.direccion}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-4 border-b border-slate-100 text-sm">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            onClick={() => onPestana(p.clave)}
            className={`-mb-px border-b-2 pb-2 transition ${pestana === p.clave ? "border-brand-green-600 font-medium text-brand-800" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {pestana === "resumen" && (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green-100 text-brand-green-700">
                <IconoNecesidad codigo={s.necesidad.codigo} className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{s.necesidad.nombre}</p>
                <p className="text-xs text-slate-500">
                  {srv.tipoServicio === "RECURRENTE" ? "Recurrente" : "Puntual"}
                  {dias != null ? ` · ${dias} ${dias === 1 ? "día" : "días"}/semana` : ""}
                </p>
                <p className="text-[11px] text-slate-400">{s.codigo}</p>
              </div>
              <EstadoBadge estado={srv.estado === "CONFIRMADO" ? "EN_CURSO" : srv.estado} />
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <IconBriefcase className="h-3.5 w-3.5 text-slate-400" /> Profesional
              </p>
              {pro ? (
                <div className="flex items-center gap-2.5">
                  <Avatar foto={pro.foto} nombre={pro.nombre} apellidos={pro.apellidos} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">
                      {pro.nombre} {pro.apellidos}
                    </p>
                    {pro.telefono && <p className="text-xs text-slate-500">Tel. {pro.telefono}</p>}
                  </div>
                  {pro.telefono && (
                    <a href={`tel:${pro.telefono.replace(/\s/g, "")}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-700 hover:bg-brand-green-100" title="Llamar">
                      <IconPhone className="h-4 w-4" />
                    </a>
                  )}
                  <button onClick={onAbrirFicha} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-700 hover:bg-brand-green-100" title="Abrir la ficha">
                    <IconChat className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-amber-700">Todavía sin profesional asignado.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <IconCalendar className="h-3.5 w-3.5 text-slate-400" /> Horario
                </p>
                <p className="text-xs text-slate-600">{s.plan?.recurrencia ?? "Un solo día"}</p>
                <p className="text-sm text-slate-800">
                  {s.plan?.horaInicio && s.plan.horaFin ? `${s.plan.horaInicio} – ${s.plan.horaFin}` : s.plan?.franjaHoraria ?? "—"}
                  {dur && <span className="text-xs text-slate-400"> ({duracion(minutosEntre(s.plan?.horaInicio, s.plan?.horaFin) ?? 0)})</span>}
                </p>
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <IconClock className="h-3.5 w-3.5 text-slate-400" /> {prox?.pasada ? "Última visita" : "Próxima visita"}
                </p>
                {prox ? (
                  <>
                    <p className="text-sm text-slate-800">
                      {nombreDelDia(prox.visita.fecha)}
                      {prox.visita.horaInicioProg && prox.visita.horaFinProg ? ` · ${prox.visita.horaInicioProg} – ${prox.visita.horaFinProg}` : ""}
                    </p>
                    <EstadoBadge estado={prox.visita.estado} />
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Sin jornadas</p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Economía <span className="font-normal text-slate-400">(este mes)</span>
              </p>
              <Cifras generado={generado} sinFacturar={sinFacturar} aProfesional={aProfesional} margen={margen} hay={delMes.length > 0} />
            </div>
          </>
        )}

        {pestana === "visitas" && (
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
            {visitas.length === 0 && <li className="text-sm text-slate-400">Todavía no hay jornadas.</li>}
            {visitas.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-700">
                  <span className="font-medium">{new Date(v.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</span>
                  {v.horaInicioProg && v.horaFinProg ? ` · ${v.horaInicioProg}–${v.horaFinProg}` : ""}
                  <span className="block text-slate-400">{v.codigo}</span>
                </span>
                <EstadoBadge estado={v.estado} />
              </li>
            ))}
          </ul>
        )}

        {pestana === "historial" && (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
            {historial == null && <li className="text-sm text-slate-400">Cargando…</li>}
            {historial?.length === 0 && <li className="text-sm text-slate-400">Sin cambios registrados.</li>}
            {historial?.map((h) => (
              <li key={h.id} className="border-l-2 border-slate-200 pl-3 text-xs">
                <p className="text-slate-400">{new Date(h.createdAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                <p className="text-slate-700">
                  {h.estadoAnterior && h.estadoAnterior !== h.estadoNuevo ? `${h.estadoAnterior.replace(/_/g, " ").toLowerCase()} → ` : ""}
                  <span className="font-medium">{h.estadoNuevo.replace(/_/g, " ").toLowerCase()}</span>
                </p>
                {h.motivo && <p className="text-slate-500">{h.motivo}</p>}
              </li>
            ))}
          </ul>
        )}

        {pestana === "economia" && (
          <>
            <Cifras generado={generado} sinFacturar={sinFacturar} aProfesional={aProfesional} margen={margen} hay={delMes.length > 0} />
            <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-slate-100 pt-2">
              {visitas
                .filter((v) => v.importeCliente != null)
                .map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">
                      {new Date(v.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · {v.codigo}
                      {v.ajusteEstado === "PENDIENTE" && <span className="ml-1 text-amber-600">· tiempo sin decidir</span>}
                    </span>
                    <span className="tabular-nums text-slate-800">{euros(v.importeCliente)}</span>
                  </li>
                ))}
              {visitas.every((v) => v.importeCliente == null) && <li className="text-xs text-slate-400">Todavía no hay jornadas cerradas con importe.</li>}
            </ul>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
        <button onClick={() => onPestana("visitas")} className="boton-principal-sm flex-1">
          Ver todas las visitas →
        </button>
        <button onClick={onAbrirFicha} className="boton-secundario-sm flex flex-1 items-center justify-center gap-1.5">
          <IconPencil className="h-3.5 w-3.5" /> Editar servicio
        </button>
      </div>
    </div>
  );
}

function Cifras({ generado, sinFacturar, aProfesional, margen, hay }: { generado: number; sinFacturar: number; aProfesional: number; margen: number; hay: boolean }) {
  if (!hay) return <p className="text-xs text-slate-400">Este mes todavía no hay jornadas cerradas con importe.</p>;
  const celdas = [
    { etiqueta: "Generado", valor: generado },
    { etiqueta: "Sin facturar", valor: sinFacturar },
    { etiqueta: "A la profesional", valor: aProfesional },
    { etiqueta: "Margen CUIDA", valor: margen },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {celdas.map((c) => (
        <div key={c.etiqueta} className="rounded-lg bg-brand-50/60 px-3 py-2">
          <p className="text-[11px] text-slate-500">{c.etiqueta}</p>
          <p className="text-base font-semibold text-slate-800">{euros(c.valor)}</p>
        </div>
      ))}
    </div>
  );
}
