import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { IconFile } from "./icons.js";
import type { Documento } from "../lib/types.js";

// Documentos del profesional (sección "ver toda su información...
// documentación. Un perfil completamente avanzado"): DNI, certificados,
// seguros — una lista simple de nombre + enlace, sin subida de ficheros
// (fase 1: se guarda la URL, no el binario).
export function DocumentosProfesional({ profesionalId }: { profesionalId: string }) {
  const { token } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setDocumentos(await api.get<Documento[]>(`/profesionales/${profesionalId}/documentos`, token));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesionalId]);

  async function añadir() {
    if (!nombre.trim() || !url.trim()) return;
    setGuardando(true);
    try {
      await api.post(`/profesionales/${profesionalId}/documentos`, { nombre: nombre.trim(), url: url.trim() }, token);
      setNombre("");
      setUrl("");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(documentoId: string) {
    await api.delete(`/profesionales/${profesionalId}/documentos/${documentoId}`, token);
    await cargar();
  }

  return (
    <div>
      {documentos.length === 0 && <p className="mb-2 text-xs text-slate-400">Sin documentos todavía.</p>}
      {documentos.length > 0 && (
        <ul className="mb-2 space-y-1">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs">
              <a href={d.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                <IconFile className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                      {d.nombre}
              </a>
              <button onClick={() => eliminar(d.id)} className="text-slate-400 hover:text-rose-600">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          placeholder="Nombre (ej. DNI, certificado…)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        />
        <input placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
        <button onClick={añadir} disabled={guardando || !nombre.trim() || !url.trim()} className="rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">
          Añadir
        </button>
      </div>
    </div>
  );
}
