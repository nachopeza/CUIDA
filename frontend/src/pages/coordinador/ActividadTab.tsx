import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { AuditLogEntry } from "../../lib/types.js";

// Ruido que no aporta al equipo de coordinación (accesos técnicos), fuera.
const OCULTAR = new Set(["login", "ver_persona"]);

const ICONOS: Record<string, string> = {
  solicitar_cancelacion_servicio: "🚫",
  confirmar_cancelacion_servicio: "❌",
  rechazar_cancelacion_servicio: "↩️",
  crear_incidencia: "⚠️",
  cambiar_estado_incidencia: "⚠️",
  aceptar_servicio: "✅",
  crear_solicitud: "📝",
  crear_servicio: "🛠️",
  finalizar_visita: "🏁",
  revisar_visita: "📋",
  editar_persona: "✏️",
  crear_persona: "➕",
  crear_profesional: "➕",
  crear_empresa_colaboradora: "➕",
  vincular_familiar: "👪",
  actualizar_tarifa_servicio: "💶",
  asignar_servicio: "🤝",
};

// Sustituye a un log de auditoría centrado en logins (poco útil para el día
// a día) por un resumen de lo que de verdad importa: cancelaciones,
// incidencias, altas y cambios de estado.
export function ActividadTab() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    api.get<AuditLogEntry[]>("/auditoria", token).then(setLogs);
  }, [token]);

  const visibles = logs.filter((l) => !OCULTAR.has(l.accion));

  return (
    <Card title="Actividad reciente">
      {visibles.length === 0 && <p className="text-sm text-slate-500">Sin actividad relevante todavía.</p>}
      <ul className="divide-y divide-slate-100">
        {visibles.map((log) => (
          <li key={log.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {ICONOS[log.accion] ? `${ICONOS[log.accion]} ` : ""}
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
    </Card>
  );
}
