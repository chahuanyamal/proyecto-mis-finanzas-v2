"use client";

import { statementsApi, transactionsApi } from "@/lib/api";
import type { StatementUpload, Transaction } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Flow = "all" | "income" | "expense";

function fmt(value: string, currency = "CLP"): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default function StatementDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [meta, setMeta] = useState<StatementUpload | null>(null);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [flow, setFlow] = useState<Flow>("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace(`/login?next=/statements/${id}`); }, [hasVerified, router, user, id]);

  async function load() {
    setIsLoading(true);
    try {
      const [detail, list] = await Promise.all([
        statementsApi.detail(id),
        transactionsApi.list({ statement_id: id, limit: 500 }),
      ]);
      setMeta(detail.data.uploaded_file);
      setRows(list.data);
    } catch { setMessage("No se pudo cargar la cartola."); }
    finally { setIsLoading(false); }
  }
  useEffect(() => { if (user) void load(); }, [user, id]);

  async function reprocess() {
    setBusy(true); setMessage("");
    try { const res = await statementsApi.reprocess(id); setMessage(`Reprocesadas ${res.data.imported_transactions} transacciones.`); await load(); }
    catch { setMessage("No se pudo reprocesar."); } finally { setBusy(false); }
  }

  const filtered = useMemo(() => rows.filter((tx) => {
    if (flow !== "all" && tx.movement_type !== flow) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return tx.description.toLowerCase().includes(q) || (tx.category?.name ?? "").toLowerCase().includes(q);
    }
    return true;
  }), [rows, flow, search]);

  const totalIncome = rows.filter((t) => t.movement_type === "income").reduce((a, t) => a + Number(t.amount), 0);
  const totalExpense = rows.filter((t) => t.movement_type === "expense").reduce((a, t) => a + Number(t.amount), 0);
  const filteredSum = filtered.reduce((a, t) => a + (t.movement_type === "income" ? Number(t.amount) : -Number(t.amount)), 0);

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <button onClick={() => router.push("/statements")} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={16} /> Volver</button>

        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Cartola</p>
          <h1 className="mt-2 break-all text-2xl font-bold">{meta?.filename ?? "…"}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {meta?.bank_detected ? `Banco: ${meta.bank_detected} · ` : ""}
            Estado: {meta?.status ?? "-"}
            {meta?.period_start && meta?.period_end ? ` · ${meta.period_start} → ${meta.period_end}` : ""}
          </p>
          {message ? <p className="mt-3 rounded bg-black/40 px-3 py-2 text-sm text-slate-300">{message}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Movimientos</p><p className="mt-1 text-lg font-bold">{rows.length}</p></div>
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Abonos</p><p className="mt-1 text-lg font-bold text-emerald-300">{fmt(String(totalIncome))}</p></div>
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Cargos</p><p className="mt-1 text-lg font-bold text-red-300">{fmt(String(totalExpense))}</p></div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {(["all", "income", "expense"] as Flow[]).map((fl) => (
                <button key={fl} onClick={() => setFlow(fl)} className={`rounded border px-3 py-1.5 text-xs ${flow === fl ? "border-brand-500 bg-brand-500/10 text-brand-300" : "border-slate-700 hover:bg-white/5"}`}>
                  {fl === "all" ? "Todos" : fl === "income" ? "Abonos" : "Cargos"}
                </button>
              ))}
            </div>
            <input className="flex-1 rounded border border-slate-700 bg-black px-3 py-1.5 text-sm" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="text-xs text-slate-500">{filtered.length}/{rows.length}</span>
            <button onClick={() => window.open(`${transactionsApi.exportCsvUrl()}?statement_id=${id}`, "_blank")} className="flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-white/5"><Download size={14} /> CSV</button>
            <button onClick={() => void reprocess()} disabled={busy} className="flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reprocesar</button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-surface-900 p-2">
          {isLoading ? (
            <p className="flex gap-2 p-6 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2 text-right">Monto</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((tx, i) => (
                  <tr key={tx.id} className="hover:bg-white/5">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{String(i + 1).padStart(3, "0")}</td>
                    <td className="px-3 py-2">{tx.date}</td>
                    <td className="px-3 py-2">
                      {tx.description}
                      {tx.is_internal_transfer ? <span className="ml-2 rounded bg-sky-900/60 px-1 text-[10px] text-sky-300">INT</span> : null}
                      {tx.is_duplicate ? <span className="ml-1 rounded bg-amber-900/60 px-1 text-[10px] text-amber-300">DUP</span> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{tx.category?.name ?? "Sin asignar"}</td>
                    <td className={`px-3 py-2 text-right font-mono ${tx.movement_type === "income" ? "text-emerald-300" : "text-red-300"}`}>{tx.movement_type === "income" ? "+" : "−"}{fmt(tx.amount, tx.currency)}</td>
                  </tr>
                ))}
                {filtered.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Sin movimientos.</td></tr> : null}
              </tbody>
              {filtered.length ? (
                <tfoot><tr className="border-t border-slate-700 text-sm"><td colSpan={4} className="px-3 py-2 text-right text-slate-400">Neto filtrado</td><td className={`px-3 py-2 text-right font-mono ${filteredSum >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmt(String(filteredSum))}</td></tr></tfoot>
              ) : null}
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
