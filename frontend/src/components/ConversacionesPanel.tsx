import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { ChatPanel } from "./ChatPanel.js";
import { IconChat } from "./icons.js";
import type { Conversacion } from "../lib/types.js";

// Bandeja de conversaciones (sección "el panel de chat debe ser más
// intuitivo, no una caja por cada servicio... eso evoca confusión sobre por
// dónde hablar. Si es el mismo profesional se debe poder visualizar todo
// junto"): una fila compacta por cada persona con la que se puede hablar,
// con solo un hilo abierto a la vez — no N cajas idénticas en pantalla.
export function ConversacionesPanel({ verNombrePersona }: { verNombrePersona?: boolean }) {
  const { token } = useAuth();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);

  async function cargar() {
    setConversaciones(await api.get<Conversacion[]>("/conversaciones", token));
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 15000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (conversaciones.length === 0) return null;

  return (
    <div className="mb-4 tarjeta">
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">
        <IconChat className="h-4 w-4 text-slate-400" /> Mensajes
      </div>
      <ul className="divide-y divide-slate-100">
        {conversaciones.map((c) => {
          const clave = `${c.profesionalId}:${c.personaId}`;
          const nombreContraparte = verNombrePersona
            ? `${c.persona?.nombre ?? ""} ${c.persona?.apellidos ?? ""}`.trim()
            : `${c.profesional?.nombre ?? ""} ${c.profesional?.apellidos ?? ""}`.trim();
          return (
            <li key={clave}>
              <button
                onClick={() => setAbierta(abierta === clave ? null : clave)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{nombreContraparte || "Sin nombre"}</p>
                  {c.ultimoMensaje && <p className="truncate text-xs text-slate-400">{c.ultimoMensaje.texto}</p>}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{abierta === clave ? "Ocultar" : "Abrir"}</span>
              </button>
              {abierta === clave && (
                <div className="border-t border-slate-100 px-2 pb-2">
                  <ChatPanel profesionalId={c.profesionalId} personaId={c.personaId} compacto />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
