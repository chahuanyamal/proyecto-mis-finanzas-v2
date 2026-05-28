"use client";

import { accountsApi, statementsApi } from "@/lib/api";
import type { Account, StatementUpload } from "@/lib/api-types";
import type { StatementPreview } from "@/lib/api-types";
import StatementPreviewCard from "@/components/statements/StatementPreviewCard";
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
    const [acc, st, pr] = await Promise.all([
      accountsApi.list(),
      statementsApi.list(),
      statementsApi.previews(),
    ]);
    setAccounts(acc.data);
    setStatements(st.data);
    setPreviews(pr.data);
    if (!accountId && acc.data[0]) setAccountId(acc.data[0].id);
  }
  useEffect(() => { if (user) void loadData(); }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || !file) return;
    setIsBusy(true);
    setMessage("");
    try {
      const response = await statementsApi.preview(accountId, file);
      const rows = response.data.rows.length;
      const bank = response.data.bank_detected ?? "desconocido";
      setMessage(`Preview creado: ${rows} transacciones detectadas (banco: ${bank}).`);
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

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Cartolas</p>
          <h1 className="mt-2 text-3xl font-bold">Preview PDF</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sube, revisa, edita y confirma. Puedes modificar o excluir filas antes de importar.
          </p>
          <form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_160px]">
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
          {message && (
            <p className="mt-4 rounded bg-black/40 px-3 py-2 text-sm text-slate-300">{message}</p>
          )}
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
          <h2 className="text-lg font-semibold">Historial</h2>
          <div className="mt-4 space-y-3">
            {statements.map((s) => (
              <div key={s.id} className="rounded border border-slate-800 bg-black/30 p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="font-medium">{s.filename}</span>
                  <span className="text-sm text-slate-400">
                    {s.status}
                    {s.period_start && s.period_end
                      ? ` · ${s.period_start} → ${s.period_end}`
                      : ""}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {s.bank_detected ? `Banco: ${s.bank_detected}` : ""}
                </div>
                <div className="mt-3">
                  <button
                    className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-600"
                    onClick={() => reprocess(s.id)}
                  >
                    Reprocesar
                  </button>
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
