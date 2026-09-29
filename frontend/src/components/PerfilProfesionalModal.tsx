import { useEffect, useState } from "react";
import { Modal } from "./Modal.js";
import { Avatar } from "./Avatar.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { IconAlert, IconCheck, IconPhone, IconPin } from "./icons.js";
import { parsearDisponibilidad } from "../lib/disponibilidad.js";
import { etiquetaCarne, etiquetaTitulacion, zonaDe } from "../lib/territorio.js";
import { textoCarencia } from "../lib/personal.js";
import type { FichaProfesional, Profesional } from "../lib/types.js";

// El perfil de un profesional, para decidir a quién se le da un servicio.
//
// Quien se apunta a una solicitud aparecía en la ficha como un nombre y una
// frase: para elegir entre tres candidatas había que salir, buscar cada una en
// Profesionales y volver. Aquí está lo que decide: quién es, qué sabe hacer,
// dónde trabaja, cuándo puede y si tiene los papeles en regla.
export function PerfilProfesionalModal({ profesionalId, mensaje, onClose, onElegir }: {
  profesionalId: string;
  // Lo que dijo al apuntarse, si dijo algo.
  mensaje?: string | null;
  onClose: () => void;
  // Elegirla desde aquí mismo, sin volver a la lista.
  onElegir?: (profesionalId: string) => void;
}) {
  const { token } = useAuth();
  const [pro, setPro] = useState<Profesional | null>(null);
  const [ficha, setFicha] = useState<FichaProfesional | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Profesional>(`/profesionales/${profesionalId}`, token),
      // El estado de sus papeles: puede que no se pueda ni proponer.
      api.get<FichaProfesional[]>("/personal", token).catch(() => [] as FichaProfesional[]),
    ])
      .then(([p, equipo]) => {
        setPro(p);
        setFicha(equipo.find((m) => m.id === profesionalId) ?? null);
      })
      .catch(() => setError("No se ha podido cargar el perfil."));
  }, [profesionalId, token]);

  if (!pro) {
    return (
      <Modal title="Perfil" onClose={onClose}>
        <p className="text-sm text-slate-500">{error ?? "Cargando…"}</p>
      </Modal>
    );
  }

  const disp = parsearDisponibilidad(pro.disponibilidad);
  const impedimentos = ficha?.carencias.filter((c) => c.motivo !== "por_caducar") ?? [];

  return (
    <Modal title={`${pro.nombre} ${pro.apellidos}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar foto={pro.foto} nombre={pro.nombre} apellidos={pro.apellidos} className="h-14 w-14" />
          <div className="min-w-0">
            <p className="font-medium text-slate-800">
              {pro.nombre} {pro.apellidos}
            </p>
            <p className="text-xs text-slate-400">
              {pro.codigo} · {pro.empresaColaboradora ? `Trabaja para ${pro.empresaColaboradora.nombre}` : "Plantilla propia"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
              {zonaDe(pro) && (
                <span className="flex items-center gap-1">
                  <IconPin className="h-3.5 w-3.5 text-slate-400" /> {zonaDe(pro)}
                </span>
              )}
              {pro.telefono && (
                <span className="flex items-center gap-1">
                  <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {pro.telefono}
                </span>
              )}
            </p>
          </div>
        </div>

        {mensaje && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-700">
            <span className="text-xs font-medium text-amber-700">Al apuntarse dijo:</span> "{mensaje}"
          </p>
        )}

        {pro.biografia ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Experiencia</p>
            <p className="whitespace-pre-line text-sm text-slate-600">{pro.biografia}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Todavía no ha escrito su experiencia.</p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Titulación</dt>
            <dd className="text-slate-700">{etiquetaTitulacion(pro.titulacion) || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Carné y vehículo</dt>
            <dd className="text-slate-700">
              {etiquetaCarne(pro.carneConducir) || "—"}
              {pro.vehiculoPropio ? " · con vehículo propio" : ""}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-400">Disponibilidad que ha indicado</dt>
            <dd className="text-slate-700">{disp.dias.length > 0 ? `${disp.dias.join(" · ")} — ${disp.franja.toLowerCase()}` : "No ha indicado"}</dd>
          </div>
        </dl>

        {ficha &&
          (impedimentos.length > 0 ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No se le puede asignar todavía: {impedimentos.map((c) => textoCarencia(c).toLowerCase()).join("; ")}.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-brand-green-700">
              <IconCheck className="h-3.5 w-3.5" /> Documentación en regla.
            </p>
          ))}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="boton-secundario-sm">
            Cerrar
          </button>
          {onElegir && (
            <button
              onClick={() => onElegir(pro.id)}
              disabled={impedimentos.length > 0}
              title={impedimentos.length > 0 ? "Le faltan papeles" : undefined}
              className="boton-principal-sm disabled:opacity-50"
            >
              Elegirla para este servicio
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
