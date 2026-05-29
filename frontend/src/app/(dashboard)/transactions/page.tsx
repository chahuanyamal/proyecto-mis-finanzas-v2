"use client";

import { accountsApi, categoriesApi, tagsApi, transactionsApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { Account, Category, SplitPayload, Tag, Transaction, TransactionFilters, TransactionPayload, TransactionSummary } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Download, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

function today(): string { return new Date().toISOString().slice(0, 10); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
const emptyForm: TransactionPayload = { account_id: "", category_id: null, date: today(), description: "", amount: "0", currency: "CLP", movement_type: "expense", notes: "" };

const PAGE_SIZE = 100;
type Flow = "all" | "income" | "expense";
type FilterState = { account_id: string; category_id: string; start_date: string; end_date: string; search: string; flow: Flow };
const emptyFilters: FilterState = { account_id: "", category_id: "", start_date: "", end_date: "", search: "", flow: "all" };

const PRESETS: { key: string; label: string; range: () => { start: string; end: string } }[] = [
  { key: "month", label: "Este mes", range: () => { const n = new Date(); return { start: iso(new Date(n.getFullYear(), n.getMonth(), 1)), end: today() }; } },
  { key: "30d", label: "Últimos 30 días", range: () => { const n = new Date(); const s = new Date(n); s.setDate(n.getDate() - 30); return { start: iso(s), end: today() }; } },
  { key: "ytd", label: "Año a la fecha", range: () => { const n = new Date(); return { start: iso(new Date(n.getFullYear(), 0, 1)), end: today() }; } },
  { key: "12m", label: "Últimos 12 meses", range: () => { const n = new Date(); const s = new Date(n); s.setMonth(n.getMonth() - 12); return { start: iso(s), end: today() }; } },
  { key: "all", label: "Todo", range: () => ({ start: "", end: "" }) },
];

function fmt(value: number | string, currency = "CLP"): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
// Swatch tonal por categoría — color estable derivado del nombre (paleta Bóveda).
const CHIP_PALETTE = ["var(--acc)", "var(--gold)", "var(--rust)", "var(--violet)", "var(--blue)", "var(--text-2)"];
function chipColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHIP_PALETTE[h % CHIP_PALETTE.length];
}

export default function TransactionsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [form, setForm] = useState<TransactionPayload>(emptyForm);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [extra, setExtra] = useState({ is_internal_transfer: false, is_duplicate: false, is_flagged: false, flag_reason: "" });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [splits, setSplits] = useState<SplitPayload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/transactions"); }, [hasVerified, router, user]);

  const baseParams = useCallback((): TransactionFilters => {
    const p: TransactionFilters = {};
    if (filters.account_id) p.account_id = filters.account_id;
    if (filters.category_id) p.category_id = filters.category_id;
    if (filters.start_date) p.start_date = filters.start_date;
    if (filters.end_date) p.end_date = filters.end_date;
    if (filters.search.trim()) p.search = filters.search.trim();
    if (filters.flow !== "all") p.movement_type = filters.flow;
    return p;
  }, [filters]);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, sum] = await Promise.all([
        transactionsApi.list({ ...baseParams(), limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
        transactionsApi.summary(baseParams()),
      ]);
      setTransactions(list.data);
      setSummary(sum.data);
    } catch { setError("No se pudieron cargar las transacciones."); }
    finally { setIsLoading(false); }
  }, [baseParams, page]);

  const loadRefs = useCallback(async () => {
    try {
      const [a, c, t] = await Promise.all([accountsApi.list(), categoriesApi.list(), tagsApi.list()]);
      setAccounts(a.data); setCategories(c.data); setTags(t.data);
      if (!form.account_id && a.data[0]) setForm((v) => ({ ...v, account_id: a.data[0].id }));
    } catch { setError("No se pudieron cargar cuentas, categorías o etiquetas."); }
  }, [form.account_id]);

  useEffect(() => { if (user) void loadRefs(); }, [user, loadRefs]);
  useEffect(() => { if (user) void loadTransactions(); }, [user, loadTransactions]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [filters]);

  function reset() { setForm({ ...emptyForm, account_id: accounts[0]?.id ?? "" }); setEditing(null); setExtra({ is_internal_transfer: false, is_duplicate: false, is_flagged: false, flag_reason: "" }); setTagIds([]); setSplits([]); }
  function edit(tx: Transaction) {
    setEditing(tx);
    setForm({ account_id: tx.account_id, category_id: tx.category_id, date: tx.date, description: tx.description, amount: tx.amount, currency: tx.currency, movement_type: tx.movement_type, notes: tx.notes ?? "" });
    setExtra({ is_internal_transfer: tx.is_internal_transfer, is_duplicate: tx.is_duplicate, is_flagged: tx.is_flagged, flag_reason: tx.flag_reason ?? "" });
    setTagIds(tx.tags.map((t) => t.id));
    setSplits(tx.splits.map((s) => ({ category_id: s.category_id, amount: s.amount, notes: s.notes })));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.account_id) { setError("Crea o selecciona una cuenta primero."); return; }
    setError("");
    try {
      const payload = { ...form, category_id: form.category_id || null };
      if (editing) {
        await transactionsApi.update(editing.id, { ...payload, is_internal_transfer: extra.is_internal_transfer, is_duplicate: extra.is_duplicate });
        await transactionsApi.setFlag(editing.id, extra.is_flagged, extra.flag_reason || null);
        await transactionsApi.setTags(editing.id, tagIds);
        const cleanSplits = splits.filter((s) => Number(s.amount) > 0);
        if (cleanSplits.length) await transactionsApi.setSplits(editing.id, cleanSplits);
        else if (editing.splits.length) await transactionsApi.clearSplits(editing.id);
      } else {
        await transactionsApi.create(payload);
      }
      reset(); await loadTransactions();
    } catch { setError("No se pudo guardar la transacción."); }
  }
  async function remove(id: string) {
    try { await transactionsApi.remove(id); if (editing?.id === id) reset(); await loadTransactions(); } catch { setError("No se pudo eliminar la transacción."); }
  }
  async function autoCategorize() {
    setBusy(true); setInfo(""); setError("");
    try { const { data } = await transactionsApi.autoCategorize(); setInfo(`Auto-categorización: ${data.updated} movimiento(s) actualizados.`); await loadTransactions(); }
    catch { setError("No se pudo auto-categorizar."); } finally { setBusy(false); }
  }
  function exportFile(kind: "csv" | "excel") {
    const params = new URLSearchParams();
    if (filters.start_date) params.set("start_date", filters.start_date);
    if (filters.end_date) params.set("end_date", filters.end_date);
    const url = kind === "csv" ? transactionsApi.exportCsvUrl() : transactionsApi.exportExcelUrl();
    const qs = params.toString();
    window.open(`${url}${qs ? `?${qs}` : ""}`, "_blank");
  }

  function toggleSel(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function bulkApplyCategory() {
    if (!selected.size) return;
    try { await transactionsApi.bulkCategory([...selected], bulkCategory || null); setSelected(new Set()); await loadTransactions(); }
    catch { setError("No se pudo categorizar en lote."); }
  }
  async function bulkRemove() {
    if (!selected.size) return;
    try { await transactionsApi.bulkDelete([...selected]); setSelected(new Set()); await loadTransactions(); }
    catch { setError("No se pudo eliminar en lote."); }
  }

  // KPIs: moneda principal = la de mayor conteo
  const primaryCurrency = useMemo(() => {
    if (!summary) return "CLP";
    let best = "CLP"; let max = -1;
    for (const [cur, v] of Object.entries(summary.by_currency)) if (v.count > max) { max = v.count; best = cur; }
    return best;
  }, [summary]);
  const cur = summary?.by_currency[primaryCurrency];
  const income = Number(cur?.income ?? 0);
  const expense = Number(cur?.expense ?? 0);
  const net = income - expense;
  const dayCount = filters.start_date && filters.end_date
    ? Math.max(1, Math.round((Date.parse(filters.end_date) - Date.parse(filters.start_date)) / 86400000) + 1)
    : 30;

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of transactions) { if (!map.has(tx.date)) map.set(tx.date, []); map.get(tx.date)!.push(tx); }
    return [...map.entries()];
  }, [transactions]);

  const selectedTotal = transactions.filter((t) => selected.has(t.id)).reduce((a, t) => a + (t.movement_type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
  const flowTabs: { key: Flow; label: string }[] = [
    { key: "all", label: "todos" },
    { key: "income", label: "ingresos" },
    { key: "expense", label: "gastos" },
  ];

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>Libro <span className="serif">mayor</span></h1>
          <div className="sub">
            {summary?.total_count ?? transactions.length} movimientos
            {" · saldo neto "}
            <strong style={{ color: net >= 0 ? "var(--acc)" : "var(--rust)" }}>{net >= 0 ? "+" : ""}{fmt(net, primaryCurrency)}</strong>
          </div>
        </div>
        <div className="actions">
          <select className="filt" style={{ appearance: "auto" }} onChange={(e) => { const p = PRESETS.find((x) => x.key === e.target.value); if (p) { const r = p.range(); setFilters((f) => ({ ...f, start_date: r.start, end_date: r.end })); } }} defaultValue="">
            <option value="" disabled>Período…</option>
            {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button onClick={() => void autoCategorize()} disabled={busy} className="btn ghost">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Auto</button>
          <button onClick={() => exportFile("csv")} className="btn ghost"><Download size={14} /> CSV</button>
          <button onClick={() => exportFile("excel")} className="btn ghost"><Download size={14} /> Excel</button>
          <button onClick={() => { reset(); }} className="btn primary">+ Movimiento</button>
        </div>
      </div>

      {error ? <div className="insight err" style={{ marginBottom: 16 }}><div className="insight-mark">!</div><div className="insight-body"><div className="txt">{error}</div></div><div /></div> : null}
      {info ? <div className="insight ok" style={{ marginBottom: 16 }}><div className="insight-mark">✓</div><div className="insight-body"><div className="txt">{info}</div></div><div /></div> : null}

      {/* KPI strip */}
      <div className="strip">
        <div className="kpi">
          <div className="lbl"><span className="sw" />Ingresos</div>
          <div className="val"><span className="cu">{primaryCurrency}</span>{fmt(income, primaryCurrency).replace(/[^\d.,-]/g, "")}</div>
          <div className="sub">período seleccionado</div>
        </div>
        <div className="kpi r">
          <div className="lbl"><span className="sw" />Egresos</div>
          <div className="val"><span className="cu">{primaryCurrency}</span>{fmt(expense, primaryCurrency).replace(/[^\d.,-]/g, "")}</div>
          <div className="sub">{summary?.uncategorized_count ?? 0} sin categoría</div>
        </div>
        <div className="kpi on">
          <div className="lbl"><span className="sw" />Saldo neto</div>
          <div className="val"><span className="cu">{primaryCurrency}</span><span className={net >= 0 ? "pos" : "neg"}>{net >= 0 ? "+" : "−"}{fmt(Math.abs(net), primaryCurrency).replace(/[^\d.,-]/g, "")}</span></div>
          <div className="sub">{income > 0 ? `${Math.round((net / income) * 100)}% del ingreso` : "—"}</div>
        </div>
        <div className="kpi g">
          <div className="lbl"><span className="sw" />Promedio diario</div>
          <div className="val"><span className="cu">{primaryCurrency}</span>{fmt(expense / dayCount, primaryCurrency).replace(/[^\d.,-]/g, "")}</div>
          <div className="sub">{dayCount} días observados</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="filt-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar descripción, monto, referencia…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        {filters.start_date || filters.end_date ? (
          <span className="filt on" onClick={() => setFilters((f) => ({ ...f, start_date: "", end_date: "" }))}>
            {filters.start_date || "inicio"} → {filters.end_date || "hoy"}<span className="x">×</span>
          </span>
        ) : null}
        <select className="filt" style={{ appearance: "auto" }} value={filters.account_id} onChange={(e) => setFilters((f) => ({ ...f, account_id: e.target.value }))}>
          <option value="">cuenta · todas</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="filt" style={{ appearance: "auto" }} value={filters.category_id} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
          <option value="">categoría · todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" className="filt" style={{ appearance: "auto" }} value={filters.start_date} onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))} />
        <input type="date" className="filt" style={{ appearance: "auto" }} value={filters.end_date} onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))} />
        <div className="seg" style={{ marginLeft: "auto" }}>
          {flowTabs.map((fl) => (
            <button key={fl.key} className={filters.flow === fl.key ? "on" : ""} onClick={() => setFilters((f) => ({ ...f, flow: fl.key }))}>{fl.label}</button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="panel" style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", marginBottom: 10, background: "rgba(94,233,181,0.06)", borderColor: "rgba(94,233,181,0.18)" }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: "var(--acc)", color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 10 }}>✓</span>
          <strong className="mono" style={{ color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{selected.size} seleccionados</strong>
          <span className="mono" style={{ color: "var(--text-3)" }}>· neto {fmt(selectedTotal, primaryCurrency)}</span>
          <div style={{ flex: 1 }} />
          <select className="filt" style={{ appearance: "auto" }} value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => void bulkApplyCategory()} className="btn primary">Categorizar</button>
          <ConfirmButton title="Eliminar movimientos" description={`Se eliminarán ${selected.size} movimiento(s) seleccionados.`} confirmLabel="Eliminar" onConfirm={bulkRemove} className="btn danger">Eliminar</ConfirmButton>
          <button onClick={() => setSelected(new Set())} className="btn ghost">Limpiar</button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="mono" style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-3)", padding: "32px 0" }}><Loader2 className="animate-spin" size={16} /> Cargando…</p>
      ) : (
        <>
          <div className="tbl">
            <div className="tbl-head" style={{ display: "grid", gridTemplateColumns: "30px 88px 1fr 200px 170px 130px 30px", gap: 14 }}>
              <div />
              <div>Fecha ↓</div>
              <div>Descripción</div>
              <div>Categoría</div>
              <div>Cuenta</div>
              <div className="r">Monto · {primaryCurrency}</div>
              <div />
            </div>

            {grouped.map(([date, rows]) => {
              const dayNet = rows.reduce((a, t) => a + (t.movement_type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
              return (
                <div key={date}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px 8px", background: "var(--bg)" }}>
                    <span className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>{dayLabel(date)}</span>
                    <span style={{ flex: 1, height: 1, background: "var(--line-2)" }} />
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
                      {rows.length} mov · <span style={{ color: dayNet >= 0 ? "var(--acc)" : "var(--rust)" }}>{dayNet >= 0 ? "+" : "−"}{fmt(Math.abs(dayNet), primaryCurrency)}</span>
                    </span>
                  </div>
                  {rows.map((tx) => {
                    const isSel = selected.has(tx.id);
                    const isFlag = tx.is_flagged || tx.is_duplicate;
                    const uncategorized = !tx.category;
                    const flagText = tx.is_duplicate ? "posible duplicado" : (tx.is_flagged ? (tx.flag_reason || "revisar") : "");
                    return (
                      <div
                        key={tx.id}
                        className="tbl-row"
                        onClick={() => edit(tx)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "30px 88px 1fr 200px 170px 130px 30px",
                          gap: 14,
                          background: isSel ? "rgba(94,233,181,0.05)" : isFlag ? "rgba(230,184,92,0.04)" : undefined,
                        }}
                      >
                        <div onClick={(e) => { e.stopPropagation(); toggleSel(tx.id); }} style={{ display: "grid", placeItems: "center" }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isSel ? "var(--acc)" : "var(--text-3)"}`, background: isSel ? "var(--acc)" : "transparent", color: "var(--bg)", display: "grid", placeItems: "center", fontSize: 10 }}>{isSel ? "✓" : ""}</span>
                        </div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                          <strong style={{ display: "block", color: "var(--text-2)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{new Date(`${tx.date}T00:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}</strong>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 8 }}>
                            {tx.description}
                            {flagText ? <span className="mono" style={{ fontSize: 10, color: "var(--gold)", letterSpacing: "0.06em", background: "rgba(230,184,92,0.1)", padding: "1px 6px", borderRadius: 99 }}>{flagText}</span> : null}
                            {tx.is_internal_transfer ? <span className="mono" style={{ fontSize: 10, color: "var(--blue)", background: "rgba(122,176,255,0.1)", padding: "1px 6px", borderRadius: 99 }}>interna</span> : null}
                            {tx.splits.length ? <span className="mono" style={{ fontSize: 10, color: "var(--violet)", background: "rgba(180,156,255,0.1)", padding: "1px 6px", borderRadius: 99 }}>split</span> : null}
                          </div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                            {tx.tags.length ? tx.tags.map((t) => t.name).join(" · ").toUpperCase() : (tx.notes ? tx.notes.toUpperCase() : "—")}
                          </div>
                        </div>
                        <div>
                          <span className={`chip${uncategorized ? " empty" : ""}`}><span className="sw" style={uncategorized ? undefined : { background: chipColor(tx.category!.name) }} />{tx.category?.name ?? "Sin categoría"}</span>
                        </div>
                        <div className="mono" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--text-2)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: tx.account?.account_type === "credit" ? "var(--rust)" : "var(--acc)" }} />
                          {tx.account?.name ?? "—"}
                        </div>
                        <div className="mono r" style={{ fontSize: 14, fontWeight: 500, color: tx.movement_type === "income" ? "var(--acc)" : "var(--text)" }}>
                          {tx.movement_type === "income" ? "+" : "−"}{fmt(tx.amount, tx.currency).replace(/[^\d.,-]/g, "")}
                        </div>
                        <div className="r" onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <ConfirmButton title="Eliminar transacción" description="Esta transacción será eliminada definitivamente." confirmLabel="Eliminar" onConfirm={() => remove(tx.id)} className="btn danger"><Trash2 size={13} /></ConfirmButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {transactions.length === 0 ? (
              <div className="empty"><div className="empty-mark">∅</div><h4>Sin movimientos</h4><p>No hay movimientos para estos filtros.</p></div>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{summary?.total_count ?? 0} en total · {summary?.uncategorized_count ?? 0} sin categoría</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn ghost">Anterior</button>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>Página {page + 1}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={transactions.length < PAGE_SIZE} className="btn ghost">Siguiente</button>
            </div>
          </div>
        </>
      )}

      {/* Formulario crear/editar (drawer-style panel) */}
      <div className="panel" style={{ marginTop: 24, maxWidth: 760 }}>
        <div className="panel-head"><h3>{editing ? "Editar movimiento" : "Nuevo movimiento"}</h3>{editing ? <button type="button" onClick={reset} className="btn ghost">Cancelar</button> : null}</div>
        <form onSubmit={save}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label>Cuenta</label>
              <select className="input" value={form.account_id} onChange={(e) => setForm((v) => ({ ...v, account_id: e.target.value }))} required>
                <option value="">Cuenta</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Categoría</label>
              <select className="input" value={form.category_id ?? ""} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value || null }))}>
                <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select className="input" value={form.movement_type} onChange={(e) => setForm((v) => ({ ...v, movement_type: e.target.value as TransactionPayload["movement_type"] }))}>
                <option value="expense">Gasto</option><option value="income">Ingreso</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Descripción</label>
              <input className="input" placeholder="Descripción" value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Monto</label>
              <input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Moneda</label>
              <select className="input" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}><option value="CLP">CLP</option><option value="USD">USD</option></select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Notas (opcional)</label>
              <textarea className="input" rows={2} value={form.notes ?? ""} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />
            </div>
          </div>

          {editing ? (
            <div className="panel" style={{ background: "var(--bg-3)", padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 10 }}>Detalles</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }} onClick={() => setExtra((x) => ({ ...x, is_internal_transfer: !x.is_internal_transfer }))}><span className={`toggle${extra.is_internal_transfer ? " on" : ""}`} /> Transferencia interna</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }} onClick={() => setExtra((x) => ({ ...x, is_duplicate: !x.is_duplicate }))}><span className={`toggle${extra.is_duplicate ? " on" : ""}`} /> Marcar como duplicado</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }} onClick={() => setExtra((x) => ({ ...x, is_flagged: !x.is_flagged }))}><span className={`toggle${extra.is_flagged ? " on" : ""}`} /> Marcar para revisar</label>
                {extra.is_flagged ? <input className="input" placeholder="Motivo" value={extra.flag_reason} onChange={(e) => setExtra((x) => ({ ...x, flag_reason: e.target.value }))} /> : null}
              </div>

              {tags.length ? (
                <div style={{ marginTop: 14 }}>
                  <h4 style={{ marginBottom: 8 }}>Etiquetas</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {tags.map((t) => {
                      const on = tagIds.includes(t.id);
                      return <button type="button" key={t.id} onClick={() => setTagIds((ids) => on ? ids.filter((x) => x !== t.id) : [...ids, t.id])} className={on ? "chip v" : "chip"} style={on ? { background: "rgba(180,156,255,0.1)", color: "var(--violet)", borderColor: "rgba(180,156,255,0.3)", cursor: "pointer" } : { cursor: "pointer" }}><span className="sw" />{t.name}</button>;
                    })}
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <h4>Repartir (split)</h4>
                  <button type="button" onClick={() => setSplits((s) => [...s, { category_id: "", amount: "0", notes: "" }])} className="btn ghost">+ añadir</button>
                </div>
                {splits.map((sp, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <select className="input" value={sp.category_id ?? ""} onChange={(e) => setSplits((s) => s.map((x, j) => j === i ? { ...x, category_id: e.target.value || null } : x))}>
                      <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="number" step="0.01" className="input" style={{ width: 120 }} value={sp.amount} onChange={(e) => setSplits((s) => s.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                    <button type="button" onClick={() => setSplits((s) => s.filter((_, j) => j !== i))} className="btn danger"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn primary lg"><Save size={16} /> Guardar</button>
            {editing ? <button type="button" onClick={reset} className="btn ghost lg">Cancelar</button> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
