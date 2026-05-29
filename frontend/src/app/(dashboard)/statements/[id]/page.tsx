"use client";

import { statementsApi, transactionsApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { EmptyState } from "@/components/ui/EmptyState";
import type { StatementQuality, StatementUpload, Transaction } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { ArrowLeft, Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Flow = "all" | "income" | "expense";

function fmt(value: string, currency = "CLP"): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default function StatementDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [meta, setMeta] = useState<StatementUpload | null>(null);
  const [quality, setQuality] = useState<StatementQuality | null>(null);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [flow, setFlow] = useState<Flow>("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace(`/login?next=/statements/${id}`); }, [hasVerified, router, user, id]);

  async function load() {
    setIsLoading(true);
    try {
      const [detail, list, qualityRes] = await Promise.all([
        statementsApi.detail(id),
        transactionsApi.list({ statement_id: id, limit: 500 }),
        statementsApi.quality(id),
      ]);
      setMeta(detail.data.uploaded_file);
      setRows(list.data);
      setQuality(qualityRes.data);
    } catch { setMessage("No se pudo cargar la cartola."); }
    finally { setIsLoading(false); }
  }
  useEffect(() => { if (user) void load(); }, [user, id]);

  async function reprocess() {
    setBusy(true); setMessage("");
    try { const res = await statementsApi.reprocess(id); setMessage(`Reprocesadas ${res.data.imported_transactions} transacciones.`); await load(); }
    catch { setMessage("No se pudo reprocesar."); } finally { setBusy(false); }
  }

  async function rollback() {
    setBusy(true); setMessage("");
    try {
      const res = await statementsApi.rollback(id);
      setMessage(`Rollback completado: ${res.data.deleted_transactions} movimiento(s) eliminados.`);
      router.push("/statements");
    } catch { setMessage("No se pudo revertir la cartola."); } finally { setBusy(false); }
  }

  const filtered = useMemo(() => rows.filter((tx) => {
    if (flow !== "all" && tx.movement_type !== flow) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return tx.description.toLowerCase().includes(q) || (tx.category?.name ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [rows, flow, search]);

  const totalIncome = rows.filter((t) => t.movement_type === "income").reduce((a, t) => a + Number(t.amount), 0);
  const totalExpense = rows.filter((t) => t.movement_type === "expense").reduce((a, t) => a + Number(t.amount), 0);
  const filteredSum = filtered.reduce((a, t) => a + (t.movement_type === "income" ? Number(t.amount) : -Number(t.amount)), 0);

  const flowTabs: { key: Flow; label: string }[] = [
    { key: "all", label: "todos" },
    { key: "income", label: "abonos" },
    { key: "expense", label: "cargos" },
  ];

  return (
    <div className="content">
      <div className="crumbs" style={{ marginBottom: 18 }}>
        <button onClick={() => router.push("/statements")} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", font: "inherit" }} className="mono"><ArrowLeft size={14} /> cartolas</button>
        <span className="sep">/</span><span className="here">{meta?.filename ?? "…"}</span>
      </div>

      <div className="title-row">
        <div>
          <h1 style={{ wordBreak: "break-all" }}>{meta?.filename ?? "…"}</h1>
          <div className="sub">
            {meta?.bank_detected ? `banco ${meta.bank_detected} · ` : ""}estado {meta?.status ?? "-"}
            {meta?.period_start && meta?.period_end ? ` · ${meta.period_start} → ${meta.period_end}` : ""}
          </div>
        </div>
        <div className="actions">
          <button onClick={() => window.open(`${transactionsApi.exportCsvUrl()}?statement_id=${id}`, "_blank")} className="btn ghost"><Download size={14} /> CSV</button>
          <button onClick={() => void reprocess()} disabled={busy} className="btn ghost">{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reprocesar</button>
          <ConfirmButton title="Revertir cartola" description="Esto eliminará la cartola y todos sus movimientos importados." confirmLabel="Revertir" disabled={busy} onConfirm={rollback} className="btn danger"><RotateCcw size={14} /> Rollback</ConfirmButton>
        </div>
      </div>

      {message ? <div className="insight" style={{ marginBottom: 16 }}><div className="insight-mark">¶</div><div className="insight-body"><div className="txt">{message}</div></div><div /></div> : null}

      {/* KPI strip */}
      <div className="strip">
        <div className="kpi on">
          <div className="lbl"><span className="sw" />Movimientos</div>
          <div className="val num">{rows.length}</div>
          <div className="sub">extraídos de la cartola</div>
        </div>
        <div className="kpi">
          <div className="lbl"><span className="sw" />Abonos</div>
          <div className="val"><span className="cu">CLP</span><span className="pos">{fmt(String(totalIncome)).replace(/[^\d.,-]/g, "")}</span></div>
          <div className="sub">{quality?.income_count ?? 0} mov.</div>
        </div>
        <div className="kpi r">
          <div className="lbl"><span className="sw" />Cargos</div>
          <div className="val"><span className="cu">CLP</span>{fmt(String(totalExpense)).replace(/[^\d.,-]/g, "")}</div>
          <div className="sub">{quality?.expense_count ?? 0} mov.</div>
        </div>
        <div className="kpi g">
          <div className="lbl"><span className="sw" />Calidad</div>
          <div className="val num">{quality?.uncategorized_count ?? 0}</div>
          <div className="sub">sin categoría · {quality?.parser ?? "parser ?"}</div>
        </div>
      </div>

      {/* Quality panel */}
      <div className={`insight${quality?.warnings.length ? "" : " ok"}`} style={{ marginBottom: 20 }}>
        <div className="insight-mark">{quality?.warnings.length ? "!" : "✓"}</div>
        <div className="insight-body">
          <div className="lbl">Calidad de importación · {quality?.parser ?? "parser desconocido"}</div>
          <div className="txt" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            <span className="chip"><span className="sw" />Sin categoría {quality?.uncategorized_count ?? 0}</span>
            <span className="chip g"><span className="sw" />Duplicados {quality?.duplicate_count ?? 0}</span>
            <span className="chip b"><span className="sw" />Internos {quality?.internal_transfer_count ?? 0}</span>
            <span className="chip k"><span className="sw" />Rango {quality?.period_start ?? "?"} → {quality?.period_end ?? "?"}</span>
          </div>
          {quality?.warnings.length ? (
            <ul style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2, color: "var(--gold)", fontSize: 12 }}>
              {quality.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
            </ul>
          ) : <p style={{ marginTop: 8, fontSize: 12, color: "var(--acc)" }}>Sin advertencias detectadas.</p>}
        </div>
        <div />
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="filt-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar descripción o categoría…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="filt">{filtered.length}/{rows.length}</span>
        <div className="seg" style={{ marginLeft: "auto" }}>
          {flowTabs.map((fl) => (
            <button key={fl.key} className={flow === fl.key ? "on" : ""} onClick={() => setFlow(fl.key)}>{fl.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="tbl">
        <div className="tbl-head" style={{ display: "grid", gridTemplateColumns: "60px 110px 1fr 200px 140px", gap: 14 }}>
          <div>#</div><div>Fecha</div><div>Descripción</div><div>Categoría</div><div className="r">Monto</div>
        </div>
        {isLoading ? (
          <p className="mono" style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-3)", padding: 24 }}><Loader2 className="animate-spin" size={16} /> Cargando…</p>
        ) : (
          <>
            {filtered.map((tx, i) => (
              <div key={tx.id} className="tbl-row" style={{ display: "grid", gridTemplateColumns: "60px 110px 1fr 200px 140px", gap: 14, background: tx.is_duplicate ? "rgba(230,184,92,0.04)" : undefined }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-4)" }}>{String(i + 1).padStart(3, "0")}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{tx.date}</div>
                <div style={{ fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.description}</span>
                  {tx.is_internal_transfer ? <span className="mono" style={{ fontSize: 10, color: "var(--blue)", background: "rgba(122,176,255,0.1)", padding: "1px 6px", borderRadius: 99 }}>interna</span> : null}
                  {tx.is_duplicate ? <span className="mono" style={{ fontSize: 10, color: "var(--gold)", background: "rgba(230,184,92,0.1)", padding: "1px 6px", borderRadius: 99 }}>duplicado</span> : null}
                </div>
                <div>
                  <span className={`chip${tx.category ? "" : " empty"}`}><span className="sw" />{tx.category?.name ?? "Sin asignar"}</span>
                </div>
                <div className="mono r" style={{ fontSize: 14, fontWeight: 500, color: tx.movement_type === "income" ? "var(--acc)" : "var(--text)" }}>
                  {tx.movement_type === "income" ? "+" : "−"}{fmt(tx.amount, tx.currency).replace(/[^\d.,-]/g, "")}
                </div>
              </div>
            ))}
            {filtered.length === 0 ? (
              <EmptyState title="Sin movimientos" description="No hay movimientos para el filtro actual." />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "60px 110px 1fr 200px 140px", gap: 14, padding: "11px 16px", borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
                <div /><div /><div /><div className="mono r" style={{ fontSize: 11, color: "var(--text-3)" }}>Neto filtrado</div>
                <div className="mono r" style={{ fontSize: 14, fontWeight: 500, color: filteredSum >= 0 ? "var(--acc)" : "var(--rust)" }}>{filteredSum >= 0 ? "+" : "−"}{fmt(String(Math.abs(filteredSum))).replace(/[^\d.,-]/g, "")}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
