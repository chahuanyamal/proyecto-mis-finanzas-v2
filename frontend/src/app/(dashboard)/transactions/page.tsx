"use client";

import { accountsApi, categoriesApi, transactionsApi } from "@/lib/api";
import type { Account, Category, Transaction, TransactionPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

function today(): string { return new Date().toISOString().slice(0, 10); }
const emptyForm: TransactionPayload = { account_id: "", category_id: null, date: today(), description: "", amount: "0", currency: "CLP", movement_type: "expense" };

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

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/transactions"); }, [hasVerified, router, user]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [txResponse, accountsResponse, categoriesResponse] = await Promise.all([transactionsApi.list(), accountsApi.list(), categoriesApi.list()]);
      setTransactions(txResponse.data); setAccounts(accountsResponse.data); setCategories(categoriesResponse.data);
      if (!form.account_id && accountsResponse.data[0]) setForm((v) => ({ ...v, account_id: accountsResponse.data[0].id }));
    } catch { setError("No se pudieron cargar las transacciones."); }
    finally { setIsLoading(false); }
  }
  useEffect(() => { if (user) void loadData(); }, [user]);
  function reset() { setForm({ ...emptyForm, account_id: accounts[0]?.id ?? "" }); setEditingId(null); }
  function edit(transaction: Transaction) { setEditingId(transaction.id); setForm({ account_id: transaction.account_id, category_id: transaction.category_id, date: transaction.date, description: transaction.description, amount: transaction.amount, currency: transaction.currency, movement_type: transaction.movement_type }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.account_id) { setError("Crea o selecciona una cuenta primero."); return; }
    const payload = { ...form, category_id: form.category_id || null };
    try { if (editingId) await transactionsApi.update(editingId, payload); else await transactionsApi.create(payload); reset(); await loadData(); }
    catch { setError("No se pudo guardar la transacción."); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar esta transacción?")) return;
    try { await transactionsApi.remove(id); await loadData(); } catch { setError("No se pudo eliminar la transacción."); }
  }

  return <main className="min-h-screen bg-surface-950 p-8 text-slate-100"><div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_380px]"><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Transacciones</p><h1 className="mt-2 text-3xl font-bold">Movimientos</h1>{error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}{isLoading ? <p className="mt-8 flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p> : <div className="mt-6 overflow-hidden rounded border border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-black/50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3">Cuenta</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3 text-right">Monto</th><th /></tr></thead><tbody className="divide-y divide-slate-800">{transactions.map((tx) => <tr key={tx.id} className="hover:bg-white/5"><td className="px-4 py-3">{tx.date}</td><td className="px-4 py-3 font-medium">{tx.description}</td><td className="px-4 py-3 text-slate-300">{tx.account?.name ?? "-"}</td><td className="px-4 py-3 text-slate-300">{tx.category?.name ?? "-"}</td><td className={`px-4 py-3 text-right ${tx.movement_type === "income" ? "text-green-300" : "text-red-300"}`}>{tx.currency} {tx.amount}</td><td className="px-4 py-3 text-right"><button onClick={() => edit(tx)} className="mr-3 text-brand-300">Editar</button><button onClick={() => void remove(tx.id)} className="text-red-300"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>}</section><aside className="rounded-lg border border-slate-800 bg-surface-900 p-6"><h2 className="text-lg font-semibold">{editingId ? "Editar" : "Nueva"} transacción</h2><form onSubmit={save} className="mt-5 space-y-4"><select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.account_id} onChange={(e) => setForm((v) => ({ ...v, account_id: e.target.value }))} required><option value="">Cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.category_id ?? ""} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value || null }))}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input type="date" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.date} onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))} required /><input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Descripción" value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} required /><div className="grid grid-cols-2 gap-3"><input type="number" step="0.01" className="rounded border border-slate-700 bg-black px-3 py-2" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required /><select className="rounded border border-slate-700 bg-black px-3 py-2" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}><option value="CLP">CLP</option><option value="USD">USD</option></select></div><select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.movement_type} onChange={(e) => setForm((v) => ({ ...v, movement_type: e.target.value as TransactionPayload["movement_type"] }))}><option value="expense">Gasto</option><option value="income">Ingreso</option></select><button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>{editingId ? <button type="button" onClick={reset} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}</form></aside></div></main>;
}
