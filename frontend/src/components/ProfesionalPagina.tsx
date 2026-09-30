import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth.js";
import { api } from "../lib/api.js";
import { useRefrescoAutomatico } from "../lib/refresco.js";
import { diaDe } from "../lib/fechas.js";
import { euros } from "../lib/economia.js";
import { etiquetaTitulacion, zonaDe } from "../lib/territorio.js";
import { parsearDisponibilidad } from "../lib/disponibilidad.js";
import type { EmpresaColaboradora, Profesional, Servicio } from "../lib/types.js";
import { Avatar } from "./Avatar.js";
import { EstadoBadge } from "./EstadoBadge.js";
import { BajaProfesionalModal } from "./BajaProfesionalModal.js";
import { ExpedienteDocumentos } from "./ExpedienteDocumentos.js";
import { resumenDisponibilidad } from "./DisponibilidadPicker.js";
import { Bloque, Dato, Etiqueta, Fila, FichaCabecera, Pestanas, RejillaFicha, AccionesRapidas } from "./ficha.js";
import { ProfesionalFormulario } from "../pages/coordinador/ProfesionalFormModal.js";
import { IconBan, IconBriefcase, IconCalendar, IconCheck, IconKey, IconMail, IconPencil, IconPhone, IconPin, IconRefresh, IconUsers } from "./icons.js";

// ---------------------------------------------------------------------------
// La página de una profesional
//
// Misma estructura que la del servicio y la de la persona: volver, título con su
// estado, dos tarjetas de contexto, una franja de datos, pestañas y, a la
// derecha, lo que se hace y el dinero. Antes era una ventana emergente con un
// formulario de veinte campos, y dar de baja, el expediente y los pagos colgaban
// debajo del botón de guardar.
// ---------------------------------------------------------------------------

type Pestana = "resumen" | "servicios" | "pagos" | "expediente" | "datos" | "acceso";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "servicios", etiqueta: "Servicios" },
  { clave: "pagos", etiqueta: "Pagos" },
  { clave: "expediente", etiqueta: "Expediente" },
  { clave: "datos", etiqueta: "Datos" },
  { clave: "acceso", etiqueta: "Acceso y situación" },
];

interface LiquidacionResumen {
  id: string;
  codigo: string;
  mes: string;
  neto: string | number;
  estado: string;
  profesional: { id: string };
}

export function ProfesionalPagina({
  profesionalId,
  onVolver,
  onChanged,
  etiquetaVolver = "Volver a profesionales",
  onAbrirSolicitud,
}: {
  profesionalId: string;
  onVolver: () => void;
  onChanged: () => void;
  etiquetaVolver?: string;
  onAbrirSolicitud?: (solicitudId: string) => void;
}) {
  const { token } = useAuth();
  const [pro, setPro] = useState<Profesional | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionResumen[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaColaboradora[]>([]);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [dandoDeBaja, setDandoDeBaja] = useState(false);
  const [passwordReseteada, setPasswordReseteada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    try {
      const [p, todos, liqs, emps] = await Promise.all([
        api.get<Profesional>(`/profesionales/${profesionalId}`, token),
        api.get<Servicio[]>("/servicios", token).catch(() => [] as Servicio[]),
        api.get<LiquidacionResumen[]>("/liquidaciones", token).catch(() => [] as LiquidacionResumen[]),
        api.get<EmpresaColaboradora[]>("/empresas-colaboradoras", token).catch(() => [] as EmpresaColaboradora[]),
      ]);
      setPro(p);
      setServicios(todos.filter((s) => s.profesionalId === profesionalId));
      setLiquidaciones(liqs.filter((l) => l.profesional.id === profesionalId));
      setEmpresas(emps);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^"|"$/g, "") : "No se ha podido cargar la ficha");
    }
  }

  useEffect(() => {
    setPro(null);
    setPestana("resumen");
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profesionalId]);

  useRefrescoAutomatico(cargar, 30000);

  const enMarcha = useMemo(() => servicios.filter((s) => ["ASIGNADO", "CONFIRMADO", "EN_CURSO", "FINALIZADO", "VALIDADO"].includes(s.estado)), [servicios]);
  const terminados = useMemo(() => servicios.filter((s) => ["CERRADO", "CANCELADO"].includes(s.estado)), [servicios]);

  const pagado = liquidaciones.filter((l) => l.estado === "PAGADA").reduce((a, l) => a + Number(l.neto), 0);
  const pendiente = liquidaciones.filter((l) => l.estado !== "PAGADA").reduce((a, l) => a + Number(l.neto), 0);

  if (error && !pro) {
    return (
      <div className="tarjeta p-6 text-sm text-slate-600">
        <button onClick={onVolver} className="mb-3 text-sm text-slate-500 hover:text-slate-800">
          ← {etiquetaVolver}
        </button>
        <p className="text-rose-600">{error}</p>
      </div>
    );
  }
  if (!pro) return <p className="p-6 text-sm text-slate-400">Cargando…</p>;

  const deBaja = pro.estado === "INACTIVO";
  const disp = parsearDisponibilidad(pro.disponibilidad);
  const nombre = `${pro.nombre} ${pro.apellidos}`;

  async function resetearPassword() {
    const r = await api.post<{ passwordGenerada: string }>(`/profesionales/${profesionalId}/cuenta/password`, {}, token);
    setPasswordReseteada(r.passwordGenerada);
    setPestana("acceso");
  }

  async function reactivar() {
    await api.post(`/profesionales/${profesionalId}/reactivar`, {}, token);
    setAviso(`${pro!.nombre} vuelve a estar en activo.`);
    await cargar();
    onChanged();
  }

  return (
    <div className="space-y-4">
      <FichaCabecera
        volver={etiquetaVolver}
        onVolver={onVolver}
        titulo={nombre}
        etiquetas={
          <span className={`pastilla ${deBaja ? "bg-slate-200 text-slate-600" : "bg-brand-green-100 text-brand-green-700"}`}>
            {deBaja ? <IconBan className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />} {deBaja ? "De baja" : "Activa"}
          </span>
        }
        linea={
          <>
            {pro.codigo}
            {pro.titulacion ? ` · ${etiquetaTitulacion(pro.titulacion)}` : ""}
          </>
        }
        acciones={
          <button onClick={() => setPestana("datos")} className="boton-secundario">
            <IconPencil className="h-4 w-4" /> Editar datos
          </button>
        }
        menu={[
          { etiqueta: "Resetear contraseña", Icono: IconKey, alPulsar: () => void resetearPassword(), razon: pro.usuario ? null : "Todavía no tiene cuenta de acceso." },
          deBaja
            ? { etiqueta: "Reactivar", Icono: IconRefresh, alPulsar: () => void reactivar() }
            : { etiqueta: "Dar de baja", Icono: IconBan, peligro: true, alPulsar: () => setDandoDeBaja(true) },
        ]}
      />

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 px-4 py-2.5 text-sm text-brand-green-800" role="status">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-brand-green-700 hover:underline">
            Cerrar
          </button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="tarjeta flex items-start gap-4 p-4">
          <Avatar foto={pro.foto} nombre={pro.nombre} apellidos={pro.apellidos} className="h-14 w-14 !text-sm" />
          <div className="min-w-0 flex-1">
            <Etiqueta>Profesional</Etiqueta>
            <p className="truncate text-base font-semibold text-slate-800">{nombre}</p>
            <p className="text-xs text-slate-400">{pro.codigo}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              {pro.telefono && (
                <p className="flex items-center gap-2">
                  <IconPhone className="h-3.5 w-3.5 text-slate-400" /> {pro.telefono}
                </p>
              )}
              <p className="flex items-start gap-2">
                <IconPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> <span className="min-w-0">{zonaDe(pro)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="tarjeta flex items-start gap-4 p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-700">
            <IconBriefcase className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <Etiqueta>Cómo trabaja</Etiqueta>
            <p className="truncate text-base font-semibold text-slate-800">{pro.empresaColaboradora?.nombre ?? "Independiente"}</p>
            <p className="text-xs text-slate-400">{pro.tipoRelacion === "AUTONOMO" ? "Autónoma" : pro.tipoRelacion === "LABORAL" ? "Contrato laboral" : "Sin indicar"}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <IconCalendar className="h-3.5 w-3.5 text-slate-400" /> {resumenDisponibilidad(disp)}
              </p>
              <p className="flex items-center gap-2">
                <IconMail className="h-3.5 w-3.5 text-slate-400" /> {pro.usuario ? pro.usuario.email : "Sin cuenta de acceso"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="tarjeta p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Dato etiqueta="Servicios en marcha">{enMarcha.length}</Dato>
          <Dato etiqueta="Servicios terminados">{terminados.length}</Dato>
          <Dato etiqueta="Cobrado">{euros(pagado)}</Dato>
          <Dato etiqueta="Pendiente de pago">{euros(pendiente)}</Dato>
        </div>
      </div>

      <RejillaFicha>
        <div className="min-w-0 space-y-4">
          <Pestanas valor={pestana} onCambiar={setPestana} opciones={PESTANAS} />

          {pestana === "resumen" && (
            <>
              <Bloque titulo="Sobre ella">
                <p className="whitespace-pre-line text-sm text-slate-600">{pro.biografia || "Todavía no hay biografía."}</p>
              </Bloque>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
                <Bloque titulo="Perfil">
                  <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Dato etiqueta="Titulación">{etiquetaTitulacion(pro.titulacion) || "Sin indicar"}</Dato>
                    <Dato etiqueta="Carné">{pro.carneConducir && pro.carneConducir !== "NO" ? pro.carneConducir : "Sin carné"}</Dato>
                    <Dato etiqueta="Vehículo propio">{pro.vehiculoPropio ? "Sí" : "No"}</Dato>
                    <Dato etiqueta="Horas semanales">{pro.horasSemanales ?? "—"}</Dato>
                  </div>
                </Bloque>
                <Bloque titulo="Servicios en marcha">
                  {enMarcha.length === 0 ? (
                    <p className="text-sm text-slate-400">No tiene ninguno ahora mismo.</p>
                  ) : (
                    <ListaServicios servicios={enMarcha.slice(0, 5)} onAbrir={onAbrirSolicitud} />
                  )}
                </Bloque>
              </div>
            </>
          )}

          {pestana === "servicios" && (
            <Bloque titulo="Historial de servicios">
              {servicios.length === 0 ? <p className="text-sm text-slate-400">Todavía no ha hecho ningún servicio.</p> : <ListaServicios servicios={servicios} onAbrir={onAbrirSolicitud} />}
            </Bloque>
          )}

          {pestana === "pagos" && (
            <Bloque titulo="Liquidaciones">
              {liquidaciones.length === 0 ? (
                <p className="text-sm text-slate-400">Todavía no hay liquidaciones.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Liquidación</th>
                        <th className="py-2 pr-3 font-semibold">Mes</th>
                        <th className="py-2 pr-3 text-right font-semibold">Neto</th>
                        <th className="py-2 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {liquidaciones.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2 pr-3 font-medium text-slate-700">{l.codigo}</td>
                          <td className="py-2 pr-3 text-slate-600">{l.mes}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{euros(l.neto)}</td>
                          <td className="py-2">
                            <EstadoBadge estado={l.estado} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Bloque>
          )}

          {pestana === "expediente" && (
            <Bloque titulo="Expediente">
              <ExpedienteDocumentos profesionalId={pro.id} />
            </Bloque>
          )}

          {pestana === "datos" && (
            <Bloque titulo="Datos de la profesional">
              <ProfesionalFormulario
                profesional={pro}
                empresas={empresas}
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

          {pestana === "acceso" && (
            <div className="space-y-4">
              <Bloque titulo="Cuenta de acceso">
                {pro.usuario ? (
                  <div className="space-y-2 text-sm">
                    <p className="text-slate-700">
                      {pro.usuario.email} {!pro.usuario.activo && <span className="text-rose-600">(inactiva)</span>}
                    </p>
                    {passwordReseteada ? (
                      <p className="rounded-lg bg-brand-green-50 px-3 py-2 text-brand-green-800">
                        Nueva contraseña: <strong>{passwordReseteada}</strong> (apúntala, no se repetirá)
                      </p>
                    ) : (
                      <button onClick={() => void resetearPassword()} className="boton-secundario-sm">
                        <IconKey className="h-3.5 w-3.5" /> Resetear contraseña
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Todavía no tiene cuenta de acceso.</p>
                )}
              </Bloque>
              <Bloque titulo="Situación">
                {deBaja ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      <span className="font-medium text-slate-800">De baja.</span> No se le puede proponer nada y su cuenta no puede entrar.
                    </p>
                    <button onClick={() => void reactivar()} className="boton-secundario-sm">
                      Reactivar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">En activo. Si deja de trabajar con nosotros, se da de baja sin perder su historial.</p>
                    <button onClick={() => setDandoDeBaja(true)} className="boton-peligro-suave-sm">
                      Dar de baja…
                    </button>
                  </div>
                )}
              </Bloque>
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <AccionesRapidas
            acciones={[
              { etiqueta: "Editar datos", Icono: IconPencil, alPulsar: () => setPestana("datos") },
              { etiqueta: "Ver expediente", Icono: IconUsers, alPulsar: () => setPestana("expediente") },
              { etiqueta: "Resetear contraseña", Icono: IconKey, alPulsar: () => void resetearPassword(), oculto: !pro.usuario },
              { etiqueta: "Dar de baja", Icono: IconBan, alPulsar: () => setDandoDeBaja(true), oculto: deBaja },
              { etiqueta: "Reactivar", Icono: IconRefresh, alPulsar: () => void reactivar(), oculto: !deBaja },
            ]}
          />
          <Bloque titulo="Datos económicos">
            <dl className="space-y-2 text-sm">
              <Fila etiqueta="Cobrado" valor={euros(pagado)} bueno={pagado > 0} />
              <Fila etiqueta="Pendiente de pago" valor={euros(pendiente)} aviso={pendiente > 0} />
              <div className="my-2 border-t border-slate-100" />
              <Fila etiqueta="Liquidaciones" valor={String(liquidaciones.length)} />
            </dl>
          </Bloque>
          <Bloque titulo="Información adicional">
            <Etiqueta>Pago</Etiqueta>
            <p className="mt-0.5 text-sm text-slate-600">{pro.numeroCuenta ? `IBAN ${pro.numeroCuenta}` : "Sin IBAN"}</p>
            {pro.bizum && <p className="text-sm text-slate-600">Bizum {pro.bizum}</p>}
            {pro.dni && <p className="mt-2 text-xs text-slate-500">DNI {pro.dni}</p>}
          </Bloque>
        </aside>
      </RejillaFicha>

      {dandoDeBaja && (
        <BajaProfesionalModal
          profesionalId={pro.id}
          nombre={nombre}
          onClose={() => setDandoDeBaja(false)}
          onHecho={async () => {
            setAviso(`${pro.nombre} está de baja.`);
            await cargar();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ListaServicios({ servicios, onAbrir }: { servicios: Servicio[]; onAbrir?: (solicitudId: string) => void }) {
  return (
    <ul className="divide-y divide-slate-100">
      {servicios.map((s) => {
        const fila = (
          <span className="flex w-full items-center justify-between gap-3 py-2 text-left">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-700">
                {s.solicitud?.persona.nombre} {s.solicitud?.persona.apellidos} · {s.solicitud?.necesidad.nombre}
              </span>
              <span className="text-xs text-slate-400">
                {s.codigo}
                {s.updatedAt ? ` · ${diaDe(s.updatedAt)}` : ""}
              </span>
            </span>
            <EstadoBadge estado={s.estado} />
          </span>
        );
        return (
          <li key={s.id}>
            {onAbrir && s.solicitud ? (
              <button onClick={() => onAbrir(s.solicitud!.id)} className="w-full hover:bg-slate-50">
                {fila}
              </button>
            ) : (
              fila
            )}
          </li>
        );
      })}
    </ul>
  );
}
