"use client";

import { patrimonioApi } from "@/lib/api";
import type { NetWorth } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TYPE_LABELS: Record<string, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  credit: "Crédito",
  cash: "Efectivo",
};

function formatAmount(value: string, currency: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default function PatrimonioPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [data, setData] = useState<NetWorth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/patrimonio"); }, [hasVerified, router, user]);
  useEffect(() => {
    if (!user) return;
    patrimonioApi.get().then((r) => setData(r.data)).catch(() => setError("No se pudo cargar el patrimonio."));
  }, [user]);

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Patrimonio</p>
          <h1 className="mt-2 text-3xl font-bold">Patrimonio neto</h1>
          <p className="mt-1 text-sm text-slate-400">Suma de los saldos de tus cuentas, agrupados por moneda.</p>
        </header>
        {error ? <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.totals_by_currency.map((total) => (
            <div key={total.currency} className="rounded-lg border border-slate-800 bg-surface-900 p-6">
              <p className="text-xs uppercase tracking-widest text-slate-500">Total {total.currency}</p>
              <p className="mt-2 text-2xl font-bold text-brand-300">{formatAmount(total.total, total.currency)}</p>
            </div>
          ))}
          {data && data.totals_by_currency.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no tienes cuentas con saldo.</p>
          ) : null}
        </section>

        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <h2 className="text-lg font-semibold">Detalle por cuenta</h2>
          <div className="mt-4 space-y-2">
            {data?.accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between rounded border border-slate-800 bg-black/30 px-4 py-3">
                <div>
                  <p className="font-semibold">{account.name}</p>
                  <p className="text-xs text-slate-500">{TYPE_LABELS[account.account_type] ?? account.account_type}</p>
                </div>
                <span className="font-mono">{formatAmount(account.balance, account.currency)}</span>
              </div>
            ))}
            {data && data.accounts.length === 0 ? <p className="text-sm text-slate-500">Sin cuentas registradas.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
