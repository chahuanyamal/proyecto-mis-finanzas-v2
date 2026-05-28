"use client";

import { categoriesApi, recurringApi } from "@/lib/api";
import type { Category, Recurring, RecurringPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const FREQ_LABELS: Record<string, string> = { weekly: "Semanal", monthly: "Mensual", yearly: "Anual" };
const emptyForm: RecurringPayload = {
  name: "", amount: "10000", currency: "CLP", frequency: "monthly",
  movement_type: "expense", category_id: "", next_date: "", active: true,
};

export default function RecurringPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [items, setItems] = useState<Recurring[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<RecurringPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/recurring"); }, [hasVerified, router, user]);

  async function load() {
    try {
      const [r, c] = await Promise.all([recurringApi.list(), categoriesApi.list()]);
      setItems(r.data); setCategories(c.data);
    } catch { setError("No se pudieron cargar los recurrentes."); }
  }
  useEffect(() => { if (user) void load(); }, [user]);

  function reset() { setForm(emptyForm); setEditingId(null); }
  function edit(item: Recurring) {
    setEditingId(item.id);
    setForm({
      name: item.name, amount: item.amount, currency: item.currency, frequency: item.frequency,
      movement_type: item.movement_type, category_id: item.category_id ?? "", next_date: item.next_date ?? "", active: item.active,
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: RecurringPayload = { ...form, category_id: form.category_id || null, next_date: form.next_date || null };
    try {
      if (editingId) await recurringApi.update(editingId, payload);
      else await recurringApi.create(payload);
      reset(); await load();
    } catch { setError("No se pudo guardar el recurrente."); }
  }
  async function toggleActive(item: Recurring) {
    try { await recurringApi.update(item.id, { active: !item.active }); await load(); } catch { setError("No se pudo actualizar."); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar este recurrente?")) return;
    try { await recurringApi.remove(id); await load(); } catch { setError("No se pudo eliminar."); }
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Recurrentes</p>
          <h1 className="mt-2 text-3xl font-bold">Gastos e ingresos fijos</h1>
          {error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <div className="mt-6 space-y-3">
            {items.map((item) => (
              <div key={item.id} className={`flex items-center justify-between rounded border border-slate-800 bg-black/30 p-4 ${item.active ? "" : "opacity-50"}`}>
                <div>
                  <p className="font-semibold">
                    {item.name}{" "}
                    <span className={item.movement_type === "income" ? "text-emerald-400" : "text-red-400"}>
                      {item.movement_type === "income" ? "+" : "−"}{item.amount} {item.currency}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {FREQ_LABELS[item.frequency]}{item.next_date ? ` · próx. ${item.next_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => void toggleActive(item)} className="text-xs text-slate-400">{item.active ? "Pausar" : "Activar"}</button>
                  <button onClick={() => edit(item)} className="text-brand-300">Editar</button>
                  <button onClick={() => void remove(item.id)} className="text-red-300"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            {items.length === 0 ? <p className="text-sm text-slate-500">Sin recurrentes todavía. Crea el primero →</p> : null}
          </div>
        </section>
        <aside className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <h2 className="text-lg font-semibold">{editingId ? "Editar" : "Nuevo"} recurrente</h2>
          <form onSubmit={save} className="mt-5 space-y-4">
            <input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Nombre (ej. Netflix)" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
            <input type="number" step="0.01" className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Monto" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required />
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.movement_type} onChange={(e) => setForm((v) => ({ ...v, movement_type: e.target.value as RecurringPayload["movement_type"] }))}>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.frequency} onChange={(e) => setForm((v) => ({ ...v, frequency: e.target.value as RecurringPayload["frequency"] }))}>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.category_id ?? ""} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value }))}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}>
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
            <label className="block text-xs text-slate-500">Próxima fecha</label>
            <input type="date" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.next_date ?? ""} onChange={(e) => setForm((v) => ({ ...v, next_date: e.target.value }))} />
            <button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>
            {editingId ? <button type="button" onClick={reset} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}
          </form>
        </aside>
      </div>
    </main>
  );
}
