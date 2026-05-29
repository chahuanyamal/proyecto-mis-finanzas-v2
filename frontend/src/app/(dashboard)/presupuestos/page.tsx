"use client";

import { budgetsApi, categoriesApi } from "@/lib/api";
import type { Budget, BudgetPayload, Category } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

function currentMonth(): string { return new Date().toISOString().slice(0, 7); }
const emptyForm: BudgetPayload = { category_id: "", month: currentMonth(), amount: "100000", alert_at_percent: 80 };

export default function BudgetsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<BudgetPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/presupuestos"); }, [hasVerified, router, user]);

  async function loadData(month = form.month) {
    try {
      const [budgetResponse, categoryResponse] = await Promise.all([budgetsApi.list(month), categoriesApi.list()]);
      setBudgets(budgetResponse.data);
      setCategories(categoryResponse.data);
    } catch { setError("No se pudieron cargar los presupuestos."); }
  }
  useEffect(() => { if (user) void loadData(); }, [user]);
  function reset() { setForm({ ...emptyForm, month: form.month }); setEditingId(null); }
  function edit(budget: Budget) { setEditingId(budget.id); setForm({ category_id: budget.category_id, month: budget.month, amount: budget.amount, alert_at_percent: budget.alert_at_percent }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingId) await budgetsApi.update(editingId, { amount: form.amount, alert_at_percent: form.alert_at_percent });
      else await budgetsApi.create(form);
      reset(); await loadData(form.month);
    } catch { setError("No se pudo guardar el presupuesto. Puede existir uno para esa categoría y mes."); }
  }
  async function remove(id: string) {
    try { await budgetsApi.remove(id); await loadData(); } catch { setError("No se pudo eliminar el presupuesto."); }
  }

  return <main className="min-h-screen bg-surface-950 p-8 text-slate-100"><div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]"><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Presupuestos</p><h1 className="mt-2 text-3xl font-bold">Control mensual</h1>{error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}<div className="mt-6 space-y-3">{budgets.map((budget) => <div key={budget.id} className="flex items-center justify-between rounded border border-slate-800 bg-black/30 p-4"><div><p className="font-semibold">{budget.category?.name ?? budget.category_id}</p><p className="text-sm text-slate-400">{budget.month} · alerta {budget.alert_at_percent}%</p></div><div className="flex items-center gap-4"><span>{budget.amount}</span><button onClick={() => edit(budget)} className="text-brand-300">Editar</button><button onClick={() => void remove(budget.id)} className="text-red-300"><Trash2 size={16} /></button></div></div>)}</div></section><aside className="rounded-lg border border-slate-800 bg-surface-900 p-6"><h2 className="text-lg font-semibold">{editingId ? "Editar" : "Nuevo"} presupuesto</h2><form onSubmit={save} className="mt-5 space-y-4"><input type="month" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.month} onChange={(e) => { setForm((v) => ({ ...v, month: e.target.value })); void loadData(e.target.value); }} required disabled={Boolean(editingId)} /><select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.category_id} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value }))} required disabled={Boolean(editingId)}><option value="">Categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input type="number" step="0.01" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required /><input type="number" min="1" max="100" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.alert_at_percent} onChange={(e) => setForm((v) => ({ ...v, alert_at_percent: Number(e.target.value) }))} required /><button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>{editingId ? <button type="button" onClick={reset} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}</form></aside></div></main>;
}
