import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import type { Mensaje } from "../lib/types.js";

// Chat persona↔profesional (sección Usuario: "debe tener un chat con la
// profesional para comunicarse... estilo WhatsApp"; sección coordinación:
// "si es el mismo profesional se debe poder visualizar todo junto"): un
// único hilo por par persona-profesional, no uno por cada servicio. Sondeo
// simple cada pocos segundos: suficiente para fase 1, sin websockets.
export function ChatPanel({ profesionalId, personaId, compacto }: { profesionalId: string; personaId: string; compacto?: boolean }) {
  const { token, usuario } = useAuth();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  async function cargar() {
    const data = await api.get<Mensaje[]>(`/conversaciones/${profesionalId}/${personaId}/mensajes`, token);
    setMensajes(data);
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 6000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesionalId, personaId, token]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes.length]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api.post(`/conversaciones/${profesionalId}/${personaId}/mensajes`, { texto: texto.trim() }, token);
      setTexto("");
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={compacto ? "" : "rounded-lg border border-slate-200 bg-white"}>
      <div className={`space-y-2 overflow-y-auto p-3 ${compacto ? "max-h-64" : "max-h-72"}`}>
        {mensajes.length === 0 && <p className="text-sm text-slate-400">Todavía no hay mensajes. Escribe el primero.</p>}
        {mensajes.map((m) => {
          const esMio = m.autorUsuarioId === usuario?.id;
          return (
            <div key={m.id} className={`flex ${esMio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${esMio ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>
                <p>{m.texto}</p>
                <p className={`mt-0.5 text-[10px] ${esMio ? "text-brand-100" : "text-slate-400"}`}>
                  {new Date(m.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>
      <form onSubmit={enviar} className="flex gap-2 border-t border-slate-100 p-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
