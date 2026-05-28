"use client";

import { accountsApi, categoriesApi, transactionsApi } from "@/lib/api";
import type { Account, Category, Transaction, TransactionFilters, TransactionPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Download, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

function today(): string { return new Date().toISOString().slice(0, 10); }
const emptyForm: TransactionPayload = { account_id: "", category_id: null, date: today(), description: "", amount: "0", currency: "CLP", movement_type: "expense" };

const PAGE_SIZE = 50;
type FilterState = { account_id: string; category_id: string; start_date: string; end_date: string; search: string };
const emptyFilters: FilterState = { account_id: "", category_id: "", start_date: "", end_date: "", search: "" };

export default function TransactionsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<TransactionPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/transactions"); }, [hasVerified, router, user]);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    const params: TransactionFilters = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (filters.account_id) params.account_id = filters.account_id;
    if (filters.category_id) params.category_id = filters.category_id;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.search.trim()) params.search = filters.search.trim();
    try {
      setTransactions((await transactionsApi.list(params)).data);
    } catch { setError("No se pudieron cargar las transacciones."); }
    finally { setIsLoading(false); }
  }, [filters, page]);

  const loadRefs = useCallback(async () => {
    try {
      const [accountsResponse, categoriesResponse] = await Promise.all([accountsApi.list(), categoriesApi.list()]);
      setAccounts(accountsResponse.data); setCategories(categoriesResponse.data);
      if (!form.account_id && accountsResponse.data[0]) setForm((v) => ({ ...v, account_id: accountsResponse.data[0].id }));
    } catch { setError("No se pudieron cargar cuentas o categorías."); }
  }, [form.account_id]);

  useEffect(() => { if (user) void loadRefs(); }, [user, loadRefs]);
  useEffect(() => { if (user) void loadTransactions(); }, [user, loadTransactions]);
  // Al cambiar filtros, vuelve a la primera página.
  useEffect(() => { setPage(0); }, [filters]);

  function reset() { setForm({ ...emptyForm, account_id: accounts[0]?.id ?? "" }); setEditingId(null); }
  function edit(transaction: Transaction) { setEditingId(transaction.id); setForm({ account_id: transaction.account_id, category_id: transaction.category_id, date: transaction.date, description: transaction.description, amount: transaction.amount, currency: transaction.currency, movement_type: transaction.movement_type }); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.account_id) { setError("Crea o selecciona una cuenta primero."); return; }
    const payload = { ...form, category_id: form.category_id || null };
    try { if (editingId) await transactionsApi.update(editingId, payload); else await transactionsApi.create(payload); reset(); await loadTransactions(); }
    catch { setError("No se pudo guardar la transacción."); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar esta transacción?")) return;
    try { await transactionsApi.remove(id); await loadTransactions(); } catch { setError("No se pudo eliminar la transacción."); }
  }
  async function autoCategorize() {
    setBusy(true); setInfo(""); setError("");
    try {
      const { data } = await transactionsApi.autoCategorize();
      setInfo(`Auto-categorización aplicada: ${data.updated} movimiento(s) actualizados.`);
      await loadTransactions();
    } catch { setError("No se pudo auto-categorizar."); }
    finally { setBusy(false); }
  }
  function exportExcel() {
    const params = new URLSearchParams();
    if (filters.start_date) params.set("start_date", filters.start_date);
    if (filters.end_date) params.set("end_date", filters.end_date);
    const qs = params.toString();
    window.open(`${transactionsApi.exportExcelUrl()}${qs ? `?${qs}` : ""}`, "_blank");
  }

  const viewTotal = transactions.reduce((acc, tx) => acc + (tx.movement_type === "income" ? Number(tx.amount) : -Number(tx.amount)), 0);

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Transacciones</p>
              <h1 className="mt-2 text-3xl font-bold">Movimientos</h1>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void autoCategorize()} disabled={busy} className="flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Auto-categorizar
              </button>
              <button onClick={exportExcel} className="flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-sm hover:bg-white/5">
                <Download size={16} /> Excel
              </button>
            </div>
          </div>

          {error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          {info ? <p className="mt-4 rounded bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">{info}</p> : null}

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" placeholder="Buscar descripción…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            <select className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.account_id} onChange={(e) => setFilters((f) => ({ ...f, account_id: e.target.value }))}>
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.category_id} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.start_date} onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))} />
            <input type="date" className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" value={filters.end_date} onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))} />
            <button onClick={() => setFilters(emptyFilters)} className="rounded border border-slate-700 px-3 py-2 text-sm hover:bg-white/5">Limpiar filtros</button>
          </div>

          {isLoading ? (
            <p className="mt-8 flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p>
          ) : (
            <>
              <div className="mt-6 overflow-hidden rounded border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-black/50 text-xs uppercase tracking-wider text-slate-400">
                    <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3">Cuenta</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3 text-right">Monto</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/5">
                        <td className="px-4 py-3">{tx.date}</td>
                        <td className="px-4 py-3 font-medium">{tx.description}</td>
                        <td className="px-4 py-3 text-slate-300">{tx.account?.name ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-300">{tx.category?.name ?? "-"}</td>
                        <td className={`px-4 py-3 text-right ${tx.movement_type === "income" ? "text-green-300" : "text-red-300"}`}>{tx.currency} {tx.amount}</td>
                        <td className="px-4 py-3 text-right"><button onClick={() => edit(tx)} className="mr-3 text-brand-300">Editar</button><button onClick={() => void remove(tx.id)} className="text-red-300"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                    {transactions.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Sin resultados para estos filtros.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                <span>Neto en esta vista: <span className={viewTotal >= 0 ? "text-green-300" : "text-red-300"}>{viewTotal.toLocaleString("es-CL")}</span></span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Anterior</button>
                  <span>Página {page + 1}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={transactions.length < PAGE_SIZE} className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40">Siguiente</button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <h2 className="text-lg font-semibold">{editingId ? "Editar" : "Nueva"} transacción</h2>
          <form onSubmit={save} className="mt-5 space-y-4">
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.account_id} onChange={(e) => setForm((v) => ({ ...v, account_id: e.target.value }))} required>
              <option value="">Cuenta</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.category_id ?? ""} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value || null }))}>
              <option value="">Sin categoría</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <input type="date" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.date} onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))} required />
            <input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Descripción" value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} required />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" step="0.01" className="rounded border border-slate-700 bg-black px-3 py-2" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required />
              <select className="rounded border border-slate-700 bg-black px-3 py-2" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}>
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.movement_type} onChange={(e) => setForm((v) => ({ ...v, movement_type: e.target.value as TransactionPayload["movement_type"] }))}>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
            <button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>
            {editingId ? <button type="button" onClick={reset} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}
          </form>
        </aside>
      </div>
    </main>
  );
}
