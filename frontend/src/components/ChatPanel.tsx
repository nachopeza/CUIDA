import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import type { Interlocutores, Mensaje } from "../lib/types.js";

// Chat persona↔profesional (sección Usuario: "debe tener un chat con la
// profesional para comunicarse... estilo WhatsApp"; sección coordinación:
// "si es el mismo profesional se debe poder visualizar todo junto"): un
// único hilo por par persona-profesional, no uno por cada servicio. Sondeo
// simple cada pocos segundos: suficiente para fase 1, sin websockets.
export function ChatPanel({ profesionalId, personaId, compacto }: { profesionalId: string; personaId: string; compacto?: boolean }) {
  const { token, usuario } = useAuth();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [conQuien, setConQuien] = useState<Interlocutores | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  async function cargar() {
    const data = await api.get<Mensaje[]>(`/conversaciones/${profesionalId}/${personaId}/mensajes`, token);
    setMensajes(data);
  }

  useEffect(() => {
    cargar();
    // Quién lee esto al otro lado. Sin decirlo, se escribía "a la familia"
    // sin saber si hay alguien escuchando: la persona atendida puede no usar
    // la aplicación y hablar sólo con su hija.
    api
      .get<Interlocutores>(`/conversaciones/${profesionalId}/${personaId}`, token)
      .then(setConQuien)
      .catch(() => setConQuien(null));
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

  // Los que de verdad leen: la persona si tiene cuenta activa, más los
  // familiares autorizados no revocados.
  const lectores = conQuien
    ? [
        ...(conQuien.persona.tieneCuenta ? [conQuien.persona.nombre] : []),
        ...conQuien.familiares.map((f) => `${f.nombre} (${f.parentesco.toLowerCase()})`),
      ]
    : [];

  return (
    <div className={compacto ? "" : "tarjeta"}>
      {conQuien && (
        <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
          {lectores.length > 0 ? (
            <>
              Lo leen <span className="font-medium text-slate-700">{lectores.join(", ")}</span>
            </>
          ) : (
            <span className="text-amber-600">
              Nadie de la familia tiene acceso todavía: avisa a coordinación para que den de alta a un familiar.
            </span>
          )}
        </p>
      )}
      <div className={`space-y-2 overflow-y-auto p-3 ${compacto ? "max-h-64" : "max-h-72"}`}>
        {mensajes.length === 0 && <p className="text-sm text-slate-400">Todavía no hay mensajes. Escribe el primero.</p>}
        {mensajes.map((m) => {
          const esMio = m.autorUsuarioId === usuario?.id;
          // Quién escribe cada mensaje: en un hilo donde pueden entrar la
          // persona, dos hijos y coordinación, "no es mío" no basta.
          const quien = m.autor?.nombre ?? m.autor?.email;
          return (
            <div key={m.id} className={`flex ${esMio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${esMio ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>
                {!esMio && quien && <p className="mb-0.5 text-[11px] font-medium text-slate-500">{quien}</p>}
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
