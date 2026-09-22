import { useEffect, useState, type SVGProps } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import {
  IconActivity,
  IconAlert,
  IconBan,
  IconBriefcase,
  IconCheck,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconEuro,
  IconFamily,
  IconFlag,
  IconHandshake,
  IconKey,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconTrash,
} from "../../components/icons.js";
import type { AuditLogEntry } from "../../lib/types.js";

// Ruido que no aporta al equipo de coordinación (accesos técnicos), fuera.
const OCULTAR = new Set(["login", "ver_persona"]);

// Icono por tipo de acción. Agrupado por lo que hace, no por la entidad que
// toca: al repasar la actividad lo que se busca es "qué ha pasado".
const ICONOS_ACTIVIDAD: Record<string, (p: SVGProps<SVGSVGElement>) => JSX.Element> = {
  solicitar_cancelacion_servicio: IconBan,
  confirmar_cancelacion_servicio: IconBan,
  rechazar_cancelacion_servicio: IconRefresh,
  crear_incidencia: IconAlert,
  cambiar_estado_incidencia: IconAlert,
  eliminar_incidencia: IconTrash,
  aceptar_servicio: IconCheckCircle,
  crear_solicitud: IconClipboard,
  crear_servicio: IconBriefcase,
  finalizar_visita: IconFlag,
  revisar_visita: IconCheck,
  corregir_tiempo_visita: IconClock,
  editar_persona: IconPencil,
  crear_persona: IconPlus,
  crear_cuenta_persona: IconKey,
  crear_profesional: IconPlus,
  crear_empresa_colaboradora: IconPlus,
  vincular_familiar: IconFamily,
  actualizar_tarifa_servicio: IconEuro,
  asignar_servicio: IconHandshake,
  reemplazar_profesional_servicio: IconRefresh,
  generar_factura: IconReceipt,
};

// Feed reutilizable: la pestaña Actividad lo usa completo, el Resumen del
// dashboard lo usa recortado (sección "actividad reciente").
export function ActividadFeed({ limit, sinTitulo }: { limit?: number; sinTitulo?: boolean }) {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    api.get<AuditLogEntry[]>("/auditoria", token).then(setLogs);
  }, [token]);

  const visibles = logs.filter((l) => !OCULTAR.has(l.accion)).slice(0, limit);

  const contenido = (
    <>
      {visibles.length === 0 && <p className="text-sm text-slate-500">Sin actividad relevante todavía.</p>}
      <ul className="divide-y divide-slate-100">
        {visibles.map((log) => (
          <li key={log.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                {(() => {
                  const Pinta = ICONOS_ACTIVIDAD[log.accion] ?? IconActivity;
                  return <Pinta className="h-3.5 w-3.5 shrink-0 text-slate-400" />;
                })()}
                {log.accion.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString("es-ES")}</span>
            </div>
            <p className="text-xs text-slate-400">
              {log.usuario?.email ?? "sistema"} {log.entidadTipo && `· ${log.entidadTipo}`} {log.detalle && `· ${log.detalle}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );

  if (sinTitulo) return contenido;
  return <Card title="Actividad reciente">{contenido}</Card>;
}

// Sustituye a un log de auditoría centrado en logins (poco útil para el día
// a día) por un resumen de lo que de verdad importa: cancelaciones,
// incidencias, altas y cambios de estado.
export function ActividadTab() {
  return <ActividadFeed />;
}
