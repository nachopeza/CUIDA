import { useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { Modal } from "./Modal.js";
import { aISO, etiquetaDia, proximosDias } from "../lib/fechas.js";
import type { Necesidad, Persona } from "../lib/types.js";

const FRANJAS = ["Mañana", "Tarde", "Todo el día"];

// Presets habituales (sección "si fuera que Herminia necesita una persona
// durante 5 días, o dos meses ¿cómo lo selecciona?"): cubren el rango
// típico con un toque; el número exacto siempre queda editable a mano.
// grid-cols-3 fijo (sin prefijo sm:): un grid dentro de un modal responde al
// ancho del MODAL, no al del viewport — con sm:grid-cols-5 el modal se
// quedaba con el mismo ancho pero de repente 5 columnas apretadas en
// pantallas anchas, que es justo el bug "no se adapta al tamaño".
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

// Dos variantes en un mismo componente (sección "debe ser diferente para
// personas mayores que para coordinación"): botones grandes y pasos guiados
// cuando lo usa la persona/familiar, formulario denso y compacto cuando lo
// usa coordinación (que ya sabe lo que quiere y prefiere escribir rápido).
// Se distingue por los props recibidos: coordinación es quien pasa a la vez
// la lista de necesidades Y la lista de personas (tiene que elegir ambas).
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

  const diasVisibles = proximosDias(masOpciones ? 14 : 3);

  const necesidadNombre = necesidad?.nombre ?? necesidades?.find((n) => n.id === necesidadSel)?.nombre ?? "";

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
      <div className={esCoordinacion ? "space-y-3" : "space-y-4"}>
        <div className={esCoordinacion && necesidades && personas ? "grid grid-cols-2 gap-2" : "space-y-4"}>
          {personas && (
            <div>
              <label className="mb-1 block text-sm text-slate-600">Para quién</label>
              <select value={personaSel} onChange={(e) => setPersonaSel(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.apellidos}
                  </option>
                ))}
              </select>
            </div>
          )}

          {necesidades && (
            <div>
              <label className="mb-1 block text-sm text-slate-600">Qué necesita</label>
              <select value={necesidadSel} onChange={(e) => setNecesidadSel(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                {necesidades.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {esCoordinacion ? (
          // Formulario denso: fechas y horas como campos normales, sin los
          // pasos guiados de la versión para la persona atendida.
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-slate-500">
              Desde
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              Días
              <input
                type="number"
                min={1}
                max={730}
                disabled={indefinido}
                value={dias}
                onChange={(e) => setDias(Math.max(1, Math.min(730, Number(e.target.value) || 1)))}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              />
              <span className="mt-1 flex items-center gap-1.5 font-normal normal-case text-slate-500">
                <input type="checkbox" checked={indefinido} onChange={(e) => setIndefinido(e.target.checked)} />
                Indefinido
              </span>
            </label>
            <label className="text-xs text-slate-500">
              Franja
              <select value={franja} onChange={(e) => setFranja(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {FRANJAS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Notas (opcional)
              <input value={nota} onChange={(e) => setNota(e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
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

        <button
          onClick={confirmar}
          disabled={enviando || !personaSel || !necesidadSel}
          className={`w-full rounded-lg bg-brand font-semibold text-white hover:bg-brand-800 disabled:opacity-50 ${esCoordinacion ? "px-4 py-2 text-sm" : "px-4 py-3 text-base"}`}
        >
          {enviando ? "Enviando…" : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}
