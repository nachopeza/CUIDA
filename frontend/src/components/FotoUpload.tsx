import { useRef, useState } from "react";

const LADO_MAX = 320;

// Redimensiona la imagen en el propio navegador antes de guardarla (sección
// "que los perfiles puedan subir su foto"): sin backend de ficheros, el
// resultado es un dataURL que cabe en el campo `foto` ya existente —
// redimensionar evita guardar fotos de varios MB tal cual.
function redimensionar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = () => {
        const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala);
        const h = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no soportado"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(file);
  });
}

export function FotoUpload({ value, onChange, nombre }: { value: string; onChange: (dataUrl: string) => void; nombre: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setProcesando(true);
    try {
      const dataUrl = await redimensionar(file);
      onChange(dataUrl);
    } catch {
      setError("No se pudo procesar la imagen. Prueba con otra.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="" className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-500">
          {nombre.slice(0, 1).toUpperCase() || "?"}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={procesando}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {procesando ? "Procesando…" : value ? "Cambiar foto" : "Subir foto"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">
              Quitar
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={alElegirArchivo} className="hidden" />
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
