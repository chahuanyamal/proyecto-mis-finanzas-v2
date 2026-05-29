"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { notificationsApi } from "@/lib/api";
import type { Notification } from "@/lib/api-types";

// Tono del marcador/chip según el tipo de notificación.
const TYPE_TONE: Record<string, { tone: string; label: string }> = {
  budget_alert: { tone: "warn", label: "Presupuesto" },
  budget: { tone: "warn", label: "Presupuesto" },
  anomaly: { tone: "err", label: "Anomalía" },
  recurring: { tone: "ok", label: "Recurrente" },
  statement: { tone: "ok", label: "Cartola" },
  system: { tone: "", label: "Sistema" },
};

function toneOf(type: string) {
  return TYPE_TONE[type] ?? { tone: "", label: type || "Aviso" };
}

function relTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await notificationsApi.list()).data,
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["nav-count", "notifications"] });
    },
  });

  const markOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["nav-count", "notifications"] });
    },
  });

  const notifications: Notification[] = data ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Notifica<span className="serif">ciones</span>
          </h1>
          <div className="sub">
            {notifications.length} en total · <strong>{unread} sin leer</strong>
          </div>
        </div>
        {unread > 0 ? (
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              {markAll.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Marcar todo leído
            </button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 font-mono text-[13px] text-[color:var(--text-3)]">
          <Loader2 className="animate-spin" size={18} /> Cargando notificaciones…
        </div>
      ) : notifications.length === 0 ? (
        <div className="tbl">
          <div className="empty">
            <div className="empty-mark">✓</div>
            <h4>Todo al día</h4>
            <p>No tienes notificaciones pendientes.</p>
          </div>
        </div>
      ) : (
        <div className="tbl">
          {notifications.map((n) => {
            const { tone, label } = toneOf(n.type);
            const isUnread = !n.read_at;
            return (
              <div
                key={n.id}
                onClick={() => isUnread && markOne.mutate(n.id)}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-4 border-b border-[color:var(--line-2)] px-4 py-4 last:border-0"
                style={{
                  cursor: isUnread ? "pointer" : "default",
                  background: isUnread ? "rgba(230,184,92,0.04)" : undefined,
                  opacity: isUnread ? 1 : 0.6,
                }}
              >
                <span
                  className="mt-1 inline-block h-2 w-2 rounded-full"
                  style={{
                    background:
                      tone === "warn"
                        ? "var(--gold)"
                        : tone === "err"
                          ? "var(--rust)"
                          : tone === "ok"
                            ? "var(--acc)"
                            : "var(--text-3)",
                  }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[color:var(--text)]">{n.title}</span>
                    <span className={`chip ${tone}`}>
                      <span className="sw" />
                      {label}
                    </span>
                    {isUnread ? (
                      <span className="chip warn">
                        <span className="sw" />
                        Nueva
                      </span>
                    ) : null}
                  </div>
                  {n.body ? <p className="mt-1 text-[12px] text-[color:var(--text-2)]">{n.body}</p> : null}
                </div>
                <span className="whitespace-nowrap font-mono text-[11px] text-[color:var(--text-3)]">
                  {relTime(n.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
