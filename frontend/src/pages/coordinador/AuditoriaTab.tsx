import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth.js";
import { api } from "../../lib/api.js";
import { Card } from "../../components/Layout.js";
import type { AuditLogEntry } from "../../lib/types.js";

export function AuditoriaTab() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    api.get<AuditLogEntry[]>("/auditoria", token).then(setLogs);
  }, [token]);

  return (
    <Card title="Últimas acciones registradas">
      {logs.length === 0 && <p className="text-sm text-slate-500">Sin actividad registrada todavía.</p>}
      <ul className="divide-y divide-slate-100">
        {logs.map((log) => (
          <li key={log.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{log.accion.replace(/_/g, " ")}</span>
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
