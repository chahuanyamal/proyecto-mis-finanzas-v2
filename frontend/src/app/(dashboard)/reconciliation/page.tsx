"use client";

import { reconciliationApi } from "@/lib/api";
import type { ReconciliationSummary } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function money(value: string, currency: string) {
  const n = Number(value);
  return Number.isNaN(n) ? value : new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(n);
}

export default function ReconciliationPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [currency, setCurrency] = useState("CLP");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tolerance, setTolerance] = useState("1");
  const [data, setData] = useState<ReconciliationSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/reconciliation"); }, [hasVerified, router, user]);
  useEffect(() => {
    if (user) {
      reconciliationApi.summary({ currency, tolerance, start_date: startDate || undefined, end_date: endDate || undefined })
        .then((r) => setData(r.data))
        .catch(() => setError("No se pudo cargar reconciliación."));
    }
  }, [currency, endDate, startDate, tolerance, user]);

  return (
    <section className="p-4 text-slate-100 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl space-y-5">
      <header className="card p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-400">Control</p><h1 className="mt-2">Reconciliación</h1><p className="mt-2 text-sm text-slate-400">Usa saldos de cartola cuando existen; si no, compara saldo de cuenta contra neto de movimientos.</p></div><button className="btn-primary" onClick={() => setCurrency((c) => c === "CLP" ? "USD" : "CLP")}>{currency}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><input className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /><input className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /><input className="rounded border border-slate-700 bg-black px-3 py-2 text-sm" inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="Tolerancia" /></div></header>
      {error ? <div className="card border-red-500/40 p-4 text-sm text-red-300">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2"><div className="card p-5"><p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">OK</p><p className="mt-3 text-3xl font-bold text-emerald-300">{data?.ok_count ?? 0}</p></div><div className="card p-5"><p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Alertas</p><p className="mt-3 text-3xl font-bold text-red-300">{data?.warning_count ?? 0}</p></div></div>
       <section className="card overflow-hidden"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Cuenta</th><th className="px-3 py-2 text-right">Saldo cuenta</th><th className="px-3 py-2 text-right">Movimientos</th><th className="px-3 py-2 text-right">Diferencia</th><th className="px-3 py-2">Base</th><th className="px-3 py-2">Estado</th></tr></thead><tbody className="divide-y divide-slate-800">{(data?.accounts ?? []).map((a) => <tr key={a.account_id}><td className="px-3 py-2">{a.account_name}<p className="text-xs text-slate-500">{a.transaction_count} mov.</p></td><td className="px-3 py-2 text-right">{money(a.account_balance, a.currency)}</td><td className="px-3 py-2 text-right">{money(a.movement_balance, a.currency)}</td><td className={`px-3 py-2 text-right ${a.status === "ok" ? "text-emerald-300" : "text-red-300"}`}>{money(a.difference, a.currency)}</td><td className="px-3 py-2 text-xs text-slate-400">{a.reconciliation_basis === "statement" ? `${a.statement_count} cartola(s)` : "saldo cuenta"}</td><td className="px-3 py-2">{a.status}</td></tr>)}{data?.accounts.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin cuentas en {currency}.</td></tr> : null}</tbody></table></section>
    </div></section>
  );
}
