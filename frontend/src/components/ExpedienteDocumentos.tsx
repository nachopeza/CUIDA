import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { ArchivoEnlace, ArchivoUpload, type ArchivoSubido } from "./ArchivoUpload.js";
import { IconPlus, IconTrash } from "./icons.js";
import { DOCUMENTOS_OBLIGATORIOS, ETIQUETA_DOCUMENTO, TONO_VIGENCIA, textoVigencia, vigenciaDe } from "../lib/personal.js";
import type { DocumentoProfesional, TipoDocumento } from "../lib/types.js";

const TIPOS: TipoDocumento[] = ["DNI", "DELITOS_SEXUALES", "TITULACION", "CONTRATO", "ALTA_SEGURIDAD_SOCIAL", "CARNE_CONDUCIR", "SEGURO", "FORMACION", "OTRO"];

function fecha(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

// Los documentos de una profesional: el expediente.
//
// Había dos sitios para lo mismo. "Mi contrato" enseñaba los papeles con su tipo
// y su caducidad, y "Mis documentos" guardaba un nombre y un enlace suelto que
// no contaba para nada —ni para los obligatorios, ni para los avisos de
// caducidad— y que además nadie de coordinación veía en su expediente. Ahora es
// un único componente y una única tabla: se ve, se sube y se renueva aquí, y
// coordinación mira exactamente lo mismo.
//
// `propio` distingue quién lo mira: la profesional puede aportar y retirar lo
// que subió como "otro"; lo que prueba que se cumple la ley (DNI, certificado de
// delitos sexuales, contrato) lo quita quien responde de ello.
export function ExpedienteDocumentos({
  profesionalId,
  propio = false,
  onCambiado,
}: {
  profesionalId: string;
  propio?: boolean;
  onCambiado?: () => void | Promise<void>;
}) {
  const { token } = useAuth();
  const [documentos, setDocumentos] = useState<DocumentoProfesional[]>([]);
  const [form, setForm] = useState({ tipo: (propio ? "OTRO" : "DELITOS_SEXUALES") as TipoDocumento, nombre: "", fechaEmision: "", fechaCaducidad: "" });
  const [archivo, setArchivo] = useState<ArchivoSubido | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setDocumentos(await api.get<DocumentoProfesional[]>(`/personal/${profesionalId}/documentos`, token).catch(() => []));
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesionalId]);

  // El nombre del documento sale del fichero si no se ha escrito otro: nadie
  // quiere teclear "Certificado.pdf" después de haberlo subido.
  function alSubir(a: ArchivoSubido | null) {
    setArchivo(a);
    if (a && !form.nombre.trim()) setForm((f) => ({ ...f, nombre: a.nombre.replace(/\.[^.]+$/, "") }));
  }

  async function anadir() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await api.post(
        `/personal/${profesionalId}/documentos`,
        { ...form, archivoId: archivo?.id ?? null, fechaEmision: form.fechaEmision || null, fechaCaducidad: form.fechaCaducidad || null },
        token,
      );
      setForm((f) => ({ ...f, nombre: "", fechaEmision: "", fechaCaducidad: "" }));
      setArchivo(null);
      await cargar();
      await onCambiado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(d: DocumentoProfesional) {
    if (!window.confirm(`¿Quitar "${d.nombre}" del expediente?`)) return;
    setError(null);
    try {
      await api.delete(`/personal/documentos/${d.id}`, token);
      await cargar();
      await onCambiado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido quitar");
    }
  }

  const puedeQuitar = (d: DocumentoProfesional) => !propio || d.tipo === "OTRO";

  return (
    <div className="space-y-2">
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      {documentos.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">Sin documentos.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">{d.nombre}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
                  {ETIQUETA_DOCUMENTO[d.tipo]}
                  {d.fechaEmision && <span>· emitido {fecha(d.fechaEmision)}</span>}
                  {d.archivoId ? (
                    <>
                      <span>·</span>
                      <ArchivoEnlace archivoId={d.archivoId} nombre={d.nombre} />
                    </>
                  ) : (
                    // Anotado sin el papel: se dice, porque es justo el caso que
                    // parecía resuelto y no lo estaba.
                    <span className="text-amber-700">· sin el documento subido</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONO_VIGENCIA[vigenciaDe(d.fechaCaducidad)]}`}>{textoVigencia(d)}</span>
                {puedeQuitar(d) && (
                  <button onClick={() => void quitar(d)} className="text-slate-300 hover:text-rose-600" title="Quitar del expediente">
                    <IconTrash className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:col-span-2">{propio ? "Aportar un documento" : "Añadir al expediente"}</p>
        <label className="text-xs text-slate-500">
          Tipo
          <select
            value={form.tipo}
            onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoDocumento }))}
            className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_DOCUMENTO[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Referencia
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder={propio ? "Renovación del seguro de responsabilidad" : "Certificación negativa del Registro Central"}
            className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Emitido el
          <input type="date" value={form.fechaEmision} onChange={(e) => setForm((f) => ({ ...f, fechaEmision: e.target.value }))} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          Caduca el
          <input type="date" value={form.fechaCaducidad} onChange={(e) => setForm((f) => ({ ...f, fechaCaducidad: e.target.value }))} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <div className="sm:col-span-2">
          <ArchivoUpload valor={archivo} onSubido={alSubir} etiqueta="Subir el documento (PDF, JPG o PNG)" />
        </div>
        {/* Un obligatorio sin fichero no desbloquea a nadie, así que se dice
            antes de guardar, no después. */}
        {!archivo && DOCUMENTOS_OBLIGATORIOS.includes(form.tipo) && (
          <p className="text-xs text-amber-700 sm:col-span-2">{ETIQUETA_DOCUMENTO[form.tipo]} es obligatorio: sin el documento subido seguirá contando como que falta.</p>
        )}
        <button
          onClick={() => void anadir()}
          disabled={guardando || !form.nombre.trim()}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50 sm:col-span-2"
        >
          <IconPlus className="h-3.5 w-3.5" /> {guardando ? "Guardando…" : propio ? "Guardar en mi expediente" : "Añadir al expediente"}
        </button>
      </div>
    </div>
  );
}
