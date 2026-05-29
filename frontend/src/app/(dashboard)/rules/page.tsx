"use client";

import { categoriesApi, rulesApi } from "@/lib/api";
import type { Category, CategoryRule, CategoryRulePayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const emptyForm: CategoryRulePayload = { target_category_id: "", field: "description", operator: "contains", pattern: "", priority: 0 };

export default function RulesPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryRulePayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/rules"); }, [hasVerified, router, user]);

  async function loadData() {
    try {
      const [rulesResponse, categoriesResponse] = await Promise.all([rulesApi.list(), categoriesApi.list()]);
      setRules(rulesResponse.data);
      setCategories(categoriesResponse.data);
    } catch { setError("No se pudieron cargar las reglas."); }
  }

  useEffect(() => { if (user) void loadData(); }, [user]);
  function reset() { setForm(emptyForm); setEditingId(null); }
  function edit(rule: CategoryRule) { setEditingId(rule.id); setForm({ target_category_id: rule.target_category_id, field: rule.field, operator: rule.operator, pattern: rule.pattern, priority: rule.priority }); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.target_category_id) { setError("Selecciona una categoría."); return; }
    try { if (editingId) await rulesApi.update(editingId, form); else await rulesApi.create(form); reset(); await loadData(); }
    catch { setError("No se pudo guardar la regla."); }
  }
  async function remove(id: string) {
    try { await rulesApi.remove(id); await loadData(); } catch { setError("No se pudo eliminar la regla."); }
  }

  return <main className="min-h-screen bg-surface-950 p-8 text-slate-100"><div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]"><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Reglas</p><h1 className="mt-2 text-3xl font-bold">Categorización</h1>{error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}<div className="mt-6 space-y-3">{rules.map((rule) => <div key={rule.id} className="rounded border border-slate-800 bg-black/30 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">{rule.field} {rule.operator} &quot;{rule.pattern}&quot;</p><p className="text-sm text-slate-400">→ {rule.target_category?.name ?? rule.target_category_id} · prioridad {rule.priority}</p></div><div className="flex gap-3"><button onClick={() => edit(rule)} className="text-brand-300">Editar</button><button onClick={() => void remove(rule.id)} className="text-red-300"><Trash2 size={16} /></button></div></div></div>)}</div></section><aside className="rounded-lg border border-slate-800 bg-surface-900 p-6"><h2 className="text-lg font-semibold">{editingId ? "Editar" : "Nueva"} regla</h2><form onSubmit={save} className="mt-5 space-y-4"><select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.target_category_id} onChange={(e) => setForm((v) => ({ ...v, target_category_id: e.target.value }))} required><option value="">Categoría destino</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.field} onChange={(e) => setForm((v) => ({ ...v, field: e.target.value }))} /><select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.operator} onChange={(e) => setForm((v) => ({ ...v, operator: e.target.value }))}><option value="contains">contains</option><option value="equals">equals</option><option value="starts_with">starts_with</option></select><input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Patrón" value={form.pattern} onChange={(e) => setForm((v) => ({ ...v, pattern: e.target.value }))} required /><input className="w-full rounded border border-slate-700 bg-black px-3 py-2" type="number" value={form.priority} onChange={(e) => setForm((v) => ({ ...v, priority: Number(e.target.value) }))} /><button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>{editingId ? <button type="button" onClick={reset} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}</form></aside></div></main>;
}
