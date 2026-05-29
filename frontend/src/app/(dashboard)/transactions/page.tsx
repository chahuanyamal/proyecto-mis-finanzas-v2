"use client";

import { accountsApi, categoriesApi, tagsApi, transactionsApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { Account, Category, SplitPayload, Tag, Transaction, TransactionFilters, TransactionPayload, TransactionSummary } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Download, Flag, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
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

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Libro mayor</p>
              <h1 className="mt-2 text-3xl font-bold">Movimientos</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="rounded border border-slate-700 bg-black px-2 py-2 text-sm" onChange={(e) => { const p = PRESETS.find((x) => x.key === e.target.value); if (p) { const r = p.range(); setFilters((f) => ({ ...f, start_date: r.start, end_date: r.end })); } }} defaultValue="">
                <option value="" disabled>Período…</option>
                {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <button onClick={() => void autoCategorize()} disabled={busy} className="flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Auto</button>
              <button onClick={() => exportFile("csv")} className="flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-sm hover:bg-white/5"><Download size={16} /> CSV</button>
              <button onClick={() => exportFile("excel")} className="flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-sm hover:bg-white/5"><Download size={16} /> Excel</button>
            </div>
          </div>

          {error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          {info ? <p className="mt-4 rounded bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">{info}</p> : null}

          {/* KPI cards */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Ingresos</p><p className="mt-1 text-lg font-bold text-emerald-300">{fmt(income, primaryCurrency)}</p></div>
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Egresos</p><p className="mt-1 text-lg font-bold text-red-300">{fmt(expense, primaryCurrency)}</p></div>
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Saldo neto</p><p className={`mt-1 text-lg font-bold ${net >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmt(net, primaryCurrency)}</p></div>
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Promedio diario</p><p className="mt-1 text-lg font-bold">{fmt(expense / dayCount, primaryCurrency)}</p></div>
          </div>

          {/* Filtros */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" placeholder="Buscar…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            <select className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.account_id} onChange={(e) => setFilters((f) => ({ ...f, account_id: e.target.value }))}>
              <option value="">Todas las cuentas</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.category_id} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">Todas las categorías</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.start_date} onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))} />
            <input type="date" className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.end_date} onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))} />
            <div className="flex gap-1">
              {(["all", "income", "expense"] as Flow[]).map((fl) => (
                <button key={fl} onClick={() => setFilters((f) => ({ ...f, flow: fl }))} className={`flex-1 rounded border px-2 py-2 text-xs ${filters.flow === fl ? "border-brand-500 bg-brand-500/10 text-brand-300" : "border-slate-700 hover:bg-white/5"}`}>
                  {fl === "all" ? "Todos" : fl === "income" ? "Ingresos" : "Gastos"}
                </button>
              ))}
            </div>
          </div>

          {/* Barra de selección masiva */}
          {selected.size > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-brand-500/40 bg-brand-500/5 px-4 py-3 text-sm">
              <span className="font-semibold">{selected.size} seleccionado(s)</span>
              <span className="text-slate-400">Neto: {fmt(selectedTotal, primaryCurrency)}</span>
              <select className="rounded border border-slate-700 bg-black px-2 py-1" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
                <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => void bulkApplyCategory()} className="rounded bg-brand-500 px-3 py-1 font-semibold text-black">Categorizar</button>
              <ConfirmButton title="Eliminar movimientos" description={`Se eliminarán ${selected.size} movimiento(s) seleccionados.`} confirmLabel="Eliminar" onConfirm={bulkRemove} className="rounded border border-red-700 px-3 py-1 text-red-300">Eliminar</ConfirmButton>
              <button onClick={() => setSelected(new Set())} className="text-slate-400">Limpiar</button>
            </div>
          ) : null}

          {isLoading ? (
            <p className="mt-8 flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p>
          ) : (
            <>
              <div className="mt-6 space-y-4">
                {grouped.map(([date, rows]) => {
                  const dayNet = rows.reduce((a, t) => a + (t.movement_type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-xs uppercase tracking-wider text-slate-500">
                        <span>{dayLabel(date)}</span>
                        <span>{rows.length} mov · {fmt(dayNet, primaryCurrency)}</span>
                      </div>
                      <div className="divide-y divide-slate-800/60">
                        {rows.map((tx) => (
                          <div key={tx.id} className={`flex items-center gap-3 py-2 ${editing?.id === tx.id ? "bg-white/5" : "hover:bg-white/5"}`}>
                            <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSel(tx.id)} className="accent-brand-500" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {tx.description}
                                {tx.is_internal_transfer ? <span className="ml-2 rounded bg-sky-900/60 px-1 text-[10px] text-sky-300">INT</span> : null}
                                {tx.is_duplicate ? <span className="ml-1 rounded bg-amber-900/60 px-1 text-[10px] text-amber-300">DUP</span> : null}
                                {tx.is_flagged ? <Flag size={12} className="ml-1 inline text-amber-400" /> : null}
                                {tx.splits.length ? <span className="ml-1 rounded bg-violet-900/60 px-1 text-[10px] text-violet-300">SPLIT</span> : null}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {tx.account?.name ?? "-"} · {tx.category?.name ?? "Sin categoría"}
                                {tx.tags.map((t) => <span key={t.id} className="ml-1 rounded bg-slate-800 px-1 text-[10px] text-slate-300">{t.name}</span>)}
                              </p>
                            </div>
                            <span className={`whitespace-nowrap text-sm font-mono ${tx.movement_type === "income" ? "text-emerald-300" : "text-red-300"}`}>
                              {tx.movement_type === "income" ? "+" : "−"}{fmt(tx.amount, tx.currency)}
                            </span>
                            <button onClick={() => edit(tx)} className="text-xs text-brand-300">Editar</button>
                            <ConfirmButton title="Eliminar transacción" description="Esta transacción será eliminada definitivamente." confirmLabel="Eliminar" onConfirm={() => remove(tx.id)} className="text-red-300"><Trash2 size={14} /></ConfirmButton>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {transactions.length === 0 ? <p className="py-8 text-center text-slate-500">Sin movimientos para estos filtros.</p> : null}
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                <span>{summary?.total_count ?? 0} en total · {summary?.uncategorized_count ?? 0} sin categoría</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Anterior</button>
                  <span>Página {page + 1}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={transactions.length < PAGE_SIZE} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Siguiente</button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Formulario crear/editar */}
        <aside className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <h2 className="text-lg font-semibold">{editing ? "Editar" : "Nueva"} transacción</h2>
          <form onSubmit={save} className="mt-5 space-y-4">
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.account_id} onChange={(e) => setForm((v) => ({ ...v, account_id: e.target.value }))} required>
              <option value="">Cuenta</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.category_id ?? ""} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value || null }))}>
              <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.date} onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))} required />
            <input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Descripción" value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} required />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" step="0.01" className="rounded border border-slate-700 bg-black px-3 py-2" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required />
              <select className="rounded border border-slate-700 bg-black px-3 py-2" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}><option value="CLP">CLP</option><option value="USD">USD</option></select>
            </div>
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.movement_type} onChange={(e) => setForm((v) => ({ ...v, movement_type: e.target.value as TransactionPayload["movement_type"] }))}>
              <option value="expense">Gasto</option><option value="income">Ingreso</option>
            </select>
            <textarea className="w-full rounded border border-slate-700 bg-black px-3 py-2 text-sm" placeholder="Notas (opcional)" rows={2} value={form.notes ?? ""} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} />

            {editing ? (
              <div className="space-y-3 rounded border border-slate-800 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Detalles</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={extra.is_internal_transfer} onChange={(e) => setExtra((x) => ({ ...x, is_internal_transfer: e.target.checked }))} /> Transferencia interna</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={extra.is_duplicate} onChange={(e) => setExtra((x) => ({ ...x, is_duplicate: e.target.checked }))} /> Marcar como duplicado</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={extra.is_flagged} onChange={(e) => setExtra((x) => ({ ...x, is_flagged: e.target.checked }))} /> Marcar para revisar</label>
                {extra.is_flagged ? <input className="w-full rounded border border-slate-700 bg-black px-3 py-1.5 text-sm" placeholder="Motivo" value={extra.flag_reason} onChange={(e) => setExtra((x) => ({ ...x, flag_reason: e.target.value }))} /> : null}

                {tags.length ? (
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Etiquetas</p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map((t) => {
                        const on = tagIds.includes(t.id);
                        return <button type="button" key={t.id} onClick={() => setTagIds((ids) => on ? ids.filter((x) => x !== t.id) : [...ids, t.id])} className={`rounded px-2 py-0.5 text-xs ${on ? "bg-brand-500 text-black" : "border border-slate-700 text-slate-300"}`}>{t.name}</button>;
                      })}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Repartir (split)</span>
                    <button type="button" onClick={() => setSplits((s) => [...s, { category_id: "", amount: "0", notes: "" }])} className="text-brand-300">+ añadir</button>
                  </div>
                  {splits.map((sp, i) => (
                    <div key={i} className="mb-1 flex gap-1">
                      <select className="flex-1 rounded border border-slate-700 bg-black px-2 py-1 text-xs" value={sp.category_id ?? ""} onChange={(e) => setSplits((s) => s.map((x, j) => j === i ? { ...x, category_id: e.target.value || null } : x))}>
                        <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="number" step="0.01" className="w-24 rounded border border-slate-700 bg-black px-2 py-1 text-xs" value={sp.amount} onChange={(e) => setSplits((s) => s.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                      <button type="button" onClick={() => setSplits((s) => s.filter((_, j) => j !== i))} className="text-red-300"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>
            {editing ? <button type="button" onClick={reset} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}
          </form>
        </aside>
      </div>
    </main>
  );
}
