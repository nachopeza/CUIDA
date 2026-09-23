import { useRef, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { IconCheck, IconFile, IconX } from "./icons.js";

// ---------------------------------------------------------------------------
// Subir un archivo al almacén
//
// Se manda el fichero tal cual como cuerpo de la petición, sin envolverlo en
// un formulario: el navegador ya sabe hacerlo y así el servidor no necesita
// un parser de multipart. El nombre viaja aparte, en la URL.
//
// Lo que se valida aquí es solo cortesía —avisar antes de gastar la subida—;
// la comprobación que cuenta la hace el servidor mirando los primeros bytes
// del contenido, porque el tipo que declara el navegador se puede falsear.
// ---------------------------------------------------------------------------

export interface ArchivoSubido {
  id: string;
  nombre: string;
  tipoMime: string;
  bytes: number;
}

const TIPOS = ["application/pdf", "image/jpeg", "image/png"];
const BYTES_MAX = 10 * 1024 * 1024;

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArchivoUpload({
  valor,
  onSubido,
  etiqueta = "Adjuntar archivo",
}: {
  valor: ArchivoSubido | null;
  onSubido: (archivo: ArchivoSubido | null) => void;
  etiqueta?: string;
}) {
  const { token } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);

  async function subir(file: File) {
    setError(null);
    if (!TIPOS.includes(file.type)) {
      return setError("Solo se aceptan PDF, JPG y PNG.");
    }
    if (file.size > BYTES_MAX) {
      return setError(`Pesa ${tamanoLegible(file.size)} y el máximo son 10 MB.`);
    }
    setSubiendo(true);
    try {
      const res = await fetch(`/api/archivos?nombre=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
        body: file,
      });
      const cuerpo = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) throw new Error(typeof cuerpo.error === "string" ? cuerpo.error : "No se ha podido subir");
      onSubido(cuerpo as ArchivoSubido);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido subir");
    } finally {
      setSubiendo(false);
    }
  }

  if (valor) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-brand-green-200 bg-brand-green-50 px-3 py-2 text-sm">
        <IconCheck className="h-4 w-4 shrink-0 text-brand-green-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-brand-green-800">{valor.nombre}</span>
        <span className="shrink-0 text-xs text-brand-green-700">{tamanoLegible(valor.bytes)}</span>
        <button
          type="button"
          onClick={() => onSubido(null)}
          className="shrink-0 rounded p-0.5 text-brand-green-700 hover:bg-brand-green-100"
          aria-label="Quitar el archivo"
        >
          <IconX className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          const file = e.dataTransfer.files[0];
          if (file) void subir(file);
        }}
        disabled={subiendo}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm transition ${
          encima ? "border-brand bg-brand-50 text-brand-800" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
        } disabled:opacity-60`}
      >
        <IconFile className="h-4 w-4 shrink-0" aria-hidden />
        {subiendo ? "Subiendo…" : etiqueta}
      </button>
      <input
        ref={input}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void subir(file);
          e.target.value = "";
        }}
      />
      <p className="mt-1 text-[11px] text-slate-400">PDF, JPG o PNG · hasta 10 MB · también se puede arrastrar aquí</p>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

// Ver o descargar un archivo ya guardado. Nunca es un enlace directo al
// fichero: pasa por el servidor, que comprueba antes quién pregunta.
export function ArchivoEnlace({ archivoId, nombre, className = "" }: { archivoId: string; nombre: string; className?: string }) {
  const { token } = useAuth();
  const [abriendo, setAbriendo] = useState(false);

  async function abrir(descargar: boolean) {
    setAbriendo(true);
    try {
      // La descarga necesita la cabecera de autorización, así que no vale un
      // <a href>: se pide, se convierte en un enlace temporal del propio
      // navegador y se suelta en cuanto se ha usado.
      const res = await fetch(`/api/archivos/${archivoId}${descargar ? "?descargar" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (descargar) {
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        a.click();
      } else {
        window.open(url, "_blank", "noopener");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      alert("No se ha podido abrir el archivo.");
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => abrir(false)}
        disabled={abriendo}
        className="inline-flex items-center gap-1 text-brand hover:text-brand-800 hover:underline disabled:opacity-50"
      >
        <IconFile className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {abriendo ? "Abriendo…" : "Ver"}
      </button>
      <button type="button" onClick={() => abrir(true)} className="text-slate-400 hover:text-slate-600 hover:underline">
        Descargar
      </button>
    </span>
  );
}
