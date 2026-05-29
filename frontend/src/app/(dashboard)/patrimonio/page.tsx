"use client";

import { patrimonioApi } from "@/lib/api";
import type { NetWorth, PatrimonioAccountTrend, PatrimonioCompare, PatrimonioHistory } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const TYPE_LABELS: Record<string, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  credit: "Credito",
  cash: "Efectivo",
};

function n(value: string | null | undefined): number {
  return Number(value ?? 0);
}

function formatAmount(value: string, currency: string): string {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(amount);
}

function formatPercent(value: string | null): string {
  if (value === null) return "sin base";
  const amount = Number(value);
  return `${amount > 0 ? "+" : ""}${amount.toFixed(1)}%`;
}

export default function PatrimonioPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [currency, setCurrency] = useState("CLP");
  const [data, setData] = useState<NetWorth | null>(null);
  const [history, setHistory] = useState<PatrimonioHistory | null>(null);
  const [trend, setTrend] = useState<PatrimonioAccountTrend | null>(null);
  const [compare, setCompare] = useState<PatrimonioCompare | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/patrimonio"); }, [hasVerified, router, user]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsLoading(true);
    setError("");
    Promise.all([
      patrimonioApi.get(),
      patrimonioApi.history(12, currency),
      patrimonioApi.accountTrend(12, currency),
      patrimonioApi.compare(1, currency),
    ]).then(([net, hist, accountTrend, cmp]) => {
      if (cancelled) return;
      setData(net.data);
      setHistory(hist.data);
      setTrend(accountTrend.data);
      setCompare(cmp.data);
    }).catch(() => {
      if (!cancelled) setError("No se pudo cargar el patrimonio.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [currency, user]);

  const visibleAccounts = useMemo(() => (data?.accounts ?? []).filter((account) => account.currency === currency), [currency, data]);
  const historyPoints = history?.history ?? [];
  const maxHistory = Math.max(1, ...historyPoints.map((point) => Math.abs(n(point.value))));
  const compareTotal = compare?.totals.find((item) => item.currency === currency) ?? null;

  return (
    <section className="p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-400">Patrimonio</p>
              <h1 className="mt-2">Patrimonio neto</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">Saldos actuales, tendencia mensual reconstruida y comparacion contra el mes anterior.</p>
            </div>
            <button type="button" className="btn-primary" onClick={() => setCurrency((current) => current === "CLP" ? "USD" : "CLP")}>{currency}</button>
          </div>
        </header>

        {error ? <div className="card border-red-500/40 p-4 text-sm text-red-300">{error}</div> : null}
        {isLoading ? <div className="card flex items-center gap-2 p-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando patrimonio...</div> : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Total {currency}</p>
            <p className="mt-3 text-3xl font-bold text-brand-300">{formatAmount(data?.totals_by_currency.find((t) => t.currency === currency)?.total ?? "0", currency)}</p>
          </div>
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Vs mes anterior</p>
            <p className={`mt-3 text-3xl font-bold ${n(compareTotal?.delta) >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatAmount(compareTotal?.delta ?? "0", currency)}</p>
            <p className="mt-1 text-xs text-slate-500">{formatPercent(compareTotal?.delta_percent ?? null)}</p>
          </div>
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Cuentas</p>
            <p className="mt-3 text-3xl font-bold">{visibleAccounts.length}</p>
            <p className="mt-1 text-xs text-slate-500">de {data?.account_count ?? 0} registradas</p>
          </div>
        </div>

        <section className="card p-5">
          <h2>Evolucion 12 meses</h2>
          <div className="mt-5 grid grid-cols-12 items-end gap-2 overflow-x-auto pb-1">
            {historyPoints.map((point) => {
              const height = Math.max(4, (Math.abs(n(point.value)) / maxHistory) * 100);
              return (
                <div key={`${point.month}-${point.currency}`} className="min-w-10 space-y-2 text-center">
                  <div className="flex h-36 items-end justify-center border-b border-slate-800">
                    <span className={n(point.value) >= 0 ? "w-4 bg-brand-400" : "w-4 bg-red-400"} style={{ height: `${height}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500">{point.month.slice(5)}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <section className="card p-5">
            <h2>Tendencia por cuenta</h2>
            <div className="mt-4 space-y-3">
              {(trend?.accounts ?? []).map((account) => (
                <div key={account.id} className="border border-slate-800 bg-black/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{account.name}</p>
                      <p className="text-xs text-slate-500">{TYPE_LABELS[account.account_type] ?? account.account_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono">{formatAmount(account.current_balance, account.currency)}</p>
                      <p className={n(account.delta) >= 0 ? "text-xs text-emerald-300" : "text-xs text-red-300"}>{formatAmount(account.delta, account.currency)} · {formatPercent(account.delta_percent)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex h-8 items-end gap-1">
                    {account.points.map((point) => {
                      const max = Math.max(1, ...account.points.map((p) => Math.abs(n(p.balance))));
                      return <span key={point.month} className="flex-1 bg-slate-700" style={{ height: `${Math.max(8, (Math.abs(n(point.balance)) / max) * 100)}%` }} />;
                    })}
                  </div>
                </div>
              ))}
              {trend?.accounts.length === 0 ? <p className="text-sm text-slate-500">Sin cuentas en {currency}.</p> : null}
            </div>
          </section>

          <section className="card p-5">
            <h2>Mayores movimientos patrimoniales</h2>
            <div className="mt-4 divide-y divide-slate-800">
              {(compare?.top_movers ?? []).filter((item) => item.currency === currency).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="truncate">{item.name}</span>
                  <span className={n(item.delta) >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{formatAmount(item.delta, item.currency)}</span>
                </div>
              ))}
              {compare?.top_movers.filter((item) => item.currency === currency).length === 0 ? <p className="py-4 text-sm text-slate-500">Sin variaciones.</p> : null}
            </div>
          </section>
        </div>

        <section className="card p-5">
          <h2>Detalle por cuenta</h2>
          <div className="mt-4 space-y-2">
            {visibleAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between border border-slate-800 bg-black/30 px-4 py-3">
                <div>
                  <p className="font-semibold">{account.name}</p>
                  <p className="text-xs text-slate-500">{TYPE_LABELS[account.account_type] ?? account.account_type}</p>
                </div>
                <span className="font-mono">{formatAmount(account.balance, account.currency)}</span>
              </div>
            ))}
            {visibleAccounts.length === 0 ? <p className="text-sm text-slate-500">Sin cuentas registradas en {currency}.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
