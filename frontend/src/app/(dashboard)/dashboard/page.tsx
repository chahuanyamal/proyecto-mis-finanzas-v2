"use client";

import { dashboardApi } from "@/lib/api";
import type { DashboardPeriod, DashboardSummary, DashboardTrends } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const PERIODS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "mtd", label: "Mes" },
  { value: "30d", label: "30 dias" },
  { value: "ytd", label: "Ano" },
  { value: "12m", label: "12 meses" },
];

function asNumber(value: string | null | undefined): number {
  return Number(value ?? 0);
}

function formatMoney(value: string, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(asNumber(value));
}

function formatPercent(value: string | null): string {
  if (value === null) return "sin base";
  const number = asNumber(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function deltaClass(value: string | null, positiveIsGood = true): string {
  if (value === null) return "text-slate-500";
  const number = asNumber(value);
  if (number === 0) return "text-slate-400";
  const good = positiveIsGood ? number > 0 : number < 0;
  return good ? "text-emerald-300" : "text-red-300";
}

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [period, setPeriod] = useState<DashboardPeriod>("mtd");
  const [currency, setCurrency] = useState("CLP");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [summaryResponse, trendsResponse] = await Promise.all([
          dashboardApi.summary(period, currency),
          dashboardApi.trends(12, currency),
        ]);
        if (!cancelled) {
          setSummary(summaryResponse.data);
          setTrends(trendsResponse.data);
        }
      } catch {
        if (!cancelled) setError("No se pudo cargar el dashboard.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [currency, period]);

  const maxTrend = Math.max(
    1,
    ...(trends?.trends ?? []).flatMap((item) => [asNumber(item.income), asNumber(item.expenses)]),
  );
  const topCategoryTotal = Math.max(1, ...(summary?.category_expenses ?? []).map((item) => asNumber(item.amount)));

  return (
    <section className="p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-400">Dashboard</p>
              <h1 className="mt-2">Resumen financiero</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                {summary ? `${summary.date_from} a ${summary.date_to}` : "Cargando periodo"}
                {user ? ` · ${user.email}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPeriod(item.value)}
                  className={`btn-ghost ${period === item.value ? "border-brand-400 text-brand-300" : ""}`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrency((current) => (current === "CLP" ? "USD" : "CLP"))}
                className="btn-primary"
              >
                {currency}
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="card flex items-center gap-2 p-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando metricas...
          </div>
        ) : null}
        {error ? <div className="card border-red-500/40 p-4 text-sm text-red-300">{error}</div> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Ingresos", value: summary?.income ?? "0", delta: summary?.income_change ?? null, good: true },
            { label: "Gastos", value: summary?.expenses ?? "0", delta: summary?.expenses_change ?? null, good: false },
            { label: "Ahorro neto", value: summary?.net ?? "0", delta: summary?.net_change ?? null, good: true },
            { label: "Tasa ahorro", value: `${summary?.savings_rate ?? "0"}%`, delta: null, good: true, raw: true },
          ].map((item) => (
            <article key={item.label} className="card p-5">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
              <p className={`mt-3 text-2xl font-bold ${item.label === "Gastos" ? "text-red-300" : "text-slate-100"}`}>
                {item.raw ? item.value : formatMoney(item.value, currency)}
              </p>
              <p className={`mt-2 flex items-center gap-1 text-xs ${deltaClass(item.delta, item.good)}`}>
                {item.delta !== null && asNumber(item.delta) >= 0 ? <ArrowUpRight className="h-3 w-3" /> : null}
                {item.delta !== null && asNumber(item.delta) < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                {item.delta === null ? "sin periodo previo" : `${formatPercent(item.delta)} vs previo`}
              </p>
            </article>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2>Tendencia 12 meses</h2>
                <p className="mt-1 text-xs text-slate-500">Ingresos y gastos por mes.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-12 items-end gap-2 overflow-x-auto pb-1">
              {(trends?.trends ?? []).map((item) => {
                const incomeHeight = Math.max(4, (asNumber(item.income) / maxTrend) * 100);
                const expenseHeight = Math.max(4, (asNumber(item.expenses) / maxTrend) * 100);
                return (
                  <div key={item.month} className="min-w-10 space-y-2 text-center">
                    <div className="flex h-36 items-end justify-center gap-1 border-b border-slate-800">
                      <span className="w-2 bg-emerald-400/80" style={{ height: `${incomeHeight}%` }} title="Ingresos" />
                      <span className="w-2 bg-red-400/80" style={{ height: `${expenseHeight}%` }} title="Gastos" />
                    </div>
                    <p className="text-[10px] text-slate-500">{item.month.slice(5)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2>Por revisar</h2>
                <p className="mt-1 text-xs text-slate-500">Movimientos sin categoria.</p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => router.push("/review")}>
                Revisar
              </button>
            </div>
            <p className="mt-6 text-5xl font-bold text-brand-300">{summary?.uncategorized_count ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">pendientes en el periodo actual</p>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="card p-5">
            <h2>Top categorias</h2>
            <div className="mt-4 space-y-3">
              {(summary?.category_expenses ?? []).map((item) => (
                <div key={item.category_id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{item.category_name}</span>
                    <span className="font-bold">{formatMoney(item.amount, currency)}</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-slate-900">
                    <div
                      className="h-1.5 bg-brand-400"
                      style={{ width: `${Math.max(2, (asNumber(item.amount) / topCategoryTotal) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {summary?.category_expenses.length === 0 ? <p className="text-sm text-slate-500">Sin gastos categorizados.</p> : null}
            </div>
          </section>

          <section className="card p-5">
            <h2>Movimientos recientes</h2>
            <div className="mt-4 divide-y divide-slate-800">
              {(summary?.recent_transactions ?? []).map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => router.push("/transactions")}
                  className="grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left text-sm hover:text-brand-300"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-slate-200">{tx.description}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {tx.date} · {tx.account_name} · {tx.category_name ?? "Sin categoria"}
                    </span>
                  </span>
                  <span className={tx.movement_type === "income" ? "text-emerald-300" : "text-red-300"}>
                    {tx.movement_type === "income" ? "+" : "-"}{formatMoney(tx.amount, tx.currency)}
                  </span>
                </button>
              ))}
              {summary?.recent_transactions.length === 0 ? <p className="py-4 text-sm text-slate-500">Sin movimientos recientes.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
