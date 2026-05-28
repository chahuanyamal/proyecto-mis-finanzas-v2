"use client";

import { dashboardApi } from "@/lib/api";
import type { MonthlyDashboard } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe, logout } = useAuthStore();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<MonthlyDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login"); }, [hasVerified, router, user]);

  async function loadDashboard(selectedMonth = month) {
    setIsLoading(true);
    try { setData((await dashboardApi.monthly(selectedMonth)).data); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { if (user) void loadDashboard(); }, [user]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Dashboard</p>
              <h1 className="mt-3 text-3xl font-bold">Resumen mensual</h1>
              {user ? <p className="mt-2 text-sm text-slate-400">Sesión: {user.email}</p> : null}
            </div>
            <div className="flex gap-3">
              <input
                type="month"
                value={month}
                onChange={(event) => { setMonth(event.target.value); void loadDashboard(event.target.value); }}
                className="rounded border border-slate-700 bg-black px-3 py-2 text-sm"
              />
              <button onClick={handleLogout} className="rounded border border-slate-700 px-4 py-2 text-sm hover:border-brand-400">Salir</button>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            {[["/accounts", "Cuentas"], ["/transactions", "Transacciones"], ["/categories", "Categorías"], ["/tags", "Tags"], ["/rules", "Reglas"], ["/presupuestos", "Presupuestos"]].map(([path, label]) => (
              <button key={path} type="button" onClick={() => router.push(path)} className="rounded border border-slate-700 px-3 py-2 hover:border-brand-400">{label}</button>
            ))}
          </div>
        </section>

        {isLoading ? <p className="flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p> : null}

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Ingresos", data?.income ?? "0", "text-green-300"],
            ["Gastos", data?.expenses ?? "0", "text-red-300"],
            ["Balance", data?.balance ?? "0", "text-brand-300"],
            ["Ahorro", `${data?.savings_rate ?? "0"}%`, "text-slate-100"],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-lg border border-slate-800 bg-surface-900 p-5">
              <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
              <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-surface-900 p-6">
            <h2 className="text-lg font-semibold">Gastos por categoría</h2>
            <div className="mt-4 space-y-3">
              {(data?.category_expenses ?? []).map((item) => <div key={item.category_id} className="flex justify-between border-b border-slate-800 pb-2"><span>{item.category_name}</span><span>{item.amount}</span></div>)}
              {data?.category_expenses.length === 0 ? <p className="text-sm text-slate-500">Sin gastos en el mes.</p> : null}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-surface-900 p-6">
            <h2 className="text-lg font-semibold">Presupuestos</h2>
            <div className="mt-4 space-y-3">
              {(data?.budgets ?? []).map((budget) => <div key={budget.id} className="rounded border border-slate-800 p-3"><div className="flex justify-between"><span>{budget.category_name}</span><span>{budget.spent} / {budget.amount}</span></div><div className="mt-2 h-2 rounded bg-slate-800"><div className={`h-2 rounded ${budget.status === "exceeded" ? "bg-red-500" : budget.status === "warning" ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(budget.percent, 100)}%` }} /></div></div>)}
              {data?.budgets.length === 0 ? <p className="text-sm text-slate-500">Sin presupuestos para este mes.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
