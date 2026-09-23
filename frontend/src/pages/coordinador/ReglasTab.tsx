import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.js";
import { NOMBRE_BASE, NOMBRE_REDONDEO, duracion, euros } from "../../lib/tiempo.js";
import { IconCheck, IconClock, IconEuro, IconPlus, IconTag } from "../../components/icons.js";

// ---------------------------------------------------------------------------
// Las decisiones comerciales, fuera del código
//
// "¿Se cobra lo programado o lo real?", "¿se redondean los minutos?", "¿qué
// pasa si cancelan con dos horas?". Son preguntas de negocio, y cada empresa
// las responde distinto. Aquí se responden una vez y el motor de tiempo las
// aplica a todas las jornadas.
// ---------------------------------------------------------------------------

interface Reglas {
  baseCobro: string;
  baseLiquidacion: string;
  redondeoMinutos: number;
  redondeoModo: string;
  minimoMinutos: number;
  toleranciaRetrasoMinutos: number;
  toleranciaExcesoMinutos: number;
  aprobarTiempoExtra: boolean;
  horasVisitaAbierta: number;
  cancelacionAvisoHoras: number;
  cancelacionTardiaCobro: number;
  cancelacionTardiaPago: number;
  noPresentadoCobro: number;
  noPresentadoPago: number;
}

interface Tarifa {
  id: string;
  nombre: string;
  necesidad: { id: string; nombre: string } | null;
  precioHoraCliente: number;
  precioHoraProfesional: number;
  comisionHora: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
  activa: boolean;
}

const BASES = ["PROGRAMADO", "REAL", "MENOR", "MAYOR"];
const REDONDEOS = ["NINGUNO", "ARRIBA", "ABAJO", "CERCANO"];

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{ayuda}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-600">
      <span className="font-medium text-slate-700">{etiqueta}</span>
      {ayuda && <span className="ml-1 text-slate-400">{ayuda}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const select = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const numero = "w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function ReglasTab() {
  const { token } = useAuth();
  const [r, setR] = useState<Reglas | null>(null);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [necesidades, setNecesidades] = useState<{ id: string; nombre: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ nombre: "", necesidadId: "", precioHoraCliente: "", precioHoraProfesional: "", vigenteDesde: "" });
  const [creando, setCreando] = useState(false);

  async function cargar() {
    const [reglas, ts, ns] = await Promise.all([
      api.get<Reglas>("/reglas", token),
      api.get<Tarifa[]>("/reglas/tarifas", token),
      api.get<{ id: string; nombre: string }[]>("/necesidades", token).catch(() => []),
    ]);
    setR(reglas);
    setTarifas(ts);
    setNecesidades(ns);
  }
  useEffect(() => {
    void cargar();
  }, []);

  async function guardar() {
    if (!r) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const guardadas = await api.put<Reglas>("/reglas", r, token);
      setR(guardadas);
      setAviso("Guardado. Se aplica a las jornadas que se cierren a partir de ahora; lo ya facturado no se toca.");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function crearTarifa() {
    setError(null);
    try {
      await api.post(
        "/reglas/tarifas",
        {
          nombre: nueva.nombre,
          necesidadId: nueva.necesidadId || null,
          precioHoraCliente: Number(nueva.precioHoraCliente),
          precioHoraProfesional: Number(nueva.precioHoraProfesional),
          vigenteDesde: nueva.vigenteDesde || new Date().toISOString().slice(0, 10),
        },
        token,
      );
      setNueva({ nombre: "", necesidadId: "", precioHoraCliente: "", precioHoraProfesional: "", vigenteDesde: "" });
      setCreando(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido crear");
    }
  }

  async function cerrarTarifa(id: string) {
    await api.post(`/reglas/tarifas/${id}/cerrar`, {}, token);
    await cargar();
  }

  if (!r) return <p className="text-sm text-slate-500">Cargando…</p>;

  const set = <K extends keyof Reglas>(k: K, v: Reglas[K]) => setR({ ...r, [k]: v });

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-800">Reglas de negocio</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
          CUIDA cobra por tiempo, así que todo el dinero sale de aquí. Estas reglas convierten lo que se acordó y lo que se fichó
          en lo que se factura y en lo que se paga, y son las que explican cualquier importe cuando alguien pregunta.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque
          titulo="Del tiempo al dinero"
          ayuda="Acordado 09:00–12:00, fichado 09:04–11:58: ¿qué entra en la factura y en la nómina?"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Se cobra a la familia">
              <select value={r.baseCobro} onChange={(e) => set("baseCobro", e.target.value)} className={select}>
                {BASES.map((b) => (
                  <option key={b} value={b}>
                    {NOMBRE_BASE[b]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Se paga al profesional">
              <select value={r.baseLiquidacion} onChange={(e) => set("baseLiquidacion", e.target.value)} className={select}>
                {BASES.map((b) => (
                  <option key={b} value={b}>
                    {NOMBRE_BASE[b]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Redondeo" ayuda="min">
              <input type="number" min={0} max={120} value={r.redondeoMinutos} onChange={(e) => set("redondeoMinutos", Number(e.target.value))} className={numero} />
            </Campo>
            <Campo etiqueta="Hacia">
              <select value={r.redondeoModo} onChange={(e) => set("redondeoModo", e.target.value)} className={select}>
                {REDONDEOS.map((m) => (
                  <option key={m} value={m}>
                    {NOMBRE_REDONDEO[m]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Mínimo" ayuda="min">
              <input type="number" min={0} value={r.minimoMinutos} onChange={(e) => set("minimoMinutos", Number(e.target.value))} className={numero} />
            </Campo>
          </div>
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <IconClock className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-slate-400" aria-hidden />
            Con estas reglas, una jornada de 09:00 a 12:00 fichada de 09:04 a 11:58 se cobra {NOMBRE_BASE[r.baseCobro]} y se paga{" "}
            {NOMBRE_BASE[r.baseLiquidacion]}
            {r.redondeoMinutos > 0 && `, redondeando a ${r.redondeoMinutos} min ${NOMBRE_REDONDEO[r.redondeoModo]}`}
            {r.minimoMinutos > 0 && `, nunca por debajo de ${duracion(r.minimoMinutos)}`}.
          </p>
        </Bloque>

        <Bloque titulo="Desviaciones" ayuda="Cuánto se puede desviar el fichaje antes de que alguien tenga que mirarlo.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Retraso tolerado" ayuda="min">
              <input type="number" min={0} value={r.toleranciaRetrasoMinutos} onChange={(e) => set("toleranciaRetrasoMinutos", Number(e.target.value))} className={numero} />
            </Campo>
            <Campo etiqueta="Exceso tolerado" ayuda="min">
              <input type="number" min={0} value={r.toleranciaExcesoMinutos} onChange={(e) => set("toleranciaExcesoMinutos", Number(e.target.value))} className={numero} />
            </Campo>
          </div>
          <label className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <input type="checkbox" checked={r.aprobarTiempoExtra} onChange={(e) => set("aprobarTiempoExtra", e.target.checked)} className="mt-0.5" />
            <span>
              <strong className="text-slate-700">El tiempo de más necesita aprobación.</strong> Si se pasa del exceso tolerado, la
              jornada queda en espera con un motivo y coordinación decide si entra en la factura. Sin esto, cualquier fichaje
              largo se cobra solo.
            </span>
          </label>
          <Campo etiqueta="Avisar de jornadas abiertas después de" ayuda="horas">
            <input type="number" min={1} max={24} value={r.horasVisitaAbierta} onChange={(e) => set("horasVisitaAbierta", Number(e.target.value))} className={numero} />
          </Campo>
        </Bloque>

        <Bloque titulo="Cancelaciones" ayuda="Con preaviso no cuesta nada; sin él, el profesional ya había reservado el hueco.">
          <Campo etiqueta="Se considera aviso suficiente con" ayuda="horas de antelación">
            <input type="number" min={0} value={r.cancelacionAvisoHoras} onChange={(e) => set("cancelacionAvisoHoras", Number(e.target.value))} className={numero} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Cancelación tardía: se cobra" ayuda="% de lo acordado">
              <input type="number" min={0} max={100} value={r.cancelacionTardiaCobro} onChange={(e) => set("cancelacionTardiaCobro", Number(e.target.value))} className={numero} />
            </Campo>
            <Campo etiqueta="…y se le paga" ayuda="% de lo acordado">
              <input type="number" min={0} max={100} value={r.cancelacionTardiaPago} onChange={(e) => set("cancelacionTardiaPago", Number(e.target.value))} className={numero} />
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo="No presentado" ayuda="El profesional fue y la persona no estaba: el servicio no se hizo, pero el desplazamiento sí.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Se cobra" ayuda="% de lo acordado">
              <input type="number" min={0} max={100} value={r.noPresentadoCobro} onChange={(e) => set("noPresentadoCobro", Number(e.target.value))} className={numero} />
            </Campo>
            <Campo etiqueta="Se le paga" ayuda="% de lo acordado">
              <input type="number" min={0} max={100} value={r.noPresentadoPago} onChange={(e) => set("noPresentadoPago", Number(e.target.value))} className={numero} />
            </Campo>
          </div>
        </Bloque>
      </div>

      {aviso && <p className="rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">{aviso}</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <button
        onClick={guardar}
        disabled={guardando}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar las reglas"}
      </button>

      {/* --- Tarifas con vigencia ------------------------------------- */}
      <section className="rounded-xl border border-slate-200 p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconTag className="h-4 w-4 text-slate-400" aria-hidden /> Tarifas
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Una tarifa no se edita: se cierra y se crea la siguiente. Subir el precio en octubre no puede reescribir lo que se
              prestó en septiembre, así que cada jornada guarda la que se le aplicó.
            </p>
          </div>
          <button
            onClick={() => setCreando((v) => !v)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <IconPlus className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
            Nueva tarifa
          </button>
        </div>

        {creando && (
          <div className="mb-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
            <input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <select value={nueva.necesidadId} onChange={(e) => setNueva({ ...nueva, necesidadId: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Todos los servicios</option>
              {necesidades.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
            <input type="number" step="0.01" value={nueva.precioHoraCliente} onChange={(e) => setNueva({ ...nueva, precioHoraCliente: e.target.value })} placeholder="€/h familia" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input type="number" step="0.01" value={nueva.precioHoraProfesional} onChange={(e) => setNueva({ ...nueva, precioHoraProfesional: e.target.value })} placeholder="€/h profesional" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <input type="date" value={nueva.vigenteDesde} onChange={(e) => setNueva({ ...nueva, vigenteDesde: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <button onClick={crearTarifa} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800">
                Crear
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-3 font-medium">Tarifa</th>
                <th className="py-1.5 pr-3 font-medium">Servicio</th>
                <th className="py-1.5 pr-3 text-right font-medium">Familia</th>
                <th className="py-1.5 pr-3 text-right font-medium">Profesional</th>
                <th className="py-1.5 pr-3 text-right font-medium">CUIDA</th>
                <th className="py-1.5 pr-3 text-right font-medium">% gestión</th>
                <th className="py-1.5 pr-3 font-medium">Vigencia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className={`border-b border-slate-100 ${t.activa ? "" : "text-slate-400"}`}>
                  <td className="py-1.5 pr-3 font-medium">{t.nombre}</td>
                  <td className="py-1.5 pr-3 text-xs">{t.necesidad?.nombre ?? "Todos"}</td>
                  <td className="py-1.5 pr-3 text-right">{euros(t.precioHoraCliente)}/h</td>
                  <td className="py-1.5 pr-3 text-right">{euros(t.precioHoraProfesional)}/h</td>
                  <td className="py-1.5 pr-3 text-right">{euros(t.comisionHora)}/h</td>
                  {/* El porcentaje que sale de verdad de esta tarifa. El de la
                      ficha de empresa es solo el de reserva, para un servicio
                      sin tarifa; quien mira aquí quiere saber cuánto se queda
                      CUIDA en este servicio. */}
                  <td className="py-1.5 pr-3 text-right text-xs text-slate-500">
                    {Number(t.precioHoraCliente) > 0
                      ? `${Math.round((Number(t.comisionHora) / Number(t.precioHoraCliente)) * 100)} %`
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">
                    {new Date(t.vigenteDesde).toLocaleDateString("es-ES")} →{" "}
                    {t.vigenteHasta ? new Date(t.vigenteHasta).toLocaleDateString("es-ES") : "sin fin"}
                  </td>
                  <td className="py-1.5 text-right">
                    {t.activa ? (
                      <button onClick={() => cerrarTarifa(t.id)} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50">
                        Cerrar
                      </button>
                    ) : (
                      <span className="text-xs">cerrada</span>
                    )}
                  </td>
                </tr>
              ))}
              {tarifas.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-3 text-center text-xs text-slate-400">
                    Sin tarifas: se usa el precio acordado en cada servicio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-start gap-1.5 text-xs text-slate-400">
        <IconEuro className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        La diferencia entre lo que paga la familia y lo que cobra el profesional es el ingreso de gestión de CUIDA, no su
        beneficio: de ahí salen impuestos, seguros, pasarela de pago y administración.
      </p>
      <p className="flex items-start gap-1.5 text-xs text-slate-400">
        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Cambiar una regla no recalcula el pasado: solo afecta a las jornadas que se cierren a partir de ahora.
      </p>
    </div>
  );
}
