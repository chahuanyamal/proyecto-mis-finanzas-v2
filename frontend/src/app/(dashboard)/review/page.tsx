"use client";

import { categoriesApi, rulesApi, transactionsApi } from "@/lib/api";
import type { Category, Transaction } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Flag, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function fmt(value: string, currency = "CLP"): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(n);
}

function suggestedPattern(description: string): string {
  const clean = description
    .replace(/\b\d{2,}\b/g, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.split(" ").slice(0, 3).join(" ") || description.slice(0, 40);
}

type Drafts = Record<string, { categoryId: string; pattern: string }>;

export default function ReviewPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [uncategorized, setUncategorized] = useState<Transaction[]>([]);
  const [flagged, setFlagged] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/review"); }, [hasVerified, router, user]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [unc, flg, cat] = await Promise.all([
        transactionsApi.list({ only_uncategorized: true, exclude_internal: true, exclude_duplicates: true, limit: 200 }),
        transactionsApi.list({ only_flagged: true, limit: 100 }),
        categoriesApi.list(),
      ]);
      setUncategorized(unc.data);
      setFlagged(flg.data);
      setCategories(cat.data);
      setDrafts((current) => {
        const next = { ...current };
        for (const tx of unc.data) {
          if (!next[tx.id]) next[tx.id] = { categoryId: "", pattern: suggestedPattern(tx.description) };
        }
        return next;
      });
    } catch {
      setError("No se pudo cargar la bandeja de revision.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const totals = useMemo(() => {
    const byCurrency: Record<string, number> = {};
    for (const tx of uncategorized) {
      byCurrency[tx.currency] = (byCurrency[tx.currency] ?? 0) + Number(tx.amount);
    }
    return byCurrency;
  }, [uncategorized]);

  function updateDraft(id: string, changes: Partial<Drafts[string]>) {
    setDrafts((current) => {
      const existing = current[id] ?? { categoryId: "", pattern: "" };
      return { ...current, [id]: { ...existing, ...changes } };
    });
  }

  async function assign(tx: Transaction) {
    const categoryId = drafts[tx.id]?.categoryId;
    if (!categoryId) {
      setError("Selecciona una categoria primero.");
      return;
    }
    setBusyId(tx.id);
    setError("");
    setInfo("");
    try {
      await transactionsApi.update(tx.id, { category_id: categoryId });
      setInfo("Movimiento categorizado.");
      await load();
    } catch {
      setError("No se pudo categorizar el movimiento.");
    } finally {
      setBusyId(null);
    }
  }

  async function createRuleAndApply(tx: Transaction) {
    const draft = drafts[tx.id];
    if (!draft?.categoryId || !draft.pattern.trim()) {
      setError("Selecciona una categoria y define el patron de la regla.");
      return;
    }
    setBusyId(tx.id);
    setError("");
    setInfo("");
    try {
      await rulesApi.create({
        target_category_id: draft.categoryId,
        field: "description",
        operator: "contains",
        pattern: draft.pattern.trim(),
        priority: 100,
      });
      const { data } = await transactionsApi.autoCategorize();
      setInfo(`Regla creada. ${data.updated} movimiento(s) categorizado(s).`);
      await load();
    } catch {
      setError("No se pudo crear la regla.");
    } finally {
      setBusyId(null);
    }
  }

  async function applyRules() {
    setIsApplyingRules(true);
    setError("");
    setInfo("");
    try {
      const { data } = await transactionsApi.autoCategorize();
      setInfo(`Reglas aplicadas. ${data.updated} movimiento(s) actualizado(s).`);
      await load();
    } catch {
      setError("No se pudieron aplicar las reglas.");
    } finally {
      setIsApplyingRules(false);
    }
  }

  async function unflag(id: string) {
    setBusyId(id);
    try {
      await transactionsApi.setFlag(id, false);
      await load();
    } catch {
      setError("No se pudo desmarcar el movimiento.");
    } finally {
      setBusyId(null);
    }
  }

  function ReviewRow({ tx }: { tx: Transaction }) {
    const draft = drafts[tx.id] ?? { categoryId: "", pattern: suggestedPattern(tx.description) };
    const isBusy = busyId === tx.id;
    return (
      <article className="card p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-100">{tx.description}</p>
              {tx.is_flagged ? <Flag className="h-3.5 w-3.5 text-amber-300" /> : null}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              {tx.date} · {tx.account?.name ?? "Cuenta"} · {tx.currency}
            </p>
          </div>
          <span className={`font-mono text-sm font-bold ${tx.movement_type === "income" ? "text-emerald-300" : "text-red-300"}`}>
            {tx.movement_type === "income" ? "+" : "-"}{fmt(tx.amount, tx.currency)}
          </span>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto]">
          <select
            value={draft.categoryId}
            onChange={(event) => updateDraft(tx.id, { categoryId: event.target.value })}
            className="border border-slate-700 bg-black px-3 py-2 text-sm"
          >
            <option value="">Categoria...</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <input
            value={draft.pattern}
            onChange={(event) => updateDraft(tx.id, { pattern: event.target.value })}
            className="border border-slate-700 bg-black px-3 py-2 text-sm"
            placeholder="Patron para regla"
          />
          <button type="button" onClick={() => void assign(tx)} disabled={isBusy} className="btn-ghost disabled:opacity-50">
            {isBusy ? "..." : "Solo este"}
          </button>
          <button type="button" onClick={() => void createRuleAndApply(tx)} disabled={isBusy} className="btn-primary disabled:opacity-50">
            Regla
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-brand-400">Por revisar</p>
              <h1 className="mt-2">Bandeja de categorizacion</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Limpia movimientos sin categoria, crea reglas reutilizables y aplica reglas pendientes.
              </p>
            </div>
            <button type="button" onClick={() => void applyRules()} disabled={isApplyingRules} className="btn-primary disabled:opacity-50">
              {isApplyingRules ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Aplicar reglas
            </button>
          </div>
        </header>

        {error ? <div className="card border-red-500/40 p-4 text-sm text-red-300">{error}</div> : null}
        {info ? <div className="card border-emerald-500/40 p-4 text-sm text-emerald-300">{info}</div> : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="card p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Sin categoria</p>
            <p className="mt-2 text-3xl font-bold text-brand-300">{uncategorized.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Marcados</p>
            <p className="mt-2 text-3xl font-bold text-amber-300">{flagged.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Monto pendiente</p>
            <p className="mt-2 truncate text-lg font-bold">
              {Object.entries(totals).map(([currency, total]) => fmt(String(total), currency)).join(" · ") || fmt("0")}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="card flex items-center gap-2 p-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando bandeja...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2>Movimientos sin categoria</h2>
                <p className="text-xs text-slate-500">Usa `Regla` para categorizar casos similares.</p>
              </div>
              {uncategorized.map((tx) => <ReviewRow key={tx.id} tx={tx} />)}
              {uncategorized.length === 0 ? (
                <div className="card p-8 text-center text-sm text-slate-400">
                  <Wand2 className="mx-auto mb-3 h-6 w-6 text-brand-300" />
                  Todo categorizado. Importa nuevas cartolas o revisa movimientos marcados.
                </div>
              ) : null}
            </section>

            <aside className="card h-fit p-5">
              <h2>Marcados para revisar</h2>
              <div className="mt-4 divide-y divide-slate-800">
                {flagged.map((tx) => (
                  <div key={tx.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{tx.description}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{tx.flag_reason || "Sin motivo"}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-slate-400">{fmt(tx.amount, tx.currency)}</span>
                    </div>
                    <button type="button" onClick={() => void unflag(tx.id)} disabled={busyId === tx.id} className="mt-2 text-xs text-brand-300 disabled:opacity-50">
                      Desmarcar
                    </button>
                  </div>
                ))}
                {flagged.length === 0 ? <p className="py-4 text-sm text-slate-500">No hay movimientos marcados.</p> : null}
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
