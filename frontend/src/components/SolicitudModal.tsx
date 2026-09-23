import { useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Modal } from "./Modal.js";
import { SearchBox } from "./SearchBox.js";
import { IconoNecesidad } from "../lib/necesidadIconos.js";
import { IconArrowLeft, IconArrowRight, IconCheck, IconInfinity } from "./icons.js";
import { aISO, etiquetaDia, proximosDias } from "../lib/fechas.js";
import type { Necesidad, Persona } from "../lib/types.js";

const FRANJAS = ["Mañana", "Tarde", "Todo el día"];

// Presets habituales (sección "si fuera que Herminia necesita una persona
// durante 5 días, o dos meses ¿cómo lo selecciona?"): cubren el rango
// típico con un toque; el número exacto siempre queda editable a mano.
const DURACIONES = [
  { label: "1 día", dias: 1 },
  { label: "1 semana", dias: 7 },
  { label: "2 semanas", dias: 14 },
  { label: "1 mes", dias: 30 },
  { label: "2 meses", dias: 60 },
];

interface Props {
  necesidad?: Necesidad;
  necesidades?: Necesidad[];
  personaId?: string;
  personas?: Persona[];
  onClose: () => void;
  onCreated: () => void;
}

// Los cuatro pasos del alta, en orden. Uno a la vez: el formulario entero
// de antes cabía en una pantalla, pero era fácil dejarse un hueco y no
// enterarse hasta pulsar guardar — y entonces había que buscar dónde.
const PASOS = ["Para quién", "Qué necesita", "Cuándo", "Confirmar"] as const;

// La cinta de pasos. Enseña en qué paso vas, lo que ya has decidido en cada
// uno y deja volver atrás a los ya hechos. Los que quedan no son clicables:
// no se puede elegir "cuándo" sin haber dicho para quién.
function Pasos({ actual, hechos, ir }: { actual: number; hechos: string[]; ir: (i: number) => void }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5">
      {PASOS.map((titulo, i) => {
        const pasado = i < actual;
        const aqui = i === actual;
        return (
          <li key={titulo} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => pasado && ir(i)}
              disabled={!pasado}
              aria-current={aqui ? "step" : undefined}
              className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
                aqui
                  ? "border-brand bg-brand-50"
                  : pasado
                    ? "border-slate-200 bg-white hover:bg-slate-50"
                    : "border-slate-100 bg-slate-50"
              }`}
            >
              <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${aqui ? "text-brand-800" : pasado ? "text-slate-500" : "text-slate-300"}`}>
                {/* Número mientras está por hacer, visto bueno cuando ya está:
                    el estado del paso se ve sin leer nada. */}
                {pasado ? (
                  <IconCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${aqui ? "bg-brand text-white" : "bg-slate-200 text-slate-400"}`}>
                    {i + 1}
                  </span>
                )}
                {titulo}
              </span>
              {/* Lo ya decidido, a la vista: no hace falta volver atrás para
                  comprobar a quién se le estaba creando la solicitud.
                  Los pasos que faltan no escriben nada —ni en transparente—:
                  un texto invisible sigue estando ahí para un lector de
                  pantalla, y leería el nombre de alguien sin venir a cuento. */}
              <span className="mt-0.5 block min-h-[1rem] truncate text-xs text-slate-700">{pasado ? hechos[i] : ""}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
        activo ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

// Dos variantes en un mismo componente (sección "debe ser diferente para
// personas mayores que para coordinación"): botones grandes y pasos guiados
// cuando lo usa la persona/familiar, y para coordinación los mismos pasos
// pero compactos, con el servicio elegible de un vistazo por su icono en
// vez de un desplegable gris.
export function SolicitudModal({ necesidad, necesidades, personaId, personas, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const esCoordinacion = Boolean(necesidades && personas);
  // Nada preseleccionado cuando hay que elegir: dejaba marcada a la primera
  // persona de la lista y al primer servicio del catálogo, así que pulsando
  // "siguiente" dos veces se creaba una solicitud a quien no era y de lo que no
  // era, sin haber tocado nada. Cuando la pantalla ya sabe de quién se trata
  // (la persona entra desde su propia ficha) sí viene dado.
  // Con una sola persona a su cargo no hay nada que elegir y se da por hecho;
  // con varias hay que preguntar, porque enviar la solicitud en nombre de la
  // persona equivocada es un error que nadie detecta hasta que llega alguien a
  // su casa. Antes se cogía siempre la primera de la lista.
  const [personaSel, setPersonaSel] = useState(personaId ?? (personas?.length === 1 ? personas[0].id : ""));
  const [necesidadSel, setNecesidadSel] = useState(necesidad?.id ?? "");
  const [fecha, setFecha] = useState(() => aISO(new Date()));
  const [dias, setDias] = useState(1);
  const [indefinido, setIndefinido] = useState(false);
  const [franja, setFranja] = useState("Mañana");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [masOpciones, setMasOpciones] = useState(false);
  const [buscaPersona, setBuscaPersona] = useState("");
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const diasVisibles = proximosDias(masOpciones ? 14 : 3);
  const necesidadNombre = necesidad?.nombre ?? necesidades?.find((n) => n.id === necesidadSel)?.nombre ?? "";
  const personaNombre = personas?.find((p) => p.id === personaSel);

  const personasFiltradas = (personas ?? []).filter((p) => {
    const q = buscaPersona.trim().toLowerCase();
    return !q || `${p.nombre} ${p.apellidos} ${p.codigo}`.toLowerCase().includes(q);
  });

  // Lo decidido en cada paso, en dos palabras, para la cinta de arriba.
  const hechos = [
    personaNombre ? `${personaNombre.nombre} ${personaNombre.apellidos}` : "",
    necesidadNombre,
    `${new Date(fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${indefinido ? "indefinido" : `${dias} ${dias === 1 ? "día" : "días"}`}`,
    "",
  ];

  // Qué falta para poder pasar al siguiente. Un paso no se puede saltar con un
  // hueco: el formulario entero de antes te dejaba llegar al final sin
  // persona y solo se enteraba al guardar.
  const faltaEnPaso: (string | null)[] = [
    personaSel ? null : "Elige a quién se le hace la solicitud",
    necesidadSel ? null : "Elige qué servicio necesita",
    fecha ? null : "Indica desde cuándo",
    null,
  ];

  // Resumen en lenguaje natural antes de confirmar: es la comprobación que
  // evita crear la solicitud a la persona equivocada o con la fecha de ayer.
  const resumen = [
    necesidadNombre || "Servicio sin elegir",
    personaNombre ? `para ${personaNombre.nombre} ${personaNombre.apellidos}` : null,
    `desde el ${new Date(fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`,
    indefinido ? "de forma indefinida" : `durante ${dias} ${dias === 1 ? "día" : "días"}`,
    `por la ${franja.toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(", ");

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      await api.post(
        "/solicitudes",
        {
          personaId: personaSel,
          necesidadId: necesidadSel,
          descripcionLibre: nota ? `Necesito ayuda: ${necesidadNombre}. ${nota}` : `Necesito ayuda: ${necesidadNombre}`,
          fechaInicio: new Date(fecha).toISOString(),
          dias: indefinido ? undefined : dias,
          indefinido: indefinido || undefined,
          franjaHoraria: franja,
        },
        token,
      );
      onCreated();
      onClose();
    } catch (e) {
      // Antes un fallo de red dejaba el modal como si nada hubiera pasado y la
      // solicitud sin crear: nadie se enteraba hasta buscarla en la lista.
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido crear la solicitud");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={necesidad ? necesidad.nombre : esCoordinacion ? `Nueva solicitud · ${PASOS[paso]}` : "Nueva solicitud"}
      onClose={onClose}
      size={esCoordinacion ? "lg" : "sm"}
    >
      <div className="space-y-5">
        {esCoordinacion ? (
          <>
            <Pasos actual={paso} hechos={hechos} ir={setPaso} />

            {paso === 0 && (
              <section>
                {(personas?.length ?? 0) > 6 && (
                  <SearchBox value={buscaPersona} onChange={setBuscaPersona} placeholder="Buscar por nombre o código…" className="mb-2 w-full sm:max-w-xs" />
                )}
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  {personasFiltradas.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Ninguna persona coincide.</p>}
                  {personasFiltradas.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPersonaSel(p.id);
                        setError(null);
                        // Elegir a la persona es el paso: se avanza solo, sin
                        // pedir además un clic en "siguiente".
                        setPaso(1);
                      }}
                      className={`flex w-full items-center justify-between border-b border-slate-50 px-3 py-2.5 text-left text-sm last:border-0 ${
                        personaSel === p.id ? "bg-brand-50 font-medium text-brand-800" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>
                        {p.nombre} {p.apellidos}
                      </span>
                      <span className="text-xs text-slate-400">{p.codigo}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {paso === 1 && (
              <section>
                {/* Los servicios del catálogo con su icono: se reconoce el que
                    se busca de un vistazo, sin desplegar una lista gris. */}
                <div className="flex flex-wrap gap-1.5">
                  {necesidades?.map((n) => (
                    <Chip
                      key={n.id}
                      activo={necesidadSel === n.id}
                      onClick={() => {
                        setNecesidadSel(n.id);
                        setError(null);
                        setPaso(2);
                      }}
                    >
                      <IconoNecesidad codigo={n.codigo} className="mr-1.5 inline h-4 w-4 shrink-0 align-text-bottom" />
                      {n.nombre}
                    </Chip>
                  ))}
                </div>
              </section>
            )}

            {paso === 2 && (
              <section className="space-y-3">
                <label className="block text-xs font-medium text-slate-500">
                  Empieza el
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      setError(null);
                    }}
                    className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
                  />
                </label>
                {/* Una fecha pasada casi siempre es un dedazo, pero a veces se
                    da de alta algo que ya empezó. Se avisa y se deja seguir. */}
                {fecha < aISO(new Date()) && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Esa fecha ya ha pasado. Si es a propósito —algo que empezó antes de darlo de alta— sigue adelante.
                  </p>
                )}

                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Cuánto tiempo</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {DURACIONES.map((d) => (
                      <Chip
                        key={d.label}
                        activo={!indefinido && dias === d.dias}
                        onClick={() => {
                          setIndefinido(false);
                          setDias(d.dias);
                        }}
                      >
                        {d.label}
                      </Chip>
                    ))}
                    <Chip activo={indefinido} onClick={() => setIndefinido(true)}>
                      <IconInfinity className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                      Indefinido
                    </Chip>
                    {!indefinido && (
                      <input
                        type="number"
                        min={1}
                        max={730}
                        value={dias}
                        onChange={(e) => setDias(Math.max(1, Math.min(730, Number(e.target.value) || 1)))}
                        title="Número exacto de días"
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">A qué hora del día</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FRANJAS.map((f) => (
                      <Chip key={f} activo={franja === f} onClick={() => setFranja(f)}>
                        {f}
                      </Chip>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {paso === 3 && (
              <section className="space-y-3">
                {/* Antes de crear nada, lo que se va a crear, en una frase. Es
                    la comprobación que evita la solicitud a la persona
                    equivocada o con la fecha del mes pasado. */}
                <p className="rounded-xl border border-brand-green-200 bg-brand-green-50 px-3 py-2.5 text-sm text-brand-green-800">
                  {resumen}.
                </p>
                <label className="block text-xs font-medium text-slate-500">
                  Notas (opcional)
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={2}
                    placeholder="Lo que haga falta saber: acceso a la vivienda, preferencias, contexto…"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <p className="text-xs text-slate-400">
                  Se creará como enviada, pendiente de revisar. El plan de días y horas y el precio se fijan en su ficha.
                </p>
              </section>
            )}
          </>
        ) : (
          <>
            {(personas?.length ?? 0) > 1 && (
              <div>
                <label className="mb-1 block text-base text-slate-700">¿Para quién es?</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {personas!.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonaSel(p.id)}
                      className={`rounded-lg border-2 px-3 py-3 text-left text-sm font-medium ${
                        personaSel === p.id ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {p.nombre} {p.apellidos}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-base text-slate-700">¿Cuándo empieza?</label>
              {/* Botones grandes en vez del calendario nativo: más cómodo para
                  personas mayores que teclear o abrir un selector emergente
                  (sección Usuario: "el calendario... es incómodo"). */}
              <div className="grid grid-cols-3 gap-2">
                {diasVisibles.map((d) => {
                  const iso = aISO(d);
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setFecha(iso)}
                      className={`rounded-lg border-2 px-2 py-3 text-center text-sm font-medium ${
                        fecha === iso ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {etiquetaDia(d)}
                    </button>
                  );
                })}
              </div>
              {!masOpciones && (
                <button type="button" onClick={() => setMasOpciones(true)} className="mt-2 text-sm text-slate-500 underline decoration-dotted hover:text-slate-700">
                  Ver más días
                </button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-base text-slate-700">¿Cuánto tiempo lo necesita?</label>
              <div className="grid grid-cols-3 gap-2">
                {DURACIONES.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => {
                      setIndefinido(false);
                      setDias(d.dias);
                    }}
                    className={`rounded-lg border-2 px-2 py-2 text-center text-sm font-medium ${
                      !indefinido && dias === d.dias ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {!indefinido && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-slate-500">O un número exacto de días:</span>
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={dias}
                    onChange={(e) => setDias(Math.max(1, Math.min(730, Number(e.target.value) || 1)))}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-center text-sm"
                  />
                </div>
              )}

              <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={indefinido} onChange={(e) => setIndefinido(e.target.checked)} />
                Indefinido — hasta nuevo aviso (por ejemplo, todos los días sin fecha de fin todavía)
              </label>
            </div>

            <div>
              <label className="mb-1 block text-base text-slate-700">¿Mañana o tarde?</label>
              <div className="flex gap-2">
                {FRANJAS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFranja(f)}
                    className={`flex-1 rounded-lg border-2 px-2 py-2 text-sm font-medium ${
                      franja === f ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-500">¿Algo más que quieras contarnos? (opcional)</label>
              <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="w-full campo" />
            </div>
          </>
        )}

        {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        {esCoordinacion ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setPaso((n) => Math.max(0, n - 1))}
              disabled={paso === 0}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:invisible"
            >
              <IconArrowLeft className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              Atrás
            </button>
            {paso < PASOS.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  const falta = faltaEnPaso[paso];
                  if (falta) return setError(falta);
                  setError(null);
                  setPaso((n) => n + 1);
                }}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
              >
                Siguiente
                <IconArrowRight className="ml-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
              </button>
            ) : (
              <button
                onClick={confirmar}
                disabled={enviando || !personaSel || !necesidadSel}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {enviando ? "Creando…" : "Crear solicitud"}
              </button>
            )}
          </div>
        ) : (
          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-sm text-slate-600">
              <span className="text-slate-400">Se creará: </span>
              {resumen}.
            </p>
            {!personaSel && <p className="mb-2 text-sm text-amber-700">Elige antes para quién es la solicitud.</p>}
            <button
              onClick={confirmar}
              disabled={enviando || !personaSel || !necesidadSel}
              className="w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Confirmar"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
