import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import { Modal } from "../../components/Modal.js";
import { duracion } from "../../lib/economia.js";
import { ETIQUETA_AUSENCIA, ETIQUETA_DOCUMENTO, TONO_VIGENCIA, textoVigencia, vigenciaDe } from "../../lib/personal.js";
import { RegistroDetalle } from "../coordinador/PersonalTab.js";
import { IconAlert, IconCalendar, IconCheck, IconClock, IconFile } from "../../components/icons.js";
import type { Ausencia, DocumentoProfesional, RegistroJornada, TipoAusencia } from "../../lib/types.js";

function fecha(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

const ESTADO_AUSENCIA: Record<string, string> = {
  SOLICITADA: "bg-amber-100 text-amber-700",
  APROBADA: "bg-brand-green-100 text-brand-green-700",
  RECHAZADA: "bg-rose-100 text-rose-700",
  CANCELADA: "bg-slate-200 text-slate-600",
};

// Lo que un profesional necesita de su propia relación laboral: qué papeles
// tiene la empresa suyos y cuándo caducan, sus días libres, y el registro de
// jornada que tiene derecho a revisar antes de dar su conformidad.
export function MiExpedienteTab({ profesionalId }: { profesionalId: string }) {
  const { token } = useAuth();
  const [documentos, setDocumentos] = useState<DocumentoProfesional[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [registros, setRegistros] = useState<RegistroJornada[]>([]);
  const [abierto, setAbierto] = useState<RegistroJornada | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [form, setForm] = useState({ tipo: "VACACIONES" as TipoAusencia, desde: "", hasta: "", motivo: "" });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    const [d, a, r] = await Promise.all([
      api.get<DocumentoProfesional[]>(`/personal/${profesionalId}/documentos`, token).catch(() => []),
      api.get<Ausencia[]>("/personal/ausencias", token).catch(() => []),
      api.get<RegistroJornada[]>("/personal/registros", token).catch(() => []),
    ]);
    setDocumentos(d);
    setAusencias(a);
    setRegistros(r);
    setAbierto((actual) => (actual ? (r.find((x) => x.id === actual.id) ?? null) : null));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, profesionalId]);

  async function pedirAusencia() {
    if (!form.desde || !form.hasta) return;
    setPidiendo(true);
    setError(null);
    setAviso(null);
    try {
      await api.post(`/personal/${profesionalId}/ausencias`, form, token);
      setForm({ tipo: "VACACIONES", desde: "", hasta: "", motivo: "" });
      await cargar();
      setAviso("Petición enviada. Coordinación te responderá.");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido enviar");
    } finally {
      setPidiendo(false);
    }
  }

  async function darConformidad(r: RegistroJornada) {
    setError(null);
    try {
      await api.post(`/personal/registros/${r.id}/conforme`, {}, token);
      await cargar();
      setAviso("Conformidad registrada.");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido registrar");
    }
  }

  const caducando = documentos.filter((d) => ["caducado", "por_caducar"].includes(vigenciaDe(d.fechaCaducidad)));
  const sinConformidad = registros.filter((r) => !r.conformeAt);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      {aviso && <p className="rounded-md border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">{aviso}</p>}

      {caducando.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
            <IconAlert className="h-4 w-4" /> Tienes documentación que renovar
          </p>
          <ul className="mt-1 text-xs text-amber-700">
            {caducando.map((d) => (
              <li key={d.id}>
                {ETIQUETA_DOCUMENTO[d.tipo]} · {textoVigencia(d)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sinConformidad.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-blue-800">
            <IconClock className="h-4 w-4" /> Tienes {sinConformidad.length} registro{sinConformidad.length === 1 ? "" : "s"} de jornada por revisar
          </p>
          <p className="mt-0.5 text-xs text-blue-700">Míralo y da tu conformidad si las horas son correctas.</p>
        </div>
      )}

      <Card title="Mi documentación">
        {documentos.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">La empresa todavía no tiene documentación tuya.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documentos.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{d.nombre}</p>
                  <p className="text-xs text-slate-400">
                    {ETIQUETA_DOCUMENTO[d.tipo]}
                    {d.fechaEmision && ` · emitido ${fecha(d.fechaEmision)}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONO_VIGENCIA[vigenciaDe(d.fechaCaducidad)]}`}>
                  {textoVigencia(d)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Mis ausencias">
        {ausencias.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">No tienes ninguna registrada.</p>
        ) : (
          <ul className="mb-3 divide-y divide-slate-100">
            {ausencias.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">
                    {ETIQUETA_AUSENCIA[a.tipo]} · {fecha(a.desde)} → {fecha(a.hasta)}
                  </p>
                  {a.respuesta && <p className="text-xs text-slate-400">{a.respuesta}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_AUSENCIA[a.estado]}`}>{a.estado.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-4">
          <select
            value={form.tipo}
            onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoAusencia }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {Object.entries(ETIQUETA_AUSENCIA).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
          <input type="date" value={form.desde} onChange={(e) => setForm((f) => ({ ...f, desde: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input type="date" value={form.hasta} onChange={(e) => setForm((f) => ({ ...f, hasta: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <button
            onClick={pedirAusencia}
            disabled={pidiendo || !form.desde || !form.hasta}
            className="flex items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            <IconCalendar className="h-3.5 w-3.5" /> {pidiendo ? "Enviando…" : "Pedir días"}
          </button>
        </div>
      </Card>

      <Card title="Mi registro de jornada">
        {registros.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">Todavía no hay ningún mes cerrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {registros.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <button onClick={() => setAbierto(r)} className="min-w-0 flex-1 text-left">
                  <p className="flex items-center gap-2 text-sm text-slate-800 hover:underline">
                    <IconFile className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {r.mes} · {duracion(r.minutosTrabajados)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {r.codigo} · {r.diasTrabajados} día{r.diasTrabajados === 1 ? "" : "s"}
                    {r.conformeAt ? ` · conforme el ${fecha(r.conformeAt)}` : " · pendiente de tu conformidad"}
                  </p>
                </button>
                {!r.conformeAt && (
                  <button
                    onClick={() => darConformidad(r)}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-brand-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-green-700"
                  >
                    <IconCheck className="h-3.5 w-3.5" /> Doy mi conformidad
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {abierto && (
        <Modal title={`${abierto.codigo} · ${abierto.mes}`} onClose={() => setAbierto(null)} size="lg">
          <RegistroDetalle registro={abierto} />
          {!abierto.conformeAt && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => darConformidad(abierto)}
                className="flex items-center gap-1.5 rounded-md bg-brand-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-green-700"
              >
                <IconCheck className="h-4 w-4" /> Doy mi conformidad
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
