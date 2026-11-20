import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { useFichas } from "../lib/fichas.js";
import { useRefrescoAutomatico } from "../lib/refresco.js";
import type { EmpresaColaboradora, Profesional, Servicio } from "../lib/types.js";
import { Avatar } from "./Avatar.js";
import { EstadoBadge } from "./EstadoBadge.js";
import { Indicadores, TarjetaMarca } from "./identidad.js";
import { AccionesRapidas, Bloque, Dato, Etiqueta, FichaCabecera, Pestanas, RejillaFicha } from "./ficha.js";
import { EmpresaFormulario } from "../pages/coordinador/EmpresaFormModal.js";
import { IconAlert, IconBan, IconBriefcase, IconBuilding, IconCheck, IconClipboard, IconNote, IconPencil, IconPin, IconRefresh, IconShield, IconUsers } from "./icons.js";

// ---------------------------------------------------------------------------
// La página de una empresa colaboradora
//
// Lo que se viene a mirar de una empresa es si se le puede encargar trabajo (el
// contrato de encargo del art. 28 RGPD), quién trabaja para ella y qué servicios
// lleva. Misma estructura que el resto de fichas.
// ---------------------------------------------------------------------------

type Pestana = "resumen" | "profesionales" | "servicios" | "datos";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "profesionales", etiqueta: "Profesionales" },
  { clave: "servicios", etiqueta: "Servicios" },
  { clave: "datos", etiqueta: "Datos" },
];

const EN_MARCHA = ["ASIGNADO", "CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO"];

export function EmpresaPagina({
  empresaId,
  onVolver,
  onChanged,
  onAbrirSolicitud,
  etiquetaVolver = "Volver a empresas",
}: {
  empresaId: string;
  onVolver: () => void;
  onChanged: () => void;
  onAbrirSolicitud: (solicitudId: string) => void;
  etiquetaVolver?: string;
}) {
  const { token } = useAuth();
  const { abrirProfesional } = useFichas();
  const [empresa, setEmpresa] = useState<EmpresaColaboradora | null>(null);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    const [emps, pros, srvs] = await Promise.all([
      api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token),
      api.get<Profesional[]>("/profesionales", token).catch(() => [] as Profesional[]),
      api.get<Servicio[]>("/servicios", token).catch(() => [] as Servicio[]),
    ]);
    const e = emps.find((x) => x.id === empresaId) ?? null;
    setEmpresa(e);
    setNoEncontrada(!e);
    setProfesionales(pros.filter((p) => p.empresaColaboradoraId === empresaId));
    setServicios(srvs.filter((s) => s.empresaColaboradoraId === empresaId));
  }

  useEffect(() => {
    setEmpresa(null);
    setPestana("resumen");
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useRefrescoAutomatico(cargar, 30000);

  const enMarcha = useMemo(() => servicios.filter((s) => EN_MARCHA.includes(s.estado)), [servicios]);

  if (noEncontrada) {
    return (
      <div className="tarjeta p-6 text-sm text-slate-600">
        <button onClick={onVolver} className="mb-3 text-sm text-slate-500 hover:text-slate-800">
          ← {etiquetaVolver}
        </button>
        <p>Esta empresa ya no existe.</p>
      </div>
    );
  }
  if (!empresa) return <p className="p-6 text-sm text-slate-400">Cargando…</p>;

  const deBaja = empresa.estado === "INACTIVA";
  const encargo = !!empresa.encargoFirmado;

  async function cambiarEstado(estado: "ACTIVA" | "INACTIVA") {
    await api.patch(`/empresas-colaboradoras/${empresaId}`, { estado }, token);
    setAviso(estado === "INACTIVA" ? `${empresa!.nombre} está de baja: no se le pueden asignar servicios nuevos.` : `${empresa!.nombre} vuelve a estar activa.`);
    await cargar();
    onChanged();
  }

  return (
    <div className="space-y-4">
      <FichaCabecera
        antetitulo="Empresa colaboradora"
        figura={
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand shadow-tarjeta ring-4 ring-brand-50">
            <IconBuilding className="h-8 w-8" />
          </span>
        }
        volver={etiquetaVolver}
        onVolver={onVolver}
        titulo={empresa.nombre}
        etiquetas={
          <>
            <span className={`pastilla ${deBaja ? "bg-slate-200 text-slate-600" : "bg-brand-green-100 text-brand-green-700"}`}>
              {deBaja ? <IconBan className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />} {deBaja ? "De baja" : "Activa"}
            </span>
            {!encargo && (
              <span className="pastilla bg-amber-100 text-amber-800">
                <IconAlert className="h-3.5 w-3.5" /> Sin contrato de encargo
              </span>
            )}
          </>
        }
        linea={
          <>
            {empresa.codigo}
            {empresa.cif ? ` · CIF ${empresa.cif}` : ""}
          </>
        }
        acciones={
          <button onClick={() => setPestana("datos")} className="boton-secundario">
            <IconPencil className="h-4 w-4" /> Editar datos
          </button>
        }
        menu={[
          deBaja
            ? { etiqueta: "Reactivar", Icono: IconRefresh, alPulsar: () => void cambiarEstado("ACTIVA") }
            : { etiqueta: "Dar de baja", Icono: IconBan, peligro: true, alPulsar: () => void cambiarEstado("INACTIVA") },
        ]}
      />

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 px-4 py-2.5 text-sm text-brand-green-800" role="status">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="shrink-0 text-brand-green-700 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="tarjeta flex items-start gap-4 p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand">
            <IconBuilding className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <Etiqueta>Empresa colaboradora</Etiqueta>
            <p className="truncate text-base font-semibold text-slate-800">{empresa.nombre}</p>
            <p className="text-xs text-slate-400">{empresa.codigo}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <IconUsers className="h-3.5 w-3.5 text-slate-400" /> {empresa.contacto || "Sin persona de contacto"}
              </p>
              <p className="flex items-start gap-2">
                <IconPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="min-w-0">{empresa.direccion || "Sin dirección"}</span>
              </p>
            </div>
          </div>
        </div>

        <div className={`tarjeta flex items-start gap-4 p-4 ${encargo ? "" : "!border-amber-200"}`}>
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${encargo ? "bg-brand-green-50 text-brand-green-700" : "bg-amber-50 text-amber-600"}`}>
            <IconShield className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <Etiqueta>Contrato de encargo (art. 28 RGPD)</Etiqueta>
            <p className="text-base font-semibold text-slate-800">{encargo ? "Firmado" : "Sin firmar"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {encargo
                ? `Firmado${empresa.encargoFecha ? ` el ${new Date(empresa.encargoFecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}` : ""}: se le pueden asignar servicios.`
                : "Hasta que se firme no se le puede asignar ningún servicio: asignarlo le entrega datos de la persona."}
            </p>
          </div>
          {!encargo && (
            <button onClick={() => setPestana("datos")} className="boton-secundario-sm shrink-0">
              Registrarlo
            </button>
          )}
        </div>
      </div>

      <Indicadores
        items={[
          { etiqueta: "Profesionales", valor: profesionales.length, detalle: "Trabajan para ella", Icono: IconUsers, tono: "verde", onClick: () => setPestana("profesionales") },
          { etiqueta: "Servicios en marcha", valor: enMarcha.length, detalle: `${servicios.length} en total`, Icono: IconBriefcase, tono: "azul", onClick: () => setPestana("servicios") },
          { etiqueta: "Contrato de encargo", valor: encargo ? "Firmado" : "Sin firmar", detalle: "Art. 28 RGPD", Icono: IconShield, tono: encargo ? "verde" : "rose" },
          { etiqueta: "Estado", valor: deBaja ? "De baja" : "Activa", detalle: deBaja ? "Sin servicios nuevos" : "Se le puede asignar", Icono: deBaja ? IconBan : IconCheck, tono: deBaja ? "amber" : "verde" },
        ]}
      />

      <RejillaFicha>
        <div className="min-w-0 space-y-4">
          <Pestanas valor={pestana} onCambiar={setPestana} opciones={PESTANAS} />

          {(pestana === "resumen" || pestana === "profesionales") && (
            <Bloque titulo="Profesionales que trabajan para ella" Icono={IconUsers} tono="verde">
              {profesionales.length === 0 ? (
                <p className="text-sm text-slate-400">Ninguna profesional está vinculada a esta empresa.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {profesionales.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => abrirProfesional(p.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
                        <Avatar foto={p.foto} nombre={p.nombre} apellidos={p.apellidos} className="h-8 w-8" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-700">
                            {p.nombre} {p.apellidos}
                          </span>
                          <span className="text-xs text-slate-400">{p.codigo}</span>
                        </span>
                        <EstadoBadge estado={p.estado} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>
          )}

          {(pestana === "resumen" || pestana === "servicios") && (
            <Bloque titulo={pestana === "resumen" ? "Servicios en marcha" : "Servicios"}>
              {(pestana === "resumen" ? enMarcha : servicios).length === 0 ? (
                <p className="text-sm text-slate-400">{pestana === "resumen" ? "No lleva ninguno ahora mismo." : "Todavía no ha llevado ningún servicio."}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(pestana === "resumen" ? enMarcha : servicios).map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => s.solicitud && onAbrirSolicitud(s.solicitud.id)}
                        className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-700">
                            {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos} · {s.solicitud?.necesidad.nombre}
                          </span>
                          <span className="text-xs text-slate-400">
                            {s.codigo}
                            {s.profesional ? ` · ${s.profesional.nombre} ${s.profesional.apellidos}` : ""}
                          </span>
                        </span>
                        <EstadoBadge estado={s.estado} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>
          )}

          {pestana === "datos" && (
            <Bloque titulo="Datos de la empresa" Icono={IconPencil} tono="azul">
              <EmpresaFormulario
                empresa={empresa}
                onCancelar={() => setPestana("resumen")}
                onSaved={async () => {
                  setAviso("Datos guardados.");
                  setPestana("resumen");
                  await cargar();
                  onChanged();
                }}
              />
            </Bloque>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <AccionesRapidas
            acciones={[
              { etiqueta: "Editar datos", Icono: IconPencil, alPulsar: () => setPestana("datos") },
              { etiqueta: "Registrar el contrato de encargo", Icono: IconShield, alPulsar: () => setPestana("datos"), oculto: encargo },
              { etiqueta: "Dar de baja", Icono: IconBan, alPulsar: () => void cambiarEstado("INACTIVA"), oculto: deBaja },
              { etiqueta: "Reactivar", Icono: IconRefresh, alPulsar: () => void cambiarEstado("ACTIVA"), oculto: !deBaja },
            ]}
          />
          <Bloque titulo="Información adicional" Icono={IconNote} tono="azul">
            <Etiqueta>Cobro</Etiqueta>
            <p className="mt-0.5 text-sm text-slate-600">{empresa.numeroCuenta ? `IBAN ${empresa.numeroCuenta}` : "Sin IBAN"}</p>
            <div className="mt-3">
              <Etiqueta>CIF</Etiqueta>
              <p className="mt-0.5 text-sm text-slate-600">{empresa.cif || "Sin CIF"}</p>
            </div>
          </Bloque>
        </aside>
      </RejillaFicha>
    </div>
  );
}
