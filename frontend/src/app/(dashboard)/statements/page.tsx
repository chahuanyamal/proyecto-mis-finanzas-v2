"use client";

import { accountsApi, statementsApi } from "@/lib/api";
import type { Account, StatementUpload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function StatementsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<StatementUpload[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/statements"); }, [hasVerified, router, user]);

  async function loadData() {
    const [accountsResponse, statementsResponse] = await Promise.all([accountsApi.list(), statementsApi.list()]);
    setAccounts(accountsResponse.data);
    setStatements(statementsResponse.data);
    if (!accountId && accountsResponse.data[0]) setAccountId(accountsResponse.data[0].id);
  }
  useEffect(() => { if (user) void loadData(); }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || !file) return;
    setIsUploading(true);
    setMessage("");
    try {
      const response = await statementsApi.upload(accountId, file);
      setMessage(`Importadas ${response.data.imported_transactions} transacciones.`);
      setFile(null);
      await loadData();
    } catch {
      setMessage("No se pudo subir o parsear el PDF.");
    } finally {
      setIsUploading(false);
    }
  }

  return <main className="min-h-screen bg-surface-950 p-8 text-slate-100"><div className="mx-auto max-w-5xl space-y-6"><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Cartolas</p><h1 className="mt-2 text-3xl font-bold">Upload PDF</h1><p className="mt-2 text-sm text-slate-400">Parser fallback básico: detecta líneas con fecha, descripción y monto.</p><form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_160px]"><select className="rounded border border-slate-700 bg-black px-3 py-2" value={accountId} onChange={(e) => setAccountId(e.target.value)} required><option value="">Cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><input className="rounded border border-slate-700 bg-black px-3 py-2" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /><button className="flex items-center justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black" disabled={isUploading}>{isUploading ? <Loader2 className="animate-spin" /> : <Upload size={18} />} Subir</button></form>{message ? <p className="mt-4 rounded bg-black/40 px-3 py-2 text-sm text-slate-300">{message}</p> : null}</section><section className="rounded-lg border border-slate-800 bg-surface-900 p-6"><h2 className="text-lg font-semibold">Historial</h2><div className="mt-4 space-y-3">{statements.map((statement) => <div key={statement.id} className="rounded border border-slate-800 bg-black/30 p-4"><div className="flex flex-wrap justify-between gap-3"><span className="font-medium">{statement.filename}</span><span className="text-sm text-slate-400">{statement.status} · {statement.bank_detected ?? "-"}</span></div><p className="mt-1 text-xs text-slate-500">Periodo: {statement.period_start ?? "?"} a {statement.period_end ?? "?"}</p></div>)}</div></section></div></main>;
}
