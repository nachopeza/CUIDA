import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { useFichas } from "../lib/fichas.js";
import { useRefrescoAutomatico } from "../lib/refresco.js";
import { diaDe } from "../lib/fechas.js";
import { euros } from "../lib/economia.js";
import type { ContratoHogar, EstadoTramite, NominaHogar, TramiteHogar } from "../lib/types.js";
import { Avatar } from "./Avatar.js";
import { Modal } from "./Modal.js";
import { AccionesRapidas, Bloque, Dato, Etiqueta, Fila, FichaCabecera, Pestanas, RejillaFicha } from "./ficha.js";
import { Indicadores, TarjetaMarca } from "./identidad.js";
import { ContratoHogarFormulario } from "./ContratoHogarFormulario.js";
import {
  IconAlert,
  IconBan,
  IconBroom,
  IconCheck,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconEuro,
  IconFile,
  IconIdCard,
  IconNote,
  IconPencil,
  IconPhone,
  IconPin,
  IconShield,
  IconSparkle,
} from "./icons.js";

// ---------------------------------------------------------------------------
// La página de un contrato de empleo de hogar
//
// Lo que se trabaja aquí son trámites y nóminas, no jornadas: el alta antes del
// primer día, el contrato, la nómina de cada mes y, al final, la baja y el
// finiquito. Misma estructura que el resto de fichas.
// ---------------------------------------------------------------------------

type Pestana = "tramites" | "nominas" | "datos";

export const ESTADO_HOGAR: Record<string, { etiqueta: string; clase: string }> = {
  EN_TRAMITE: { etiqueta: "En trámite", clase: "bg-amber-100 text-amber-800" },
  ACTIVO: { etiqueta: "Activo", clase: "bg-brand-green-100 text-brand-green-700" },
  FINALIZADO: { etiqueta: "Terminado", clase: "bg-slate-200 text-slate-600" },
};

const ESTADO_TRAMITE: Record<EstadoTramite, { etiqueta: string; punto: string }> = {
  PENDIENTE: { etiqueta: "Pendiente", punto: "border-2 border-slate-300 bg-white" },
  EN_CURSO: { etiqueta: "En curso", punto: "border-2 border-amber-400 bg-amber-100" },
  HECHO: { etiqueta: "Hecho", punto: "bg-brand-green-500 text-white" },
  NO_APLICA: { etiqueta: "No aplica", punto: "bg-slate-200 text-slate-400" },
};

const ESTADO_NOMINA: Record<string, string> = {
  PREPARADA: "bg-amber-100 text-amber-800",
  ENVIADA: "bg-[#dceefc] text-[#0c5770]",
  PAGADA: "bg-brand-green-100 text-brand-green-700",
};

const mesActual = () => diaDe(new Date()).slice(0, 7);
const nombreMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

export function HogarPagina({ contratoId, onVolver, onChanged, etiquetaVolver = "Volver a empleo de hogar" }: { contratoId: string; onVolver: () => void; onChanged: () => void; etiquetaVolver?: string }) {
  const { token } = useAuth();
  const { abrirPersona } = useFichas();
  const [c, setC] = useState<ContratoHogar | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("tramites");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mesNomina, setMesNomina] = useState(mesActual());
  const [terminando, setTerminando] = useState(false);

  async function cargar() {
    try {
      setC(await api.get<ContratoHogar>(`/hogar/${contratoId}`, token));
      setNoEncontrado(false);
    } catch {
      setNoEncontrado(true);
    }
  }

  useEffect(() => {
    setC(null);
    setPestana("tramites");
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);
  useRefrescoAutomatico(cargar, 30000);

  async function intentar(accion: () => Promise<unknown>, hecho?: string) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      if (hecho) setAviso(hecho);
      await cargar();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido hacer.");
    } finally {
      setOcupado(false);
    }
  }

  if (noEncontrado) {
    return (
      <div className="tarjeta p-6 text-sm text-slate-600">
        <button onClick={onVolver} className="mb-3 text-sm text-slate-500 hover:text-slate-800">
          ← {etiquetaVolver}
        </button>
        <p>Este contrato ya no existe.</p>
      </div>
    );
  }
  if (!c) return <p className="p-6 text-sm text-slate-400">Cargando…</p>;

  const est = ESTADO_HOGAR[c.estado];
  const trabajadora = `${c.trabajadoraNombre} ${c.trabajadoraApellidos}`;
  const alta = c.tramites.filter((t) => t.orden < 100);
  const baja = c.tramites.filter((t) => t.orden >= 100);
  const contables = c.tramites.filter((t) => t.estado !== "NO_APLICA");
  const hechos = contables.filter((t) => t.estado === "HECHO").length;
  const progreso = contables.length > 0 ? Math.round((hechos / contables.length) * 100) : 0;
  const altaTrabajadora = c.tramites.find((t) => t.clave === "ALTA_TRABAJADORA");
  const diasParaEmpezar = Math.ceil((new Date(c.fechaInicio).getTime() - Date.now()) / 86400000);
  const sinAltaYEmpieza = c.estado === "EN_TRAMITE" && altaTrabajadora?.estado !== "HECHO" && diasParaEmpezar <= 7;
  const salario = Number(c.salarioBrutoMensual);
  const anual = salario * (12 + c.pagasExtra);
  const nominaDelMes = c.nominas.find((n) => n.mes === mesActual());
  const pendientesPago = c.nominas.filter((n) => n.estado !== "PAGADA");

  const cambiarTramite = (t: TramiteHogar, estado: EstadoTramite) => intentar(() => api.post(`/hogar/${c.id}/tramites/${t.id}`, { estado }, token), `${t.titulo}: ${ESTADO_TRAMITE[estado].etiqueta.toLowerCase()}.`);
  const prepararNomina = (mes: string) =>
    intentar(async () => {
      await api.post(`/hogar/${c.id}/nominas`, { mes }, token);
      setPestana("nominas");
    }, `Nómina de ${nombreMes(mes).toLowerCase()} preparada.`);
  const cambiarNomina = (n: NominaHogar, cambios: Record<string, unknown>, hecho: string) => intentar(() => api.post(`/hogar/${c.id}/nominas/${n.id}`, cambios, token), hecho);

  return (
    <div className="space-y-4">
      <FichaCabecera
        volver={etiquetaVolver}
        onVolver={onVolver}
        antetitulo="Empleo de hogar · gestión integral"
        figura={
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-green-700 shadow-tarjeta ring-4 ring-brand-green-100">
            <IconBroom className="h-8 w-8" />
          </span>
        }
        titulo={`${c.trabajadoraNombre} en casa de ${c.persona.nombre}`}
        etiquetas={<span className={`pastilla ${est.clase}`}>{est.etiqueta}</span>}
        linea={
          <>
            {c.codigo} · {c.estado === "FINALIZADO" && c.fechaFin ? `Del ${fechaLarga(c.fechaInicio)} al ${fechaLarga(c.fechaFin)}` : `Desde el ${fechaLarga(c.fechaInicio)}`} · Empleador: {c.titularNombre}
          </>
        }
        acciones={
          c.estado === "ACTIVO" && !nominaDelMes ? (
            <button onClick={() => void prepararNomina(mesActual())} disabled={ocupado} className="boton-principal">
              <IconFile className="h-4 w-4" /> Preparar nómina de {nombreMes(mesActual()).split(" ")[0].toLowerCase()}
            </button>
          ) : (
            <button onClick={() => setPestana("datos")} className="boton-secundario bg-white/80">
              <IconPencil className="h-4 w-4" /> Editar datos
            </button>
          )
        }
        menu={[
          { etiqueta: "Editar datos", Icono: IconPencil, alPulsar: () => setPestana("datos") },
          { etiqueta: "Terminar la relación laboral", Icono: IconBan, peligro: true, alPulsar: () => setTerminando(true), razon: c.estado === "FINALIZADO" ? "Ya está terminada." : null },
        ]}
      />

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 px-4 py-2.5 text-sm text-brand-green-800" role="status">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 hover:underline">
            Cerrar
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:underline">
            Cerrar
          </button>
        </div>
      )}
      {sinAltaYEmpieza && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>{diasParaEmpezar <= 0 ? "Debería estar trabajando ya" : `Empieza ${diasParaEmpezar === 1 ? "mañana" : `en ${diasParaEmpezar} días`}`}</strong> y todavía no está dada de alta en la
            Seguridad Social. No puede empezar a trabajar sin el alta: es lo primero que hay que hacer.
          </p>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="tarjeta flex items-start gap-4 p-4">
          <Avatar nombre={c.persona.nombre} apellidos={c.persona.apellidos} className="h-14 w-14 !text-sm" />
          <div className="min-w-0 flex-1">
            <Etiqueta>El hogar</Etiqueta>
            <p className="truncate text-base font-semibold text-slate-800">
              {c.persona.nombre} {c.persona.apellidos}
            </p>
            <p className="text-xs text-slate-400">Firma como empleador: {c.titularNombre}{c.titularNif ? ` · ${c.titularNif}` : ""}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {c.persona.telefono && (
                <p className="flex items-center gap-2">
                  <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {c.persona.telefono}
                </p>
              )}
              {(c.persona.direccion || c.persona.municipio) && (
                <p className="flex items-start gap-2">
                  <IconPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="min-w-0">{c.persona.direccion ?? c.persona.municipio}</span>
                </p>
              )}
            </div>
          </div>
          <button onClick={() => abrirPersona(c.persona.id)} className="boton-secundario-sm shrink-0">
            Ver perfil
          </button>
        </div>
        <div className="tarjeta flex items-start gap-4 p-4">
          <Avatar foto={c.profesional?.foto} nombre={c.trabajadoraNombre} apellidos={c.trabajadoraApellidos} className="h-14 w-14 !text-sm" />
          <div className="min-w-0 flex-1">
            <Etiqueta>La trabajadora</Etiqueta>
            <p className="truncate text-base font-semibold text-slate-800">{trabajadora}</p>
            <p className="text-xs text-slate-400">{c.trabajadoraDni ? `DNI/NIE ${c.trabajadoraDni}` : "Falta el DNI o NIE"}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {c.trabajadoraTelefono && (
                <p className="flex items-center gap-2">
                  <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {c.trabajadoraTelefono}
                </p>
              )}
              <p className="flex items-center gap-2">
                <IconIdCard className="h-3.5 w-3.5 text-slate-400" /> {c.trabajadoraNaf ? `Afiliación ${c.trabajadoraNaf}` : <span className="text-amber-700">Sin número de afiliación</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Indicadores
        items={[
          {
            etiqueta: "Trámites hechos",
            valor: `${hechos} de ${contables.length}`,
            detalle: c.estado === "EN_TRAMITE" ? "Para poder empezar" : c.estado === "FINALIZADO" ? "Incluye los de la baja" : "Todo en regla",
            Icono: IconCheckCircle,
            tono: hechos === contables.length ? "verde" : "amber",
            onClick: () => setPestana("tramites"),
          },
          { etiqueta: c.jornada === "INTERNA" ? "Interna" : "Externa", valor: `${c.horasSemanales} h/semana`, detalle: c.horario ?? "Sin horario escrito", Icono: IconClock, tono: "azul" },
          { etiqueta: "Salario bruto al mes", valor: euros(salario), detalle: `${euros(anual)} al año con ${c.pagasExtra} paga${c.pagasExtra === 1 ? "" : "s"}`, Icono: IconEuro, tono: "verde" },
          {
            etiqueta: "Cuota de gestión",
            valor: `${euros(c.cuotaGestionMensual)}/mes`,
            detalle: c.cuotaAlta ? `Alta: ${euros(c.cuotaAlta)} una vez` : "Sin cuota de alta",
            Icono: IconSparkle,
            tono: "azul",
          },
        ]}
      />

      <RejillaFicha>
        <div className="min-w-0 space-y-4">
          <Pestanas
            valor={pestana}
            onCambiar={setPestana}
            opciones={[
              { clave: "tramites", etiqueta: "Trámites" },
              { clave: "nominas", etiqueta: `Nóminas${c.nominas.length ? ` (${c.nominas.length})` : ""}` },
              { clave: "datos", etiqueta: "Datos del contrato" },
            ]}
          />

          {pestana === "tramites" && (
            <>
              <Bloque titulo="Progreso" Icono={IconCheckCircle} tono={progreso === 100 ? "verde" : "amber"}>
                <div className="flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-green-400 to-brand-green-600 transition-all" style={{ width: `${progreso}%` }} />
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-brand-900">{progreso}%</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {c.estado === "EN_TRAMITE"
                    ? "En cuanto el alta en la Seguridad Social y el contrato estén hechos, el contrato pasa a activo y se avisa a la familia."
                    : c.estado === "ACTIVO"
                      ? "Dada de alta y con contrato. Cada mes se prepara la nómina y se envía a la familia."
                      : `Relación terminada${c.motivoFin ? `: ${c.motivoFin}` : ""}. Quedan la baja y el finiquito.`}
                </p>
              </Bloque>
              <ListaTramites titulo="Para empezar a trabajar" tramites={alta} onCambiar={cambiarTramite} ocupado={ocupado} />
              {baja.length > 0 && <ListaTramites titulo="Para terminar" tramites={baja} onCambiar={cambiarTramite} ocupado={ocupado} />}
            </>
          )}

          {pestana === "nominas" && (
            <Bloque
              titulo="Nóminas"
              Icono={IconFile}
              tono="azul"
              accion={
                c.estado === "ACTIVO" ? (
                  <span className="flex items-center gap-2">
                    <input type="month" value={mesNomina} onChange={(e) => setMesNomina(e.target.value)} className="campo !w-auto !py-1.5 !text-xs" />
                    <button onClick={() => void prepararNomina(mesNomina)} disabled={ocupado} className="boton-principal-sm">
                      Preparar
                    </button>
                  </span>
                ) : undefined
              }
            >
              {c.nominas.length === 0 ? (
                <p className="text-sm text-slate-400">{c.estado === "EN_TRAMITE" ? "Las nóminas empiezan cuando esté dada de alta y con contrato." : "Todavía no hay nóminas."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Mes</th>
                        <th className="py-2 pr-3 text-right font-semibold">Bruto</th>
                        <th className="py-2 pr-3 font-semibold">Estado</th>
                        <th className="py-2 text-right font-semibold" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {c.nominas.map((n) => (
                        <tr key={n.id}>
                          <td className="py-2.5 pr-3 font-medium text-slate-700">
                            {nombreMes(n.mes)}
                            {!c.prorrateaPagas && Number(n.bruto) > salario && <span className="ml-2 text-xs font-normal text-brand-green-700">con paga extra</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{euros(n.bruto)}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`pastilla ${ESTADO_NOMINA[n.estado]}`}>{n.estado === "PREPARADA" ? "Preparada" : n.estado === "ENVIADA" ? "Enviada a la familia" : "Pagada"}</span>
                          </td>
                          <td className="py-2.5 text-right">
                            {n.estado === "PREPARADA" && (
                              <button onClick={() => void cambiarNomina(n, { estado: "ENVIADA" }, "Nómina enviada: la familia ya tiene el aviso.")} disabled={ocupado} className="boton-principal-sm">
                                Enviar a la familia
                              </button>
                            )}
                            {n.estado === "ENVIADA" && (
                              <button onClick={() => void cambiarNomina(n, { estado: "PAGADA" }, "Nómina marcada como pagada.")} disabled={ocupado} className="boton-verde-sm">
                                <IconCheck className="h-3.5 w-3.5" /> Pagada
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-slate-500">Importes brutos. Las cotizaciones de la Seguridad Social las gira la Tesorería cada mes a la cuenta de la familia.</p>
                </div>
              )}
            </Bloque>
          )}

          {pestana === "datos" && (
            <Bloque titulo="Datos del contrato" Icono={IconPencil} tono="azul">
              <ContratoHogarFormulario
                contrato={c}
                onCancelar={() => setPestana("tramites")}
                onSaved={async () => {
                  setAviso("Datos guardados.");
                  setPestana("tramites");
                  await cargar();
                  onChanged();
                }}
              />
            </Bloque>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <AccionesRapidas
            acciones={[
              { etiqueta: `Preparar nómina de ${nombreMes(mesActual()).split(" ")[0].toLowerCase()}`, Icono: IconFile, alPulsar: () => void prepararNomina(mesActual()), oculto: c.estado !== "ACTIVO" || !!nominaDelMes },
              { etiqueta: "Ver los trámites", Icono: IconClipboard, alPulsar: () => setPestana("tramites") },
              { etiqueta: "Editar datos", Icono: IconPencil, alPulsar: () => setPestana("datos") },
              { etiqueta: "Ver a la persona", Icono: IconNote, alPulsar: () => abrirPersona(c.persona.id) },
              { etiqueta: "Terminar la relación", Icono: IconBan, alPulsar: () => setTerminando(true), oculto: c.estado === "FINALIZADO" },
            ]}
          />
          <Bloque titulo="Datos económicos" Icono={IconEuro} tono="amber">
            <dl className="space-y-2 text-sm">
              <Fila etiqueta="Cuota de gestión" valor={`${euros(c.cuotaGestionMensual)}/mes`} />
              {c.cuotaAlta != null && <Fila etiqueta="Cuota de alta" valor={euros(c.cuotaAlta)} />}
              <div className="my-2 border-t border-slate-100" />
              <Fila etiqueta="Salario bruto anual" valor={euros(anual)} />
              <Fila etiqueta="Nóminas sin pagar" valor={String(pendientesPago.length)} aviso={pendientesPago.length > 0} />
            </dl>
          </Bloque>
          <Bloque titulo="Las condiciones" Icono={IconShield} tono="verde">
            <div className="grid gap-3">
              <Dato etiqueta="Pagas extra">{c.pagasExtra === 0 ? "Ninguna" : `${c.pagasExtra}${c.prorrateaPagas ? ", prorrateadas" : ""}`}</Dato>
              <Dato etiqueta="Horario">{c.horario ?? "—"}</Dato>
              {c.notas && <Dato etiqueta="Notas">{c.notas}</Dato>}
            </div>
          </Bloque>
          <TarjetaMarca
            titulo={
              <>
                Vosotros cuidáis,
                <br />
                nosotros tramitamos
              </>
            }
            texto="Alta, contrato, nóminas, cotizaciones, vacaciones y baja: la familia sólo tiene que estar en casa."
          />
        </aside>
      </RejillaFicha>

      {terminando && <TerminarModal contrato={c} onClose={() => setTerminando(false)} onHecho={(m) => { setAviso(m); void cargar(); onChanged(); }} />}
    </div>
  );
}

function ListaTramites({ titulo, tramites, onCambiar, ocupado }: { titulo: string; tramites: TramiteHogar[]; onCambiar: (t: TramiteHogar, e: EstadoTramite) => void; ocupado: boolean }) {
  return (
    <Bloque titulo={titulo} Icono={IconClipboard} tono="verde">
      <ol className="space-y-1">
        {tramites.map((t, i) => {
          const e = ESTADO_TRAMITE[t.estado];
          return (
            <li key={t.id} className="flex flex-wrap items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50 sm:flex-nowrap">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${e.punto}`}>
                {t.estado === "HECHO" ? <IconCheck className="h-4 w-4" /> : t.estado === "NO_APLICA" ? "—" : <span className="text-slate-500">{i + 1}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${t.estado === "NO_APLICA" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {t.titulo}
                  {t.imprescindible && <span className="pastilla ml-2 !py-0.5 bg-rose-50 text-rose-700">Imprescindible</span>}
                </p>
                {t.ayuda && <p className="text-xs text-slate-500">{t.ayuda}</p>}
                {t.estado === "HECHO" && t.fecha && <p className="text-xs text-brand-green-700">Hecho el {new Date(t.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</p>}
              </div>
              <select
                value={t.estado}
                onChange={(ev) => onCambiar(t, ev.target.value as EstadoTramite)}
                disabled={ocupado}
                className="campo !w-auto !py-1.5 !text-xs"
                aria-label={`Estado de ${t.titulo}`}
              >
                {(["PENDIENTE", "EN_CURSO", "HECHO", ...(t.imprescindible ? [] : ["NO_APLICA"])] as EstadoTramite[]).map((x) => (
                  <option key={x} value={x}>
                    {ESTADO_TRAMITE[x].etiqueta}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ol>
    </Bloque>
  );
}

function TerminarModal({ contrato, onClose, onHecho }: { contrato: ContratoHogar; onClose: () => void; onHecho: (m: string) => void }) {
  const { token } = useAuth();
  const [fecha, setFecha] = useState(diaDe(new Date()));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hogar/${contrato.id}/finalizar`, { fecha, motivo }, token);
      onHecho("Relación terminada. La baja en la Seguridad Social y el finiquito quedan como trámites pendientes.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido terminar");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Modal title="Terminar la relación laboral" onClose={onClose} size="lg">
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          {contrato.trabajadoraNombre} deja de trabajar en casa de {contrato.persona.nombre}. Se añaden los trámites de salida —baja en la Seguridad Social, finiquito y certificado de
          empresa— y la cuota de gestión deja de girarse a partir del mes siguiente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            Último día de trabajo
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo mt-0.5" />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            Motivo
            <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: la persona ingresa en una residencia" className="campo mt-0.5" />
          </label>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="boton-secundario">
            Volver
          </button>
          <button onClick={() => void confirmar()} disabled={enviando || motivo.trim().length < 3} className="boton-peligro">
            {enviando ? "Un momento…" : "Terminar la relación"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
