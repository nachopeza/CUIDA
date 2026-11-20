import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { useFichas } from "../../lib/fichas.js";
import { useRefrescoAutomatico } from "../../lib/refresco.js";
import { diaDe } from "../../lib/fechas.js";
import { euros } from "../../lib/economia.js";
import type { ContratoHogar } from "../../lib/types.js";
import { Avatar } from "../../components/Avatar.js";
import { SearchBox } from "../../components/SearchBox.js";
import { Hojas, Indicadores } from "../../components/identidad.js";
import { ESTADO_HOGAR } from "../../components/HogarPagina.js";
import { NuevoContratoHogarModal } from "../../components/ContratoHogarFormulario.js";
import { IconBroom, IconCheckCircle, IconClipboard, IconEuro, IconFile, IconPlus } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Empleo de hogar
//
// El servicio fijo: la familia contrata a su empleada de hogar y CUIDA se ocupa
// de todo el papeleo a cambio de una cuota mensual. Aquí se ve qué contratos hay,
// cuáles están todavía en trámite y qué nóminas faltan este mes.
// ---------------------------------------------------------------------------

const PASOS = ["Buscamos a la persona", "Alta en la Seguridad Social", "Contrato firmado", "Nómina cada mes", "Vacaciones, bajas y finiquito"];

export function HogarTab() {
  const { token } = useAuth();
  const { abrirHogar } = useFichas();
  const [contratos, setContratos] = useState<ContratoHogar[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"" | "EN_TRAMITE" | "ACTIVO" | "FINALIZADO">("");
  const [nuevo, setNuevo] = useState(false);

  async function cargar() {
    setContratos(await api.get<ContratoHogar[]>("/hogar", token).catch(() => []));
  }
  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRefrescoAutomatico(cargar, 30000);

  const mes = diaDe(new Date()).slice(0, 7);
  const activos = contratos.filter((c) => c.estado === "ACTIVO");
  const enTramite = contratos.filter((c) => c.estado === "EN_TRAMITE");
  const sinNomina = activos.filter((c) => !c.nominas.some((n) => n.mes === mes));
  const cuotas = activos.reduce((a, c) => a + Number(c.cuotaGestionMensual), 0);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return contratos.filter((c) => {
      if (filtro && c.estado !== filtro) return false;
      if (!q) return true;
      return `${c.codigo} ${c.persona.nombre} ${c.persona.apellidos} ${c.trabajadoraNombre} ${c.trabajadoraApellidos} ${c.titularNombre}`.toLowerCase().includes(q);
    });
  }, [contratos, busqueda, filtro]);

  return (
    <div className="space-y-4">
      {/* Qué es este servicio, en una línea y cinco pasos: quien entra aquí por
          primera vez tiene que entender en qué se diferencia de un servicio por
          horas. */}
      <section className="relative overflow-hidden rounded-tarjeta border border-brand-green-100 bg-gradient-to-br from-brand-green-50 via-white to-brand-50 p-5 shadow-tarjeta">
        <Hojas className="-right-2 -top-8 h-40 sm:h-52" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-green-700">Servicio fijo · gestión integral</p>
            <h3 className="mt-1 text-xl font-bold text-brand-900">La familia contrata, nosotros nos ocupamos del resto</h3>
            <p className="mt-1 text-sm text-slate-600">
              La empleada de hogar trabaja para la familia, que es la empleadora. CUIDA lleva todo el papeleo a cambio de una cuota de gestión mensual que va en su factura.
            </p>
          </div>
          <button onClick={() => setNuevo(true)} className="boton-verde">
            <IconPlus className="h-4 w-4" /> Nuevo contrato de hogar
          </button>
        </div>
        <ol className="relative mt-4 flex flex-wrap gap-2">
          {PASOS.map((p, i) => (
            <li key={p} className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-brand-900 shadow-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-green-500 text-[10px] font-bold text-white">{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>
      </section>

      <Indicadores
        items={[
          { etiqueta: "Contratos activos", valor: activos.length, detalle: "Dadas de alta y con contrato", Icono: IconCheckCircle, tono: "verde", onClick: () => setFiltro(filtro === "ACTIVO" ? "" : "ACTIVO") },
          { etiqueta: "En trámite", valor: enTramite.length, detalle: "Todavía no pueden empezar", Icono: IconClipboard, tono: enTramite.length ? "amber" : "verde", onClick: () => setFiltro(filtro === "EN_TRAMITE" ? "" : "EN_TRAMITE") },
          { etiqueta: "Nóminas por preparar", valor: sinNomina.length, detalle: "De este mes", Icono: IconFile, tono: sinNomina.length ? "rose" : "verde" },
          { etiqueta: "Cuotas de gestión", valor: `${euros(cuotas)}/mes`, detalle: "Sin IVA, de los activos", Icono: IconEuro, tono: "azul" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar por persona, trabajadora o código…" className="min-w-[14rem] flex-1 sm:max-w-sm" />
        {(["", "EN_TRAMITE", "ACTIVO", "FINALIZADO"] as const).map((f) => (
          <button
            key={f || "todos"}
            onClick={() => setFiltro(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${filtro === f ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {f ? ESTADO_HOGAR[f].etiqueta : "Todos"}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="tarjeta flex flex-col items-center gap-3 px-4 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-700">
            <IconBroom className="h-7 w-7" />
          </span>
          <p className="text-sm text-slate-500">{contratos.length === 0 ? "Todavía no gestionáis ningún contrato de empleo de hogar." : "Ningún contrato coincide con lo que buscas."}</p>
        </div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Hogar</th>
                <th className="px-3 py-3">Trabajadora</th>
                <th className="px-3 py-3">Jornada</th>
                <th className="px-3 py-3">Trámites</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3 text-right">Cuota</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const contables = c.tramites.filter((t) => t.estado !== "NO_APLICA");
                const hechos = contables.filter((t) => t.estado === "HECHO").length;
                const pct = contables.length ? Math.round((hechos / contables.length) * 100) : 0;
                return (
                  <tr key={c.id} onClick={() => abrirHogar(c.id)} className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-brand-green-50/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar nombre={c.persona.nombre} apellidos={c.persona.apellidos} className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">
                            {c.persona.nombre} {c.persona.apellidos}
                          </p>
                          <p className="text-[11px] text-slate-400">{c.codigo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {c.trabajadoraNombre} {c.trabajadoraApellidos}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {c.horasSemanales} h/sem
                      <span className="block text-xs text-slate-400">{c.jornada === "INTERNA" ? "Interna" : "Externa"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-green-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">
                          {hechos}/{contables.length}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`pastilla ${ESTADO_HOGAR[c.estado].clase}`}>{ESTADO_HOGAR[c.estado].etiqueta}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">{euros(c.cuotaGestionMensual)}/mes</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nuevo && (
        <NuevoContratoHogarModal
          onClose={() => setNuevo(false)}
          onCreado={(c) => {
            void cargar();
            abrirHogar(c.id);
          }}
        />
      )}
    </div>
  );
}
