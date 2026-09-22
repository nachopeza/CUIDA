import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { ActividadFeed } from "./ActividadTab.js";
import { IconAlert, IconBriefcase, IconCalendar, IconClipboard, IconReceipt, IconUsers } from "../../components/icons.js";
import { ICONOS_NECESIDAD } from "../../lib/necesidadIconos.js";
import type { Factura, Incidencia, Profesional, Servicio, Solicitud } from "../../lib/types.js";

interface Props {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  incidencias: Incidencia[];
  onIrA: (tab: string, filtro?: string) => void;
}

interface Atencion {
  label: string;
  detalle: string;
  valor: number;
  icon: (p: { className?: string }) => JSX.Element;
  tono: "rose" | "amber";
  onClick: () => void;
}

function mesActualISO() {
  return new Date().toISOString().slice(0, 7);
}

// Saludo según la hora (sección "cuando entras debe saludarte buenos días,
// buenas tardes o buenas noches").
function saludo(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

// Escritorio del panel de coordinación: lo primero es el saludo y lo que
// necesita acción ahora mismo (sección "prioriza los avisos de abajo... pero
// con nuevas solicitudes"); debajo, los paneles de situación. Las casillas
// de conteo por grupo viven en la pestaña Solicitudes, no aquí.
export function ResumenTab({ solicitudes, servicios, incidencias, onIrA }: Props) {
  const { token, usuario } = useAuth();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Factura[]>("/facturas", token),
      api.get<Profesional[]>("/profesionales", token),
      api.get<{ nombre: string | null }>("/cuenta/me", token),
    ]).then(([facs, pros, me]) => {
      setFacturas(facs);
      setProfesionales(pros);
      setNombre(me.nombre);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelacionesPendientes = incidencias.filter((i) => i.tipo === "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado)).length;
  const incidenciasAbiertas = incidencias.filter((i) => i.tipo !== "SOLICITUD_CANCELACION" && !["RESUELTA", "CERRADA"].includes(i.estado)).length;
  const serviciosDisponibles = servicios.filter((s) => s.estado === "PENDIENTE" && !s.profesionalId).length;
  const visitasPorVerificar = solicitudes.reduce(
    (acc, s) => acc + (s.servicio?.visitas?.filter((v) => v.estado === "FINALIZADA").length ?? 0),
    0,
  );
  const profesionalesPendientes = profesionales.filter((p) => p.estado === "PENDIENTE").length;
  // Solicitudes nuevas todavía sin revisar: son lo primero que debe atender
  // coordinación, así que encabezan los avisos.
  const nuevasSolicitudes = solicitudes.filter((s) => !s.servicio && s.estado !== "CANCELADA").length;

  const atencion: Atencion[] = [
    {
      label: "Solicitudes nuevas",
      detalle: "pendientes de revisar y aceptar",
      valor: nuevasSolicitudes,
      icon: IconClipboard,
      tono: "amber" as const,
      onClick: () => onIrA("solicitudes", "nueva"),
    },
    {
      label: "Cancelaciones pendientes",
      detalle: "esperando que las corrobores con la familia",
      valor: cancelacionesPendientes,
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("incidencias"),
    },
    {
      label: "Incidencias abiertas",
      detalle: "sin resolver",
      valor: incidenciasAbiertas,
      icon: IconAlert,
      tono: "rose" as const,
      onClick: () => onIrA("incidencias"),
    },
    {
      label: "Servicios sin cubrir",
      detalle: "publicados, esperando un profesional",
      valor: serviciosDisponibles,
      icon: IconBriefcase,
      tono: "amber" as const,
      onClick: () => onIrA("solicitudes", "buscando"),
    },
    {
      label: "Visitas por verificar",
      detalle: "finalizadas, pendientes de archivar",
      valor: visitasPorVerificar,
      icon: IconCalendar,
      tono: "amber" as const,
      onClick: () => onIrA("calendario"),
    },
    {
      label: "Profesionales por verificar",
      detalle: "de alta, esperando revisión de coordinación",
      valor: profesionalesPendientes,
      icon: IconUsers,
      tono: "amber" as const,
      onClick: () => onIrA("profesionales"),
    },
  ].filter((a) => a.valor > 0);

  const hoy = new Date().toISOString().slice(0, 10);
  const proximasVisitas = useMemo(() => {
    return servicios
      .flatMap((s) => (s.visitas ?? []).map((v) => ({ visita: v, servicio: s })))
      .filter(({ visita }) => visita.fecha >= hoy && visita.estado === "PROGRAMADA")
      .sort((a, b) => a.visita.fecha.localeCompare(b.visita.fecha))
      .slice(0, 5);
  }, [servicios, hoy]);

  const mesActual = mesActualISO();
  const facturasMes = useMemo(() => facturas.filter((f) => f.mes === mesActual), [facturas, mesActual]);
  const totalFacturadoMes = facturasMes.reduce((acc, f) => acc + Number(f.totalConIva ?? f.importeTotal), 0);
  const pendienteCobroMes = facturasMes.filter((f) => f.estado !== "PAGADA").reduce((acc, f) => acc + Number(f.totalConIva ?? f.importeTotal), 0);
  const comisionMes = facturasMes.reduce((acc, f) => acc + Number(f.comisionTotal), 0);

  const profesionalesActivos = profesionales.filter((p) => p.estado === "ACTIVO").length;
  const profesionalesOcupados = useMemo(() => {
    const ocupadosIds = new Set(
      servicios.filter((s) => ["CONFIRMADO", "EN_CURSO"].includes(s.estado) && s.profesionalId).map((s) => s.profesionalId as string),
    );
    return ocupadosIds.size;
  }, [servicios]);

  const distribucionNecesidad = useMemo(() => {
    const conteo = new Map<string, { nombre: string; codigo: string; valor: number }>();
    for (const s of solicitudes) {
      const actual = conteo.get(s.necesidad.id) ?? { nombre: s.necesidad.nombre, codigo: s.necesidad.codigo, valor: 0 };
      actual.valor += 1;
      conteo.set(s.necesidad.id, actual);
    }
    return Array.from(conteo.values())
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);
  }, [solicitudes]);
  const maxDistribucion = Math.max(1, ...distribucionNecesidad.map((d) => d.valor));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">
          {saludo()}
          {nombre ? `, ${nombre.split(" ")[0]}` : ""} 👋
        </h2>
        <p className="text-sm text-slate-500">
          {atencion.length === 0
            ? "No tienes nada pendiente de tu acción ahora mismo."
            : `Tienes ${atencion.reduce((acc, a) => acc + a.valor, 0)} cosas esperándote.`}
          {usuario?.email && <span className="text-slate-400"> · {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</span>}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Necesita tu atención</h3>
        {atencion.length === 0 ? (
          <div className="rounded-lg border border-brand-green-200 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">
            Todo al día — no hay nada pendiente de tu acción ahora mismo.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {atencion.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-slate-50 ${
                  a.tono === "rose" ? "border-rose-200 bg-rose-50/40" : "border-amber-200 bg-amber-50/40"
                }`}
              >
                <a.icon className={`mt-0.5 h-5 w-5 shrink-0 ${a.tono === "rose" ? "text-rose-600" : "text-amber-600"}`} />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {a.valor} {a.label.toLowerCase()}
                  </p>
                  <p className="text-xs text-slate-500">{a.detalle}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconCalendar className="h-4 w-4 text-slate-400" /> Próxima agenda
            </h3>
            <button onClick={() => onIrA("calendario")} className="text-xs font-medium text-brand hover:text-brand-800">
              Ver todo
            </button>
          </div>
          {proximasVisitas.length === 0 ? (
            <p className="text-xs text-slate-400">Sin visitas programadas próximamente.</p>
          ) : (
            <ul className="space-y-1.5">
              {proximasVisitas.map(({ visita, servicio }) => (
                <li key={visita.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-slate-600">
                    {servicio.solicitud?.persona.nombre} {servicio.solicitud?.persona.apellidos} · {servicio.solicitud?.necesidad.nombre}
                  </span>
                  <span className="shrink-0 font-medium text-slate-800">
                    {new Date(visita.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}
                    {visita.horaInicioProg && ` ${visita.horaInicioProg}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconReceipt className="h-4 w-4 text-slate-400" /> Facturación de este mes
            </h3>
            <button onClick={() => onIrA("facturacion")} className="text-xs font-medium text-brand hover:text-brand-800">
              Ver todo
            </button>
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Facturado</dt>
              <dd className="font-semibold text-slate-800">{totalFacturadoMes.toFixed(2)} €</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Pendiente de cobro</dt>
              <dd className={`font-semibold ${pendienteCobroMes > 0 ? "text-amber-600" : "text-slate-800"}`}>{pendienteCobroMes.toFixed(2)} €</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Comisión CUIDA</dt>
              <dd className="font-semibold text-slate-800">{comisionMes.toFixed(2)} €</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
              <dt className="text-slate-500">Facturas este mes</dt>
              <dd className="font-semibold text-slate-800">{facturasMes.length}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconUsers className="h-4 w-4 text-slate-400" /> Plantilla de profesionales
            </h3>
            <button onClick={() => onIrA("profesionales")} className="text-xs font-medium text-brand hover:text-brand-800">
              Ver todo
            </button>
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Activos</dt>
              <dd className="font-semibold text-slate-800">{profesionalesActivos}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Ocupados ahora</dt>
              <dd className="font-semibold text-slate-800">{profesionalesOcupados}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Disponibles</dt>
              <dd className="font-semibold text-brand-green-700">{Math.max(0, profesionalesActivos - profesionalesOcupados)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
              <dt className="text-slate-500">Pendientes de verificar</dt>
              <dd className={`font-semibold ${profesionalesPendientes > 0 ? "text-amber-600" : "text-slate-800"}`}>{profesionalesPendientes}</dd>
            </div>
          </dl>
        </div>
      </div>

      {distribucionNecesidad.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Qué se está pidiendo más</h3>
          <div className="space-y-1.5">
            {distribucionNecesidad.map((d) => (
              <button
                key={d.codigo}
                onClick={() => onIrA("solicitudes")}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-slate-50"
              >
                <span className="w-24 shrink-0 truncate text-slate-600">
                  {ICONOS_NECESIDAD[d.codigo] ?? "❓"} {d.nombre}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-brand-green-200" style={{ width: `${(d.valor / maxDistribucion) * 100}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right font-semibold text-slate-800">{d.valor}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Actividad reciente</h3>
          <button onClick={() => onIrA("actividad")} className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-800">
            <IconClipboard className="h-3.5 w-3.5" /> Ver todo
          </button>
        </div>
        <ActividadFeed limit={6} sinTitulo />
      </div>
    </div>
  );
}
