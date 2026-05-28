"use client";

import { transactionsApi } from "@/lib/api";
import type { CategoryAggregate, MonthAggregate } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function fmt(value: number, currency = "CLP"): string {
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  return { start: `${ym}-01`, end: new Date(y, m, 0).toISOString().slice(0, 10) };
}
function ymOffset(offset: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function InsightsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [series, setSeries] = useState<MonthAggregate[]>([]);
  const [catThis, setCatThis] = useState<CategoryAggregate[]>([]);
  const [catPrev, setCatPrev] = useState<CategoryAggregate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/insights"); }, [hasVerified, router, user]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const rThis = monthRange(ymOffset(0)); const rPrev = monthRange(ymOffset(-1));
    try {
      const [sr, ct, cp] = await Promise.all([
        transactionsApi.byMonth({ months: 12 }),
        transactionsApi.byCategory({ start_date: rThis.start, end_date: rThis.end }),
        transactionsApi.byCategory({ start_date: rPrev.start, end_date: rPrev.end }),
      ]);
      setSeries(sr.data); setCatThis(ct.data); setCatPrev(cp.data);
    } catch { setError("No se pudieron cargar los insights."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const maxBar = useMemo(() => Math.max(1, ...series.flatMap((m) => [Number(m.income), Number(m.expense)])), [series]);
  const avgExpense = useMemo(() => series.length ? series.reduce((a, m) => a + Number(m.expense), 0) / series.length : 0, [series]);
  const thisMonth = series[series.length - 1];
  const tIncome = Number(thisMonth?.income ?? 0);
  const tExpense = Number(thisMonth?.expense ?? 0);
  const savingsRate = tIncome > 0 ? ((tIncome - tExpense) / tIncome) * 100 : 0;

  const topCategories = useMemo(() => {
    const max = Math.max(1, ...catThis.map((c) => Number(c.expense)));
    return catThis.filter((c) => Number(c.expense) > 0).slice(0, 8).map((c) => ({ name: c.category_name, value: Number(c.expense), pct: (Number(c.expense) / max) * 100 }));
  }, [catThis]);

  const variations = useMemo(() => {
    const prev = new Map(catPrev.map((c) => [c.category_id ?? "uncategorized", Number(c.expense)]));
    return catThis
      .map((c) => ({ name: c.category_name, now: Number(c.expense), before: prev.get(c.category_id ?? "uncategorized") ?? 0 }))
      .map((r) => ({ ...r, diff: r.now - r.before }))
      .filter((r) => Math.abs(r.diff) > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5);
  }, [catThis, catPrev]);

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Insights</p>
          <h1 className="mt-2 text-3xl font-bold">Tendencias y resúmenes</h1>
        </header>
        {error ? <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        {isLoading ? (
          <p className="flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-surface-900 p-4"><p className="text-[10px] uppercase tracking-widest text-slate-500">Gasto este mes</p><p className="mt-1 text-lg font-bold text-red-300">{fmt(tExpense)}</p></div>
              <div className="rounded-lg border border-slate-800 bg-surface-900 p-4"><p className="text-[10px] uppercase tracking-widest text-slate-500">Ingreso este mes</p><p className="mt-1 text-lg font-bold text-emerald-300">{fmt(tIncome)}</p></div>
              <div className="rounded-lg border border-slate-800 bg-surface-900 p-4"><p className="text-[10px] uppercase tracking-widest text-slate-500">Gasto medio (12m)</p><p className="mt-1 text-lg font-bold">{fmt(avgExpense)}</p></div>
              <div className="rounded-lg border border-slate-800 bg-surface-900 p-4"><p className="text-[10px] uppercase tracking-widest text-slate-500">Tasa de ahorro</p><p className={`mt-1 text-lg font-bold ${savingsRate >= 0 ? "text-emerald-300" : "text-red-300"}`}>{savingsRate.toFixed(0)}%</p></div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
              <h2 className="text-lg font-semibold">Ingresos vs gastos (12 meses)</h2>
              <div className="mt-5 flex items-end gap-2" style={{ height: 180 }}>
                {series.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 150 }}>
                      <div className="w-1/2 rounded-t bg-emerald-500/70" style={{ height: `${(Number(m.income) / maxBar) * 100}%` }} title={`Ingreso ${fmt(Number(m.income))}`} />
                      <div className="w-1/2 rounded-t bg-red-500/70" style={{ height: `${(Number(m.expense) / maxBar) * 100}%` }} title={`Gasto ${fmt(Number(m.expense))}`} />
                    </div>
                    <span className="text-[9px] text-slate-500">{m.month.slice(5)}</span>
                  </div>
                ))}
                {series.length === 0 ? <p className="text-sm text-slate-500">Sin datos todavía.</p> : null}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
                <h2 className="text-lg font-semibold">Top categorías (este mes)</h2>
                <div className="mt-4 space-y-2">
                  {topCategories.map((c) => (
                    <div key={c.name}>
                      <div className="flex justify-between text-sm"><span>{c.name}</span><span className="font-mono">{fmt(c.value)}</span></div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-800"><div className="h-full bg-brand-500" style={{ width: `${c.pct}%` }} /></div>
                    </div>
                  ))}
                  {topCategories.length === 0 ? <p className="text-sm text-slate-500">Sin gastos este mes.</p> : null}
                </div>
              </section>

              <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
                <h2 className="text-lg font-semibold">Mayores variaciones vs mes anterior</h2>
                <div className="mt-4 space-y-2">
                  {variations.map((v) => (
                    <div key={v.name} className="flex items-center justify-between rounded border border-slate-800 bg-black/30 px-3 py-2 text-sm">
                      <span>{v.name}</span>
                      <span className={`flex items-center gap-1 font-mono ${v.diff > 0 ? "text-red-300" : "text-emerald-300"}`}>
                        {v.diff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {v.diff > 0 ? "+" : ""}{fmt(v.diff)}
                      </span>
                    </div>
                  ))}
                  {variations.length === 0 ? <p className="text-sm text-slate-500">Sin variaciones relevantes.</p> : null}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
