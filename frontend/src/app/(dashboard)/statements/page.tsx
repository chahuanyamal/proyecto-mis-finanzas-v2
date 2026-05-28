"use client";

import { accountsApi, statementsApi } from "@/lib/api";
import type { Account, StatementPreview, StatementUpload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function StatementsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<StatementUpload[]>([]);
  const [previews, setPreviews] = useState<StatementPreview[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/statements"); }, [hasVerified, router, user]);

  async function loadData() {
    const [accountsResponse, statementsResponse, previewsResponse] = await Promise.all([accountsApi.list(), statementsApi.list(), statementsApi.previews()]);
    setAccounts(accountsResponse.data);
    setStatements(statementsResponse.data);
    setPreviews(previewsResponse.data);
    if (!accountId && accountsResponse.data[0]) setAccountId(accountsResponse.data[0].id);
  }
  useEffect(() => { if (user) void loadData(); }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || !file) return;
    setIsBusy(true);
    setMessage("");
    try {
      const response = await statementsApi.preview(accountId, file);
      setMessage(`Preview creado con ${response.data.rows.length} transacciones detectadas.`);
      setFile(null);
      await loadData();
    } catch {
      setMessage("No se pudo generar preview del PDF.");
    } finally {
      setIsBusy(false);
    }
  }

  async function confirm(id: string) {
    setIsBusy(true);
    try { const res = await statementsApi.confirm(id); setMessage(`Importadas ${res.data.imported_transactions} transacciones.`); await loadData(); }
    finally { setIsBusy(false); }
  }
  async function cancel(id: string) { await statementsApi.cancel(id); await loadData(); }
  async function reprocess(id: string) { const res = await statementsApi.reprocess(id); setMessage(`Reprocesadas ${res.data.imported_transactions} transacciones.`); await loadData(); }

  return <main className="min-h-screen bg-surface-950 p-8 text-slate-100"><div className="mx-auto max-w-6xl space-y-6"><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Cartolas</p><h1 className="mt-2 text-3xl font-bold">Preview PDF</h1><p className="mt-2 text-sm text-slate-400">Sube, revisa el preview y confirma para importar.</p><form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_160px]"><select className="rounded border border-slate-700 bg-black px-3 py-2" value={accountId} onChange={(e) => setAccountId(e.target.value)} required><option value="">Cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><input className="rounded border border-slate-700 bg-black px-3 py-2" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /><button className="flex items-center justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black" disabled={isBusy}>{isBusy ? <Loader2 className="animate-spin" /> : <Upload size={18} />} Preview</button></form>{message ? <p className="mt-4 rounded bg-black/40 px-3 py-2 text-sm text-slate-300">{message}</p> : null}</section><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><h2 className="text-lg font-semibold">Previews pendientes</h2><div className="mt-4 space-y-3">{previews.map((preview) => <div key={preview.id} className="rounded border border-slate-800 bg-black/30 p-4"><div className="flex flex-wrap justify-between gap-3"><span className="font-medium">{preview.filename}</span><span className="text-sm text-slate-400">{preview.rows.length} filas</span></div><div className="mt-3 max-h-48 overflow-auto text-xs text-slate-300">{preview.rows.slice(0, 10).map((row, index) => <p key={`${preview.id}-${index}`}>{row.date} · {row.description} · {row.amount} · {row.movement_type}</p>)}</div><div className="mt-4 flex gap-3"><button onClick={() => void confirm(preview.id)} className="rounded bg-brand-500 px-3 py-2 text-sm font-semibold text-black">Confirmar</button><button onClick={() => void cancel(preview.id)} className="rounded border border-slate-700 px-3 py-2 text-sm">Cancelar</button></div></div>)}</div></section><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><h2 className="text-lg font-semibold">Historial importado</h2><div className="mt-4 space-y-3">{statements.map((statement) => <div key={statement.id} className="rounded border border-slate-800 bg-black/30 p-4"><div className="flex flex-wrap justify-between gap-3"><span className="font-medium">{statement.filename}</span><span className="text-sm text-slate-400">{statement.status} · {statement.bank_detected ?? "-"}</span></div><p className="mt-1 text-xs text-slate-500">Periodo: {statement.period_start ?? "?"} a {statement.period_end ?? "?"}</p><button onClick={() => void reprocess(statement.id)} className="mt-3 rounded border border-slate-700 px-3 py-2 text-sm">Reprocesar</button></div>)}</div></section></div></main>;
}
