"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { notificationsApi } from "@/lib/api";
import type { Notification } from "@/lib/api-types";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await notificationsApi.list()).data,
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (isLoading) {
    return (
      <div className="page page-max-lg">
        <p className="flex gap-2 font-mono text-sm text-[color:var(--text-3)]">
          <Loader2 className="animate-spin" /> Cargando…
        </p>
      </div>
    );
  }

  const notifications: Notification[] = data ?? [];

  return (
    <div className="page page-max-lg">
      <div className="page-h">
        <div>
          <h1>Notificaciones</h1>
          <p className="page-desc">
            {notifications.filter((n) => !n.read_at).length} sin leer
          </p>
        </div>
        {notifications.some((n) => !n.read_at) ? (
          <button type="button" className="btn" onClick={() => markAll.mutate()}>
            Marcar todo leído
          </button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <div className="empty">
          <p>No hay notificaciones.</p>
        </div>
      ) : (
        <ul className="stack">
          {notifications.map((n) => (
            <li
              key={n.id}
              className="card"
              style={{
                cursor: !n.read_at ? "pointer" : "default",
                borderLeft: !n.read_at ? "3px solid var(--gold)" : undefined,
                opacity: n.read_at ? 0.6 : 1,
              }}
              onClick={() => {
                if (!n.read_at) markOne.mutate(n.id);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{n.title}</strong>
                {!n.read_at ? <span className="badge badge-warning">Nueva</span> : null}
              </div>
              {n.body ? <p style={{ margin: "6px 0" }}>{n.body}</p> : null}
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                {new Date(n.created_at).toLocaleString("es-CL")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
