import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { IconAlert, IconCheck, IconShield } from "./icons.js";

// Lo que se le ha explicado a esta persona y lo que ha autorizado. No es un
// trámite de papeleo: el RGPD obliga a poder demostrarlo (arts. 5.2 y 7.1) y a
// dejar retirarlo igual de fácil que se dio (art. 7.3). Por eso aquí se ve
// siempre el catálogo entero, contestado o no: una pantalla que solo enseñe lo
// que hay guardado deja invisible justo lo que falta.
interface EstadoConsentimiento {
  tipo: string;
  etiqueta: string;
  queSeLePide: string;
  baseLegal: string;
  imprescindible: boolean;
  consecuencia: string;
  estado: "otorgado" | "denegado" | "revocado" | "sin_preguntar";
  fecha: string | null;
  version: string | null;
  canal: string | null;
  recogidoPor: string | null;
  versionCaducada: boolean;
  nota: string | null;
}

const CANALES = [
  { valor: "PRESENCIAL", etiqueta: "En persona" },
  { valor: "TELEFONO", etiqueta: "Por teléfono" },
  { valor: "PAPEL_FIRMADO", etiqueta: "Papel firmado" },
  { valor: "APLICACION", etiqueta: "En la aplicación" },
];

function fechaCorta(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function ConsentimientosPersona({ personaId }: { personaId: string }) {
  const { token } = useAuth();
  const [estado, setEstado] = useState<EstadoConsentimiento[]>([]);
  const [version, setVersion] = useState("");
  const [canal, setCanal] = useState("PRESENCIAL");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const r = await api.get<{ version: string; estado: EstadoConsentimiento[] }>(`/personas/${personaId}/consentimientos`, token);
    setEstado(r.estado);
    setVersion(r.version);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function responder(tipo: string, otorgado: boolean) {
    setOcupado(tipo);
    setError(null);
    try {
      await api.post(`/personas/${personaId}/consentimientos`, { tipo, otorgado, canal }, token);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setOcupado(null);
    }
  }

  async function revocar(tipo: string) {
    setOcupado(tipo);
    setError(null);
    try {
      await api.post(`/personas/${personaId}/consentimientos/${tipo}/revocar`, {}, token);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido retirar");
    } finally {
      setOcupado(null);
    }
  }

  const faltan = estado.filter((c) => c.imprescindible && c.estado === "sin_preguntar").length;
  const caducados = estado.filter((c) => c.versionCaducada).length;

  return (
    <div className="border-t border-slate-100 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <IconShield className="h-3.5 w-3.5" aria-hidden /> Protección de datos
        </p>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Recogido
          <select value={canal} onChange={(e) => setCanal(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
            {CANALES.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>

      {faltan > 0 ? (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Falta {faltan === 1 ? "lo imprescindible en un punto" : `lo imprescindible en ${faltan} puntos`}. Hasta que no se le informe y lo
          autorice, se la está atendiendo sin la cobertura que exige el reglamento.
        </p>
      ) : caducados > 0 ? (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El texto informativo ha cambiado desde que se le explicó: hay que volver a informarla de la versión {version}.
        </p>
      ) : (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-brand-green-50 px-3 py-2 text-xs text-brand-green-700">
          <IconCheck className="h-3.5 w-3.5" aria-hidden /> Informada y con todo lo imprescindible autorizado.
        </p>
      )}

      {error && <p className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <ul className="space-y-2">
        {estado.map((c) => (
          <li key={c.tipo} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">
                  {c.etiqueta}{" "}
                  {c.imprescindible ? (
                    <span className="text-xs font-normal text-slate-400">· imprescindible</span>
                  ) : (
                    <span className="text-xs font-normal text-slate-400">· puede decir que no</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{c.queSeLePide}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{c.baseLegal}</p>
              </div>
              <Sello c={c} />
            </div>

            {c.estado !== "sin_preguntar" && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                {fechaCorta(c.fecha)}
                {c.version && ` · texto ${c.version}`}
                {c.recogidoPor && ` · lo recogió ${c.recogidoPor}`}
                {c.versionCaducada && " · el texto vigente ya no es ese"}
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {c.estado === "otorgado" ? (
                <button
                  onClick={() => revocar(c.tipo)}
                  disabled={ocupado === c.tipo}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Lo retira
                </button>
              ) : (
                <button
                  onClick={() => responder(c.tipo, true)}
                  disabled={ocupado === c.tipo}
                  className="rounded-xl bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                >
                  {c.tipo === "INFORMACION" ? "Se le ha informado" : "Lo autoriza"}
                </button>
              )}
              {c.estado !== "denegado" && c.tipo !== "INFORMACION" && (
                <button
                  onClick={() => responder(c.tipo, false)}
                  disabled={ocupado === c.tipo}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Dice que no
                </button>
              )}
              {c.estado === "denegado" && <span className="self-center text-[11px] text-slate-400">{c.consecuencia}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sello({ c }: { c: EstadoConsentimiento }) {
  const estilo =
    c.estado === "otorgado" && !c.versionCaducada
      ? "bg-brand-green-100 text-brand-green-700"
      : c.estado === "otorgado"
        ? "bg-amber-100 text-amber-800"
        : c.estado === "denegado"
          ? "bg-slate-100 text-slate-600"
          : c.estado === "revocado"
            ? "bg-slate-100 text-slate-600"
            : c.imprescindible
              ? "bg-rose-100 text-rose-700"
              : "bg-slate-100 text-slate-500";
  const texto =
    c.estado === "otorgado" && c.versionCaducada
      ? "Hay que volver a informar"
      : c.estado === "otorgado"
        ? c.tipo === "INFORMACION"
          ? "Informada"
          : "Autorizado"
        : c.estado === "denegado"
          ? "Dijo que no"
          : c.estado === "revocado"
            ? "Retirado"
            : "Sin preguntar";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${estilo}`}>{texto}</span>;
}
