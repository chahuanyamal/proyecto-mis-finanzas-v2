"use client";

import { auditApi } from "@/lib/api";
import type { AuditEvent } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuditPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [entityType, setEntityType] = useState("");
  const [limit, setLimit] = useState(200);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/audit"); }, [hasVerified, router, user]);
  useEffect(() => { if (user) auditApi.list({ entity_type: entityType || undefined, limit }).then((r) => setItems(r.data)).catch(() => setError("No se pudo cargar auditoría.")); }, [entityType, limit, user]);

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Auditor<span className="serif">ía</span>
          </h1>
          <div className="sub">
            <strong>sistema</strong> · registro local de acciones importantes
          </div>
        </div>
        <div className="actions">
          <a className="btn ghost" href={auditApi.exportCsvUrl({ entity_type: entityType || undefined, limit })}>
            Exportar CSV
          </a>
        </div>
      </div>

      <div className="filters">
        <div className="filt-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Filtrar entidad: transaction, statement…" />
        </div>
        <select className="input" style={{ width: 160 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={100}>100 eventos</option>
          <option value={200}>200 eventos</option>
          <option value={500}>500 eventos</option>
          <option value={1000}>1000 eventos</option>
        </select>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="lbl">Error</div>
            <div className="txt">{error}</div>
          </div>
          <div />
        </div>
      ) : null}

      <div className="tbl">
        <div className="tbl-head" style={{ display: "grid", gridTemplateColumns: "180px 180px 1fr 2fr", gap: 14 }}>
          <div>Fecha</div>
          <div>Acción</div>
          <div>Entidad</div>
          <div>Detalle</div>
        </div>
        {items.map((item) => (
          <div key={item.id} className="tbl-row" style={{ display: "grid", gridTemplateColumns: "180px 180px 1fr 2fr", gap: 14 }}>
            <div className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(item.created_at).toLocaleString("es-CL")}</div>
            <div className="mono" style={{ color: "var(--acc)", fontSize: 12 }}>{item.action}</div>
            <div style={{ fontSize: 13 }}>
              {item.entity_type}
              {item.entity_id ? <span className="mono" style={{ color: "var(--text-3)" }}>{` · ${item.entity_id.slice(0, 8)}`}</span> : null}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.metadata_json ? JSON.stringify(item.metadata_json) : "—"}
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">∅</div>
            <h4>Sin eventos registrados</h4>
            <p>Cuando ocurran acciones importantes aparecerán aquí.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
