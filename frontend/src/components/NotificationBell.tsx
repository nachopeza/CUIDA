import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { IconBell } from "./icons.js";
import type { Notificacion } from "../lib/types.js";

// A dónde lleva cada aviso. Si no sabemos abrir la entidad no se navega,
// pero antes se pinchaba una notificación de incidencia y no pasaba nada.
const DESTINO: Record<string, string> = { Solicitud: "solicitud", Incidencia: "incidencia" };

export function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function cargar() {
    const data = await api.get<Notificacion[]>("/notificaciones", token);
    setNotificaciones(data);
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 20000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  async function marcarLeida(id: string) {
    await api.post(`/notificaciones/${id}/leida`, {}, token);
    setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
  }

  function abrir(n: Notificacion) {
    marcarLeida(n.id);
    setAbierto(false);
    const parametro = n.entidadTipo ? DESTINO[n.entidadTipo] : undefined;
    if (parametro && n.entidadId) navigate(`/?${parametro}=${n.entidadId}`);
  }

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="relative rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notificaciones"
      >
        <IconBell className="h-5 w-5" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-green-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
            {noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-80 tarjeta shadow-lg">
          <div className="max-h-96 overflow-y-auto">
            {notificaciones.length === 0 && <p className="p-4 text-sm text-slate-500">Sin notificaciones.</p>}
            {notificaciones.map((n) => (
              <button
                key={n.id}
                onClick={() => abrir(n)}
                className={`block w-full border-b border-slate-100 px-4 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50 ${n.leida ? "text-slate-400" : "text-slate-800"}`}
              >
                <p>{n.mensaje}</p>
                <p className="mt-0.5 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString("es-ES")}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
