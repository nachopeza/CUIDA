import { useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Modal } from "./Modal.js";
import { SearchBox } from "./SearchBox.js";
import { ICONOS_NECESIDAD } from "../lib/necesidadIconos.js";
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

// Encabezado de sección: numerado y discreto, para que el formulario se lea
// como tres pasos cortos en vez de como una rejilla de campos sueltos
// (sección "mejor estructurada visualmente, más minimalista y con la
// información bien estructurada").
function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{n}</span>
        {titulo}
      </h4>
      {children}
    </section>
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
  const [personaSel, setPersonaSel] = useState(personaId ?? personas?.[0]?.id ?? "");
  const [necesidadSel, setNecesidadSel] = useState(necesidad?.id ?? necesidades?.[0]?.id ?? "");
  const [fecha, setFecha] = useState(() => aISO(new Date()));
  const [dias, setDias] = useState(1);
  const [indefinido, setIndefinido] = useState(false);
  const [franja, setFranja] = useState("Mañana");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [masOpciones, setMasOpciones] = useState(false);
  const [buscaPersona, setBuscaPersona] = useState("");

  const diasVisibles = proximosDias(masOpciones ? 14 : 3);
  const necesidadNombre = necesidad?.nombre ?? necesidades?.find((n) => n.id === necesidadSel)?.nombre ?? "";
  const personaNombre = personas?.find((p) => p.id === personaSel);

  const personasFiltradas = (personas ?? []).filter((p) => {
    const q = buscaPersona.trim().toLowerCase();
    return !q || `${p.nombre} ${p.apellidos} ${p.codigo}`.toLowerCase().includes(q);
  });

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
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title={necesidad ? necesidad.nombre : "Nueva solicitud"} onClose={onClose} size={esCoordinacion ? "lg" : "sm"}>
      <div className="space-y-5">
        {esCoordinacion ? (
          <>
            <Paso n={1} titulo="Para quién">
              {(personas?.length ?? 0) > 6 && (
                <SearchBox value={buscaPersona} onChange={setBuscaPersona} placeholder="Buscar usuario…" className="mb-2 w-full sm:max-w-xs" />
              )}
              <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200">
                {personasFiltradas.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Ningún usuario coincide.</p>}
                {personasFiltradas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersonaSel(p.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
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
            </Paso>

            <Paso n={2} titulo="Qué necesita">
              {/* Los servicios del catálogo con su icono: se reconoce el que
                  se busca de un vistazo, sin desplegar una lista gris. */}
              <div className="flex flex-wrap gap-1.5">
                {necesidades?.map((n) => (
                  <Chip key={n.id} activo={necesidadSel === n.id} onClick={() => setNecesidadSel(n.id)}>
                    <span className="mr-1">{ICONOS_NECESIDAD[n.codigo] ?? "❓"}</span>
                    {n.nombre}
                  </Chip>
                ))}
              </div>
            </Paso>

            <Paso n={3} titulo="Cuándo">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-500">
                    Empieza
                    <input
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
                    />
                  </label>
                </div>

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
                    📌 Indefinido
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

                <div className="flex flex-wrap gap-1.5">
                  {FRANJAS.map((f) => (
                    <Chip key={f} activo={franja === f} onClick={() => setFranja(f)}>
                      {f}
                    </Chip>
                  ))}
                </div>
              </div>
            </Paso>

            <Paso n={4} titulo="Notas (opcional)">
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Lo que haga falta saber: acceso, preferencias, contexto…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Paso>
          </>
        ) : (
          <>
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
              <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </>
        )}

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-sm text-slate-600">
            <span className="text-slate-400">Se creará: </span>
            {resumen}.
          </p>
          <button
            onClick={confirmar}
            disabled={enviando || !personaSel || !necesidadSel}
            className={`w-full rounded-lg bg-brand font-semibold text-white hover:bg-brand-800 disabled:opacity-50 ${esCoordinacion ? "px-4 py-2.5 text-sm" : "px-4 py-3 text-base"}`}
          >
            {enviando ? "Enviando…" : esCoordinacion ? "Crear solicitud" : "Confirmar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
