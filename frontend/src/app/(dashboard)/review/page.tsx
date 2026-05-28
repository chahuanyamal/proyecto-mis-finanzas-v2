"use client";

import { categoriesApi, transactionsApi } from "@/lib/api";
import type { Category, Transaction } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function fmt(value: string, currency = "CLP"): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default function ReviewPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [uncategorized, setUncategorized] = useState<Transaction[]>([]);
  const [flagged, setFlagged] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/review"); }, [hasVerified, router, user]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [unc, flg, cat] = await Promise.all([
        transactionsApi.list({ only_uncategorized: true, limit: 200 }),
        transactionsApi.list({ only_flagged: true, limit: 200 }),
        categoriesApi.list(),
      ]);
      setUncategorized(unc.data);
      setFlagged(flg.data);
      setCategories(cat.data);
    } catch { setError("No se pudo cargar la bandeja."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  async function assign(id: string, categoryId: string) {
    if (!categoryId) return;
    try { await transactionsApi.update(id, { category_id: categoryId }); await load(); }
    catch { setError("No se pudo categorizar."); }
  }
  async function unflag(id: string) {
    try { await transactionsApi.setFlag(id, false); await load(); }
    catch { setError("No se pudo desmarcar."); }
  }

  function Row({ tx, showUnflag }: { tx: Transaction; showUnflag?: boolean }) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded border border-slate-800 bg-black/30 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{tx.description}</p>
          <p className="truncate text-xs text-slate-500">
            {tx.date} · {tx.account?.name ?? "-"}
            {tx.flag_reason ? ` · motivo: ${tx.flag_reason}` : ""}
          </p>
        </div>
        <span className={`whitespace-nowrap font-mono text-sm ${tx.movement_type === "income" ? "text-emerald-300" : "text-red-300"}`}>
          {tx.movement_type === "income" ? "+" : "−"}{fmt(tx.amount, tx.currency)}
        </span>
        <select defaultValue={tx.category_id ?? ""} onChange={(e) => void assign(tx.id, e.target.value)} className="rounded border border-slate-700 bg-black px-2 py-1 text-xs">
          <option value="">Categorizar…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {showUnflag ? <button onClick={() => void unflag(tx.id)} className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-white/5">Desmarcar</button> : null}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Por revisar</p>
          <h1 className="mt-2 text-3xl font-bold">Bandeja de revisión</h1>
          <p className="mt-1 text-sm text-slate-400">Movimientos sin categoría o marcados para revisar.</p>
        </header>
        {error ? <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        {isLoading ? (
          <p className="flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p>
        ) : (
          <>
            <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
              <h2 className="text-lg font-semibold">Sin categoría <span className="text-sm text-slate-500">· {uncategorized.length}</span></h2>
              <div className="mt-4 space-y-2">
                {uncategorized.map((tx) => <Row key={tx.id} tx={tx} />)}
                {uncategorized.length === 0 ? <p className="text-sm text-slate-500">Todo categorizado 🎉</p> : null}
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
              <h2 className="text-lg font-semibold">Marcados para revisar <span className="text-sm text-slate-500">· {flagged.length}</span></h2>
              <div className="mt-4 space-y-2">
                {flagged.map((tx) => <Row key={tx.id} tx={tx} showUnflag />)}
                {flagged.length === 0 ? <p className="text-sm text-slate-500">No hay movimientos marcados.</p> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
