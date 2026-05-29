"use client";

import { reportsApi } from "@/lib/api";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AnnualReport } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Download, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function currentYear(): number {
  return new Date().getFullYear();
}

function formatMoney(value: string, currency: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(n);
}

export default function ReportsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [year, setYear] = useState(currentYear());
  const [currency, setCurrency] = useState("CLP");
  const [report, setReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/reports"); }, [hasVerified, router, user]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsLoading(true);
    setError("");
    reportsApi.annual(year).then((response) => {
      if (!cancelled) setReport(response.data);
    }).catch(() => {
      if (!cancelled) setError("No se pudo cargar el reporte anual.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [year, user]);

  const total = report?.totals.find((item) => item.currency === currency) ?? null;
  const months = useMemo(() => (report?.by_month ?? []).filter((item) => item.currency === currency), [currency, report]);
  const categories = useMemo(
    () => (report?.by_category ?? []).filter((item) => item.currency === currency).sort((a, b) => Number(b.expenses) - Number(a.expenses)),
    [currency, report],
  );
  const maxExpense = Math.max(1, ...months.map((item) => Number(item.expenses)));

  return (
    <section className="p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-400">Reportes</p>
              <h1 className="mt-2">Reporte anual</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">Resumen de ingresos, gastos, neto mensual y categorias del año.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="border border-slate-700 bg-black px-3 py-2 text-sm"
              />
              <button type="button" className="btn-ghost" onClick={() => setCurrency((current) => current === "CLP" ? "USD" : "CLP")}>{currency}</button>
              <button type="button" className="btn-primary" onClick={() => window.open(reportsApi.annualCsvUrl(year), "_blank")}>
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
          </div>
        </header>

        {isLoading ? <div className="card flex items-center gap-2 p-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando reporte...</div> : null}
        {error ? <div className="card border-red-500/40 p-4 text-sm text-red-300">{error}</div> : null}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="card p-5"><p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Ingresos</p><p className="mt-3 text-2xl font-bold text-emerald-300">{formatMoney(total?.income ?? "0", currency)}</p></div>
          <div className="card p-5"><p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Gastos</p><p className="mt-3 text-2xl font-bold text-red-300">{formatMoney(total?.expenses ?? "0", currency)}</p></div>
          <div className="card p-5"><p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Neto</p><p className={`mt-3 text-2xl font-bold ${Number(total?.net ?? 0) >= 0 ? "text-brand-300" : "text-red-300"}`}>{formatMoney(total?.net ?? "0", currency)}</p></div>
          <div className="card p-5"><p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Movimientos</p><p className="mt-3 text-2xl font-bold">{total?.count ?? 0}</p><p className="mt-1 text-xs text-slate-500">{report?.uncategorized_count ?? 0} sin categoria</p></div>
        </div>

        <section className="card p-5">
          <h2>Mes a mes</h2>
          <div className="mt-5 grid grid-cols-12 items-end gap-2 overflow-x-auto pb-1">
            {months.map((item) => (
              <div key={`${item.month}-${item.currency}`} className="min-w-10 space-y-2 text-center">
                <div className="flex h-36 items-end justify-center gap-1 border-b border-slate-800">
                  <span className="w-2 bg-emerald-400" style={{ height: `${Math.max(4, (Number(item.income) / maxExpense) * 100)}%` }} />
                  <span className="w-2 bg-red-400" style={{ height: `${Math.max(4, (Number(item.expenses) / maxExpense) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-slate-500">{item.month.slice(5)}</p>
              </div>
            ))}
            {months.length === 0 ? <div className="col-span-12"><EmptyState title="Sin datos mensuales" description={`No hay movimientos para ${year} en ${currency}.`} /></div> : null}
          </div>
        </section>

        <section className="card p-5">
          <h2>Categorias</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Ingresos</th><th className="px-3 py-2 text-right">Gastos</th><th className="px-3 py-2 text-right">Neto</th><th className="px-3 py-2 text-right">#</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {categories.map((item) => (
                  <tr key={`${item.category_id ?? "none"}-${item.currency}`}>
                    <td className="px-3 py-2">{item.category_name}</td>
                    <td className="px-3 py-2 text-right text-emerald-300">{formatMoney(item.income, item.currency)}</td>
                    <td className="px-3 py-2 text-right text-red-300">{formatMoney(item.expenses, item.currency)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMoney(item.net, item.currency)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{item.count}</td>
                  </tr>
                ))}
                {categories.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Sin categorías para mostrar.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
