"use client";

import { transactionsApi } from "@/lib/api";
import type { CategoryAggregate, TransactionSummary } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function fmt(value: number, currency = "CLP"): string {
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10); // día 0 del mes siguiente = último del actual
  return { start, end };
}
function ymOffset(offset: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function primaryCurrency(s: TransactionSummary | null): string {
  if (!s) return "CLP";
  let best = "CLP"; let max = -1;
  for (const [cur, v] of Object.entries(s.by_currency)) if (v.count > max) { max = v.count; best = cur; }
  return best;
}
function delta(a: number, b: number): { abs: number; pct: number | null } {
  return { abs: a - b, pct: b === 0 ? null : ((a - b) / b) * 100 };
}

export default function CompararPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [monthA, setMonthA] = useState(ymOffset(0));
  const [monthB, setMonthB] = useState(ymOffset(-1));
  const [sumA, setSumA] = useState<TransactionSummary | null>(null);
  const [sumB, setSumB] = useState<TransactionSummary | null>(null);
  const [catA, setCatA] = useState<CategoryAggregate[]>([]);
  const [catB, setCatB] = useState<CategoryAggregate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/comparar"); }, [hasVerified, router, user]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const ra = monthRange(monthA); const rb = monthRange(monthB);
    try {
      const [sa, sb, ca, cb] = await Promise.all([
        transactionsApi.summary({ start_date: ra.start, end_date: ra.end }),
        transactionsApi.summary({ start_date: rb.start, end_date: rb.end }),
        transactionsApi.byCategory({ start_date: ra.start, end_date: ra.end }),
        transactionsApi.byCategory({ start_date: rb.start, end_date: rb.end }),
      ]);
      setSumA(sa.data); setSumB(sb.data); setCatA(ca.data); setCatB(cb.data);
    } catch { setError("No se pudo cargar la comparación."); }
    finally { setIsLoading(false); }
  }, [monthA, monthB]);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const cur = primaryCurrency(sumA);
  const aIncome = Number(sumA?.by_currency[cur]?.income ?? 0);
  const aExpense = Number(sumA?.by_currency[cur]?.expense ?? 0);
  const bIncome = Number(sumB?.by_currency[cur]?.income ?? 0);
  const bExpense = Number(sumB?.by_currency[cur]?.expense ?? 0);

  const categoryRows = useMemo(() => {
    const map = new Map<string, { name: string; a: number; b: number }>();
    for (const c of catA) { const k = c.category_id ?? "uncategorized"; map.set(k, { name: c.category_name, a: Number(c.expense), b: 0 }); }
    for (const c of catB) {
      const k = c.category_id ?? "uncategorized";
      const e = map.get(k);
      if (e) e.b = Number(c.expense); else map.set(k, { name: c.category_name, a: 0, b: Number(c.expense) });
    }
    return [...map.values()].filter((r) => r.a || r.b).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
  }, [catA, catB]);

  function DeltaTag({ a, b, invert }: { a: number; b: number; invert?: boolean }) {
    const d = delta(a, b);
    // invert=true → subir gasto es malo (rojo). Para ingresos/neto, subir es bueno (verde).
    const good = invert ? d.abs <= 0 : d.abs >= 0;
    return (
      <span className={good ? "text-emerald-300" : "text-red-300"}>
        {d.abs >= 0 ? "+" : ""}{fmt(d.abs, cur)}{d.pct !== null ? ` (${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(0)}%)` : ""}
      </span>
    );
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Comparar</p>
          <h1 className="mt-2 text-3xl font-bold">Comparar períodos</h1>
        </header>

        <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-800 bg-surface-900 p-4">
          <label className="text-sm">Período A<br /><input type="month" className="mt-1 rounded border border-slate-700 bg-black px-3 py-2" value={monthA} onChange={(e) => setMonthA(e.target.value)} /></label>
          <span className="pb-2 text-slate-500">vs</span>
          <label className="text-sm">Período B<br /><input type="month" className="mt-1 rounded border border-slate-700 bg-black px-3 py-2" value={monthB} onChange={(e) => setMonthB(e.target.value)} /></label>
        </div>

        {error ? <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        {isLoading ? (
          <p className="flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Ingresos", a: aIncome, b: bIncome, invert: false },
                { label: "Egresos", a: aExpense, b: bExpense, invert: true },
                { label: "Saldo neto", a: aIncome - aExpense, b: bIncome - bExpense, invert: false },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-slate-800 bg-surface-900 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">{k.label}</p>
                  <p className="mt-1 text-lg font-bold">{fmt(k.a, cur)}</p>
                  <p className="text-xs text-slate-500">B: {fmt(k.b, cur)}</p>
                  <p className="mt-1 text-xs"><DeltaTag a={k.a} b={k.b} invert={k.invert} /></p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
              <h2 className="text-lg font-semibold">Gasto por categoría</h2>
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr><th className="py-2">Categoría</th><th className="py-2 text-right">A</th><th className="py-2 text-right">B</th><th className="py-2 text-right">Δ</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {categoryRows.map((r) => (
                    <tr key={r.name}>
                      <td className="py-2">{r.name}</td>
                      <td className="py-2 text-right font-mono">{fmt(r.a, cur)}</td>
                      <td className="py-2 text-right font-mono text-slate-400">{fmt(r.b, cur)}</td>
                      <td className="py-2 text-right font-mono"><DeltaTag a={r.a} b={r.b} invert /></td>
                    </tr>
                  ))}
                  {categoryRows.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-slate-500">Sin datos en estos períodos.</td></tr> : null}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
