"use client";

import { goalsApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Goal, GoalContribution, GoalDepositPayload, GoalPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const emptyForm: GoalPayload = { name: "", target_amount: "1000000", current_amount: "0", currency: "CLP", target_date: "" };
const emptyDeposit: GoalDepositPayload = { amount: "10000", date: new Date().toISOString().slice(0, 10), note: "" };

export default function GoalsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [contributions, setContributions] = useState<Record<string, GoalContribution[]>>({});
  const [form, setForm] = useState<GoalPayload>(emptyForm);
  const [depositForms, setDepositForms] = useState<Record<string, GoalDepositPayload>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/goals"); }, [hasVerified, router, user]);

  async function load() {
    try {
      const goalList = (await goalsApi.list()).data;
      setGoals(goalList);
      const pairs = await Promise.all(goalList.map(async (goal) => [goal.id, (await goalsApi.contributions(goal.id)).data] as const));
      setContributions(Object.fromEntries(pairs));
      setDepositForms((current) => {
        const next = { ...current };
        for (const goal of goalList) if (!next[goal.id]) next[goal.id] = emptyDeposit;
        return next;
      });
    } catch { setError("No se pudieron cargar las metas."); }
  }
  useEffect(() => { if (user) void load(); }, [user]);

  function reset() { setForm(emptyForm); setEditingId(null); }
  function edit(goal: Goal) {
    setEditingId(goal.id);
    setForm({ name: goal.name, target_amount: goal.target_amount, current_amount: goal.current_amount, currency: goal.currency, target_date: goal.target_date ?? "" });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: GoalPayload = { ...form, target_date: form.target_date || null };
    try {
      if (editingId) await goalsApi.update(editingId, payload);
      else await goalsApi.create(payload);
      reset(); await load();
    } catch { setError("No se pudo guardar la meta."); }
  }
  async function remove(id: string) {
    try { await goalsApi.remove(id); await load(); } catch { setError("No se pudo eliminar la meta."); }
  }
  function setDeposit(goalId: string, changes: Partial<GoalDepositPayload>) {
    setDepositForms((current) => ({ ...current, [goalId]: { ...emptyDeposit, ...current[goalId], ...changes } }));
  }
  async function deposit(goalId: string) {
    const payload = depositForms[goalId] ?? emptyDeposit;
    try {
      await goalsApi.deposit(goalId, { ...payload, date: payload.date || null, note: payload.note || null });
      setDepositForms((current) => ({ ...current, [goalId]: emptyDeposit }));
      await load();
    } catch { setError("No se pudo registrar el aporte."); }
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Metas</p>
          <h1 className="mt-2 text-3xl font-bold">Metas de ahorro</h1>
          {error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <div className="mt-6 space-y-3">
            {goals.map((goal) => {
              const recent = contributions[goal.id] ?? [];
              const depositForm = depositForms[goal.id] ?? emptyDeposit;
              return (
              <div key={goal.id} className="rounded border border-slate-800 bg-black/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{goal.name}</p>
                  <div className="flex items-center gap-4">
                    <button onClick={() => edit(goal)} className="text-brand-300">Editar</button>
                    <ConfirmButton title="Eliminar meta" description="Esta acción eliminará la meta y su historial de aportes." confirmLabel="Eliminar" onConfirm={() => remove(goal.id)} className="text-red-300"><Trash2 size={16} /></ConfirmButton>
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {goal.current_amount} / {goal.target_amount} {goal.currency}
                  {goal.target_date ? ` · meta ${goal.target_date}` : ""}
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
                  <div className="h-full bg-brand-500" style={{ width: `${Math.min(goal.percent, 100)}%` }} />
                </div>
                <p className="mt-1 text-right text-xs text-slate-500">{goal.percent}%</p>
                <div className="mt-4 grid gap-2 md:grid-cols-[120px_150px_1fr_auto]">
                  <input type="number" step="0.01" className="rounded border border-slate-700 bg-black px-2 py-1 text-sm" value={depositForm.amount} onChange={(e) => setDeposit(goal.id, { amount: e.target.value })} placeholder="Aporte" />
                  <input type="date" className="rounded border border-slate-700 bg-black px-2 py-1 text-sm" value={depositForm.date ?? ""} onChange={(e) => setDeposit(goal.id, { date: e.target.value })} />
                  <input className="rounded border border-slate-700 bg-black px-2 py-1 text-sm" value={depositForm.note ?? ""} onChange={(e) => setDeposit(goal.id, { note: e.target.value })} placeholder="Nota" />
                  <button onClick={() => void deposit(goal.id)} className="flex items-center justify-center gap-1 rounded bg-brand-500 px-3 py-1 text-sm font-semibold text-black"><Plus size={14} /> Aportar</button>
                </div>
                {recent.length > 0 ? (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <p className="text-xs uppercase tracking-wider text-slate-500">Últimos aportes</p>
                    <div className="mt-2 space-y-1">
                      {recent.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex justify-between gap-3 text-xs text-slate-400">
                          <span>{item.date}{item.note ? ` · ${item.note}` : ""}</span>
                          <span className="font-mono text-emerald-300">+{item.amount} {goal.currency}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );})}
            {goals.length === 0 ? <EmptyState title="Sin metas" description="Crea tu primera meta de ahorro para seguir aportes y avance." /> : null}
          </div>
        </section>
        <aside className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <h2 className="text-lg font-semibold">{editingId ? "Editar" : "Nueva"} meta</h2>
          <form onSubmit={save} className="mt-5 space-y-4">
            <input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Nombre" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
            <input type="number" step="0.01" className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Monto objetivo" value={form.target_amount} onChange={(e) => setForm((v) => ({ ...v, target_amount: e.target.value }))} required />
            <input type="number" step="0.01" className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Ahorrado" value={form.current_amount} onChange={(e) => setForm((v) => ({ ...v, current_amount: e.target.value }))} />
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}>
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
            <input type="date" className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.target_date ?? ""} onChange={(e) => setForm((v) => ({ ...v, target_date: e.target.value }))} />
            <button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>
            {editingId ? <button type="button" onClick={reset} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}
          </form>
        </aside>
      </div>
    </main>
  );
}
