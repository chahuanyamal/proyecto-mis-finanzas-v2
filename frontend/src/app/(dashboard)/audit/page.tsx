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
    <section className="p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="card p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-400">Sistema</p><h1 className="mt-2">Auditoría</h1><p className="mt-2 text-sm text-slate-400">Registro local de acciones importantes.</p></div><a className="btn-secondary" href={auditApi.exportCsvUrl({ entity_type: entityType || undefined, limit })}>Exportar CSV</a></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]"><input className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Filtrar entidad: transaction, statement..." /><select className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={limit} onChange={(e) => setLimit(Number(e.target.value))}><option value={100}>100 eventos</option><option value={200}>200 eventos</option><option value={500}>500 eventos</option><option value={1000}>1000 eventos</option></select></div></header>
        {error ? <div className="card border-red-500/40 p-4 text-sm text-red-300">{error}</div> : null}
        <section className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Acción</th><th className="px-3 py-2">Entidad</th><th className="px-3 py-2">Detalle</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((item) => <tr key={item.id}><td className="px-3 py-2 text-slate-400">{new Date(item.created_at).toLocaleString("es-CL")}</td><td className="px-3 py-2 text-brand-300">{item.action}</td><td className="px-3 py-2">{item.entity_type}{item.entity_id ? ` · ${item.entity_id.slice(0, 8)}` : ""}</td><td className="px-3 py-2 text-xs text-slate-500">{item.metadata_json ? JSON.stringify(item.metadata_json) : "-"}</td></tr>)}
              {items.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">Sin eventos registrados.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}
