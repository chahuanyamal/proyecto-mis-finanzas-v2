"use client";

import { accountsApi, statementsApi } from "@/lib/api";
import type { Account, ParserOption, StatementQualityStats, StatementUpload } from "@/lib/api-types";
import type { StatementPreview } from "@/lib/api-types";
import StatementPreviewCard from "@/components/statements/StatementPreviewCard";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

function monthLabel(s: StatementUpload): string {
  const ref = s.period_end ?? s.period_start;
  if (!ref) return "Sin período";
  return new Date(`${ref}T00:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

export default function StatementsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<StatementUpload[]>([]);
  const [previews, setPreviews] = useState<StatementPreview[]>([]);
  const [parsers, setParsers] = useState<ParserOption[]>([]);
  const [qualityStats, setQualityStats] = useState<StatementQualityStats | null>(null);
  const [accountId, setAccountId] = useState("");
  const [parserKey, setParserKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/statements"); }, [hasVerified, router, user]);

  async function loadData() {
    const [acc, st, pr, parserOptions, quality] = await Promise.all([
      accountsApi.list(),
      statementsApi.list(),
      statementsApi.previews(),
      statementsApi.parsers(),
      statementsApi.qualityStats(),
    ]);
    setAccounts(acc.data);
    setStatements(st.data);
    setPreviews(pr.data);
    setParsers(parserOptions.data);
    setQualityStats(quality.data);
    if (!accountId && acc.data[0]) setAccountId(acc.data[0].id);
  }
  useEffect(() => { if (user) void loadData(); }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || !file) return;
    setIsBusy(true);
    setMessage("");
    try {
      const response = await statementsApi.preview(accountId, file, parserKey || undefined);
      const rows = response.data.rows.length;
      const bank = response.data.bank_detected ?? "desconocido";
      const mode = parserKey ? `parser forzado: ${parserKey}` : "parser automatico";
      setMessage(`Preview creado: ${rows} transacciones detectadas (banco: ${bank}, ${mode}).`);
      setFile(null);
      await loadData();
    } catch {
      setMessage("No se pudo generar preview del PDF.");
    } finally {
      setIsBusy(false);
    }
  }

  async function reprocess(id: string) {
    const res = await statementsApi.reprocess(id);
    setMessage(`Reprocesadas ${res.data.imported_transactions} transacciones.`);
    await loadData();
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of statements) counts[s.status] = (counts[s.status] ?? 0) + 1;
    return counts;
  }, [statements]);

  const byMonth = useMemo(() => {
    const map = new Map<string, StatementUpload[]>();
    for (const s of statements) { const k = monthLabel(s); if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); }
    return [...map.entries()];
  }, [statements]);

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Cartolas</p>
          <h1 className="mt-2 text-3xl font-bold">Preview PDF</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sube, revisa, edita y confirma. Puedes modificar o excluir filas antes de importar.
          </p>
          <form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_1fr_1fr_160px]">
            <select
              className="rounded border border-slate-700 bg-black px-3 py-2"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            >
              <option value="">Cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select
              className="rounded border border-slate-700 bg-black px-3 py-2"
              value={parserKey}
              onChange={(e) => setParserKey(e.target.value)}
              title="Deja automatico salvo que una cartola falle o se detecte mal."
            >
              <option value="">Parser automatico</option>
              {parsers.map((parser) => (
                <option key={parser.key} value={parser.key}>{parser.display_name}</option>
              ))}
            </select>
            <input
              className="rounded border border-slate-700 bg-black px-3 py-2"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            <button
              className="flex items-center justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black disabled:opacity-60"
              disabled={isBusy}
            >
              {isBusy ? <Loader2 className="animate-spin" /> : <Upload size={18} />}
              Preview
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Recomendado: usar automatico. Fuerza un parser solo si el banco se detecta mal o el preview no cuadra.
          </p>
          {message && (
            <p className="mt-4 rounded bg-black/40 px-3 py-2 text-sm text-slate-300">{message}</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Calidad de importación</p>
              <h2 className="mt-1 text-lg font-semibold">Cobertura por parser</h2>
            </div>
            <span className="text-sm text-slate-400">{qualityStats?.transaction_count ?? 0} movimientos importados</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Cartolas</p><p className="mt-1 text-2xl font-bold text-brand-300">{qualityStats?.statement_count ?? 0}</p></div>
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Movimientos</p><p className="mt-1 text-2xl font-bold text-emerald-300">{qualityStats?.transaction_count ?? 0}</p></div>
            <div className="rounded border border-slate-800 bg-black/30 p-3"><p className="text-[10px] uppercase tracking-widest text-slate-500">Parsers usados</p><p className="mt-1 text-2xl font-bold text-slate-100">{qualityStats?.by_parser.length ?? 0}</p></div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(qualityStats?.by_parser ?? []).map((item) => (
              <div key={item.parser} className="flex items-center justify-between rounded border border-slate-800 bg-black/20 px-3 py-2 text-sm">
                <span>{item.parser}</span>
                <span className="text-slate-400">{item.statements} cartola(s) · {item.transactions} mov.</span>
              </div>
            ))}
            {qualityStats?.by_parser.length === 0 ? <p className="text-sm text-slate-500">Aún no hay datos de calidad.</p> : null}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Previews pendientes</h2>
          {previews.length === 0 && (
            <p className="text-sm text-slate-500">No hay previews pendientes. Sube un PDF para comenzar.</p>
          )}
          {previews.map((preview) => (
            <StatementPreviewCard key={preview.id} preview={preview} onChanged={loadData} />
          ))}
        </section>

        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Historial</h2>
            <span className="text-xs text-slate-500">{statements.length} cartola(s)</span>
          </div>

          {statements.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { key: "processed", label: "Importadas", tone: "text-emerald-300" },
                { key: "pending", label: "Pendientes", tone: "text-amber-300" },
                { key: "error", label: "Con error", tone: "text-red-300" },
                { key: "cancelled", label: "Canceladas", tone: "text-slate-400" },
              ].map((c) => (
                <div key={c.key} className="rounded border border-slate-800 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">{c.label}</p>
                  <p className={`mt-1 text-xl font-bold ${c.tone}`}>{statusCounts[c.key] ?? 0}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 space-y-5">
            {byMonth.map(([month, items]) => (
              <div key={month}>
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">{month} · {items.length}</p>
                <div className="space-y-2">
                  {items.map((s) => (
                    <Link key={s.id} href={`/statements/${s.id}`} className="block rounded border border-slate-800 bg-black/30 p-4 hover:border-brand-500/50 hover:bg-white/5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="break-all font-medium">{s.filename}</span>
                        <span className="text-sm text-slate-400">
                          {s.status}
                          {s.period_start && s.period_end ? ` · ${s.period_start} → ${s.period_end}` : ""}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-slate-500">{s.bank_detected ? `Banco: ${s.bank_detected}` : ""}</span>
                        <button
                          className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600"
                          onClick={(e) => { e.preventDefault(); void reprocess(s.id); }}
                        >
                          Reprocesar
                        </button>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {statements.length === 0 && (
              <p className="text-sm text-slate-500">No hay cartolas importadas.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
