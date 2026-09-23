import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { duracion } from "../../lib/economia.js";
import { ETIQUETA_AUSENCIA } from "../../lib/personal.js";
import { IconAlert, IconArrowRight, IconBriefcase, IconCheck, IconClock, IconShield } from "../../components/icons.js";
import type { Ausencia, FichaProfesional, RiesgosCobertura, Servicio, Solicitud } from "../../lib/types.js";

interface Props {
  solicitudes: Solicitud[];
  servicios: Servicio[];
  onAbrirSolicitud: (id: string) => void;
  // Desde una jornada en riesgo se salta a la incidencia que ya está abierta
  // sobre ella: es donde se busca el reemplazo.
  onAbrirIncidencia?: (id: string) => void;
  // El repaso de lo que viene lo trae el panel, que ya recarga cuando algo
  // cambia: pedirlo otra vez aquí daría dos cifras distintas en la misma
  // pantalla, la del menú y la de la lista.
  riesgos: RiesgosCobertura | null;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasAdelante(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Cobertura: demanda frente a capacidad. La pregunta que contesta es "¿voy a
// poder atender lo que tengo comprometido?", y no se podía responder sin
// abrir cuatro pantallas y sumar de cabeza.
//
// La lectura que busca el documento de producto es literalmente ésta:
// "42 servicios demandados / 37 cubiertos / 5 requieren cobertura".
export function CoberturaTab({ solicitudes, servicios, onAbrirSolicitud, onAbrirIncidencia, riesgos }: Props) {
  const { token } = useAuth();
  const [plantilla, setPlantilla] = useState<FichaProfesional[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<FichaProfesional[]>("/personal", token).catch(() => []),
      api.get<Ausencia[]>("/personal/ausencias", token).catch(() => []),
    ]).then(([p, a]) => {
      setPlantilla(p);
      setAusencias(a);
    });
  }, [token]);

  const hoy = hoyISO();
  const limite = diasAdelante(7);

  const demanda = useMemo(() => {
    const vivos = servicios.filter((s) => !["CANCELADO", "CERRADO"].includes(s.estado));
    const sinCubrir = vivos.filter((s) => s.estado === "PENDIENTE");
    const sinConfirmar = vivos.filter((s) => s.estado === "ASIGNADO");
    const cubiertos = vivos.filter((s) => ["CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO"].includes(s.estado));
    return { total: vivos.length, sinCubrir, sinConfirmar, cubiertos };
  }, [servicios]);

  // Las jornadas de los próximos siete días: lo que de verdad hay que cubrir
  // esta semana, no el total histórico.
  const semana = useMemo(() => {
    let programadas = 0;
    let sinProfesional = 0;
    let minutos = 0;
    for (const servicio of servicios) {
      for (const visita of servicio.visitas ?? []) {
        const dia = visita.fecha.slice(0, 10);
        if (dia < hoy || dia > limite) continue;
        if (["REVISADA", "FINALIZADA"].includes(visita.estado)) continue;
        programadas += 1;
        if (!visita.profesionalId && !servicio.profesionalId) sinProfesional += 1;
        const [hi, mi] = (visita.horaInicioProg ?? "0:0").split(":").map(Number);
        const [hf, mf] = (visita.horaFinProg ?? "0:0").split(":").map(Number);
        const dur = hf * 60 + mf - (hi * 60 + mi);
        if (dur > 0) minutos += dur;
      }
    }
    return { programadas, sinProfesional, minutos };
  }, [servicios, hoy, limite]);

  const capacidad = useMemo(() => {
    const activos = plantilla.filter((p) => p.estado === "ACTIVO");
    const disponibles = activos.filter((p) => !p.bloqueado && !p.ausenciaHoy);
    const ausentes = ausencias.filter((a) => a.estado === "APROBADA" && a.hasta.slice(0, 10) >= hoy && a.desde.slice(0, 10) <= limite);
    // Horas de contrato de la semana: sólo de quien está en nómina. Una
    // autónoma no tiene jornada pactada, así que sumarla falsearía el dato.
    const minutosContratados = activos.reduce((acc, p) => acc + (p.horasSemanales ?? 0) * 60, 0);
    return { activos, disponibles, bloqueados: activos.filter((p) => p.bloqueado), ausentes, minutosContratados };
  }, [plantilla, ausencias, hoy, limite]);

  // Cuánta gente tiene servicio asignado ahora mismo.
  const carga = useMemo(() => {
    const porProfesional = new Map<string, number>();
    for (const s of servicios) {
      if (!["CONFIRMADO", "EN_CURSO", "ASIGNADO"].includes(s.estado) || !s.profesionalId) continue;
      porProfesional.set(s.profesionalId, (porProfesional.get(s.profesionalId) ?? 0) + 1);
    }
    return plantilla
      .filter((p) => p.estado === "ACTIVO")
      .map((p) => ({ profesional: p, servicios: porProfesional.get(p.id) ?? 0 }))
      .sort((a, b) => b.servicios - a.servicios);
  }, [servicios, plantilla]);
  const maxCarga = Math.max(1, ...carga.map((c) => c.servicios));

  const porServicio = new Map(solicitudes.filter((s) => s.servicio).map((s) => [s.servicio!.id, s]));

  return (
    <div className="space-y-4">
      {/* La frase de cabecera. Un número suelto no dice si vas bien; esta
          lectura sí. */}
      <section className="tarjeta px-4 py-3">
        <p className="text-lg text-slate-800">
          <span className="font-semibold">{demanda.total}</span> servicios activos ·{" "}
          <span className="font-semibold text-brand-green-700">{demanda.cubiertos.length}</span> cubiertos ·{" "}
          <span className={`font-semibold ${demanda.sinCubrir.length > 0 ? "text-rose-700" : "text-slate-500"}`}>
            {demanda.sinCubrir.length}
          </span>{" "}
          requieren cobertura
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {demanda.sinConfirmar.length > 0 && `${demanda.sinConfirmar.length} esperando confirmación · `}
          {semana.programadas} jornada{semana.programadas === 1 ? "" : "s"} en los próximos 7 días · {duracion(semana.minutos)} de trabajo
        </p>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="tarjeta p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <IconBriefcase className="h-4 w-4 text-slate-400" /> Capacidad del equipo
          </h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Profesionales activos</dt>
              <dd className="text-lg font-semibold text-slate-900">{capacidad.activos.length}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Disponibles hoy</dt>
              <dd className="text-lg font-semibold text-brand-green-700">{capacidad.disponibles.length}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Horas contratadas/semana</dt>
              <dd className="text-lg font-semibold text-slate-900">{duracion(capacidad.minutosContratados)}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Comprometidas esta semana</dt>
              <dd className="text-lg font-semibold text-slate-900">{duracion(semana.minutos)}</dd>
            </div>
          </dl>

          {capacidad.bloqueados.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {capacidad.bloqueados.length} sin poder trabajar por documentación:{" "}
                {capacidad.bloqueados.map((p) => p.nombre).join(", ")}
              </span>
            </p>
          )}
          {capacidad.ausentes.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {capacidad.ausentes.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <IconClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {a.profesional?.nombre} {a.profesional?.apellidos} · {ETIQUETA_AUSENCIA[a.tipo]} hasta el{" "}
                  {new Date(a.hasta).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Carga por profesional</h3>
          {carga.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">Sin profesionales activos.</p>
          ) : (
            <ul className="space-y-1.5">
              {carga.map(({ profesional, servicios: n }) => (
                <li key={profesional.id} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-slate-700">
                      {profesional.nombre} {profesional.apellidos}
                      {profesional.bloqueado && <span className="text-rose-600"> · sin papeles</span>}
                      {profesional.ausenciaHoy && <span className="text-violet-600"> · ausente</span>}
                    </span>
                    <span className="shrink-0 font-medium text-slate-800">
                      {n} servicio{n === 1 ? "" : "s"}
                    </span>
                  </div>
                  {n > 0 && (
                    <span
                      className="mt-0.5 block h-1.5 rounded-full bg-brand"
                      style={{ width: `${Math.max(6, (n / maxCarga) * 100)}%` }}
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Lo que va a fallar, antes de que falle. Una jornada sin cubrir se
          descubría el mismo día, cuando la persona ya se había quedado
          esperando en su casa; esto la saca en cuanto se sabe, con el motivo
          escrito y el sitio donde resolverlo. El backend hace las mismas
          comprobaciones que al asignar, así que el aviso y el bloqueo dicen
          siempre lo mismo. */}
      {riesgos && (
        <section className="tarjeta">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconShield className="h-4 w-4 text-slate-400" /> Jornadas en riesgo
            </h3>
            <span className="text-xs text-slate-400">
              {riesgos.jornadasRevisadas} jornada{riesgos.jornadasRevisadas === 1 ? "" : "s"} revisada
              {riesgos.jornadasRevisadas === 1 ? "" : "s"} · próximos {riesgos.dias} días
            </span>
          </div>
          {riesgos.riesgos.length === 0 ? (
            <p className="flex items-center justify-center gap-1.5 px-3 py-6 text-sm text-brand-green-700">
              <IconCheck className="h-4 w-4" /> Todas las jornadas de los próximos {riesgos.dias} días se pueden prestar.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {riesgos.riesgos.map((r) => {
                const bloquea = r.gravedad === "BLOQUEA";
                return (
                  <li key={r.visitaId} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
                    <span
                      className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${bloquea ? "text-rose-700" : "text-amber-700"}`}
                    >
                      {bloquea ? "No se puede prestar" : "Sin confirmar"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">
                        {new Date(r.fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                        {r.horaInicioProg && ` · ${r.horaInicioProg}–${r.horaFinProg ?? ""}`}
                        <span className="text-slate-400"> · </span>
                        {r.persona}
                        <span className="text-slate-400"> · {r.necesidad}</span>
                      </p>
                      <p className="text-xs text-slate-500">{r.motivo}</p>
                    </div>
                    {/* Si ya hay incidencia abierta, ahí es donde se busca el
                        reemplazo; si no la hay, se va a la solicitud. */}
                    {r.incidencia && onAbrirIncidencia ? (
                      <button
                        onClick={() => onAbrirIncidencia(r.incidencia!.id)}
                        className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:text-brand-800"
                      >
                        {r.incidencia.codigo} <IconArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => onAbrirSolicitud(r.solicitudId)}
                        className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:text-brand-800"
                      >
                        Resolver <IconArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="tarjeta">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <h3 className="text-sm font-semibold text-slate-700">Servicios que requieren cobertura</h3>
          <span className="text-xs text-slate-400">{demanda.sinCubrir.length + demanda.sinConfirmar.length}</span>
        </div>
        {demanda.sinCubrir.length + demanda.sinConfirmar.length === 0 ? (
          <p className="flex items-center justify-center gap-1.5 px-3 py-6 text-sm text-brand-green-700">
            <IconCheck className="h-4 w-4" /> Todo cubierto.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...demanda.sinCubrir, ...demanda.sinConfirmar].map((servicio) => {
              const solicitud = porServicio.get(servicio.id);
              const sinNadie = servicio.estado === "PENDIENTE";
              return (
                <li key={servicio.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span
                    className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${sinNadie ? "text-rose-700" : "text-amber-700"}`}
                  >
                    {sinNadie ? "Sin cubrir" : "Por confirmar"}
                  </span>
                  <button
                    onClick={() => solicitud && onAbrirSolicitud(solicitud.id)}
                    disabled={!solicitud}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm text-slate-800 hover:underline">
                      {solicitud ? `${solicitud.persona.nombre} ${solicitud.persona.apellidos}` : servicio.codigo}
                      <span className="text-slate-400"> · {solicitud?.necesidad.nombre ?? ""}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {solicitud?.plan?.recurrencia ?? "Puntual"}
                      {solicitud?.plan?.horaInicio && ` · ${solicitud.plan.horaInicio}–${solicitud.plan.horaFin}`}
                      {servicio.profesional && ` · propuesto a ${servicio.profesional.nombre}`}
                    </p>
                  </button>
                  <button
                    onClick={() => solicitud && onAbrirSolicitud(solicitud.id)}
                    disabled={!solicitud}
                    className="shrink-0 rounded-md border border-brand px-2.5 py-1 text-xs font-medium text-brand transition hover:bg-brand hover:text-white disabled:opacity-50"
                  >
                    {sinNadie ? "Asignar" : "Recordar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
