import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { IconBell, IconCheck } from "./icons.js";
import type { Notificacion } from "../lib/types.js";

// Cuánto hace, en palabras. "hace 3 h" dice más que una fecha completa para
// algo que acaba de pasar.
function haceCuanto(iso: string) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "ahora mismo";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

const DIAS_RECIENTE = 7;

interface Props {
  // Abrir lo que el aviso referencia. Sin esto las filas no son pinchables:
  // es preferible eso a un clic que no hace nada.
  onAbrir?: (entidadTipo: string, entidadId: string) => void;
  limite?: number;
}

// Un cambio de fecha o de precio sólo se veía en la campana, y la campana hay
// que abrirla: si no se pincha, nadie se entera de que su jornada se ha
// movido. Esto lo pone en el escritorio, donde ya se está mirando.
export function Novedades({ onAbrir, limite = 5 }: Props) {
  const { token } = useAuth();
  const [todas, setTodas] = useState<Notificacion[]>([]);

  async function cargar() {
    try {
      setTodas(await api.get<Notificacion[]>("/notificaciones", token));
    } catch {
      setTodas([]);
    }
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const corte = Date.now() - DIAS_RECIENTE * 86400000;
  // Lo sin leer manda; lo ya visto sólo acompaña si es de esta semana, para
  // que el panel no se quede vacío en cuanto se lee todo.
  const recientes = todas
    .filter((n) => !n.leida || new Date(n.createdAt).getTime() > corte)
    .sort((a, b) => Number(a.leida) - Number(b.leida) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limite);
  const sinLeer = todas.filter((n) => !n.leida).length;

  if (recientes.length === 0) return null;

  async function abrir(n: Notificacion) {
    if (!n.leida) {
      await api.post(`/notificaciones/${n.id}/leida`, {}, token);
      setTodas((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    }
    if (onAbrir && n.entidadTipo && n.entidadId) onAbrir(n.entidadTipo, n.entidadId);
  }

  async function marcarTodo() {
    await api.post("/notificaciones/leidas", {}, token);
    setTodas((prev) => prev.map((n) => ({ ...n, leida: true })));
  }

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <IconBell className="h-4 w-4 text-slate-400" /> Novedades
          {sinLeer > 0 && <span className="rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700">{sinLeer}</span>}
        </h3>
        {sinLeer > 0 && (
          <button onClick={marcarTodo} className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-800">
            <IconCheck className="h-3.5 w-3.5" /> Marcar como visto
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {recientes.map((n) => {
          const abrible = Boolean(onAbrir && n.entidadTipo && n.entidadId);
          const contenido = (
            <>
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.leida ? "bg-slate-200" : "bg-rose-500"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${n.leida ? "text-slate-500" : "text-slate-800"}`}>{n.mensaje}</span>
                <span className="block text-xs text-slate-400">{haceCuanto(n.createdAt)}</span>
              </span>
            </>
          );
          return (
            <li key={n.id}>
              {abrible ? (
                <button onClick={() => abrir(n)} className="flex w-full items-start gap-2 py-2 text-left hover:bg-slate-50">
                  {contenido}
                </button>
              ) : (
                <div className="flex items-start gap-2 py-2">{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
