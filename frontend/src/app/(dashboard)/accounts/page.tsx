"use client";

import { accountsApi } from "@/lib/api";
import type { Account, AccountPayload, Institution } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const emptyForm: AccountPayload = {
  name: "",
  account_type: "checking",
  currency: "CLP",
  balance: "0",
  institution_id: null,
};

const accountTypes: Array<{ value: AccountPayload["account_type"]; label: string }> = [
  { value: "checking", label: "Cuenta corriente" },
  { value: "credit", label: "Tarjeta crédito" },
  { value: "savings", label: "Ahorro" },
  { value: "cash", label: "Efectivo" },
];

export default function AccountsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [form, setForm] = useState<AccountPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasVerified) {
      void fetchMe();
    }
  }, [fetchMe, hasVerified]);

  useEffect(() => {
    if (hasVerified && !user) {
      router.replace("/login?next=/accounts");
    }
  }, [hasVerified, router, user]);

  async function loadData() {
    setIsLoading(true);
    setError("");
    try {
      const [accountsResponse, institutionsResponse] = await Promise.all([
        accountsApi.list(),
        accountsApi.institutions(),
      ]);
      setAccounts(accountsResponse.data);
      setInstitutions(institutionsResponse.data);
    } catch {
      setError("No se pudieron cargar las cuentas.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function editAccount(account: Account) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      account_type: account.account_type,
      currency: account.currency,
      balance: account.balance,
      institution_id: account.institution_id,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        institution_id: form.institution_id || null,
      };
      if (editingId) {
        await accountsApi.update(editingId, payload);
      } else {
        await accountsApi.create(payload);
      }
      resetForm();
      await loadData();
    } catch {
      setError("No se pudo guardar la cuenta.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAccount(id: string) {
    if (!confirm("¿Eliminar esta cuenta?")) return;
    setError("");
    try {
      await accountsApi.remove(id);
      await loadData();
      if (editingId === id) resetForm();
    } catch {
      setError("No se pudo eliminar la cuenta.");
    }
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Cuentas</p>
              <h1 className="mt-2 text-3xl font-bold">Mis cuentas</h1>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded border border-slate-700 px-3 py-2 text-sm hover:border-brand-400 hover:text-brand-300"
            >
              Dashboard
            </button>
          </div>

          {error ? <p className="mt-5 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}

          {isLoading ? (
            <div className="mt-10 flex items-center gap-2 text-slate-400">
              <Loader2 className="animate-spin" size={18} /> Cargando cuentas...
            </div>
          ) : accounts.length === 0 ? (
            <div className="mt-10 rounded border border-dashed border-slate-700 p-8 text-center text-slate-400">
              Aún no hay cuentas. Crea la primera desde el formulario.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/50 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Banco</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-slate-100">{account.name}</td>
                      <td className="px-4 py-3 text-slate-300">{account.account_type}</td>
                      <td className="px-4 py-3 text-slate-300">{account.institution?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-right text-slate-100">
                        {account.currency} {account.balance}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => editAccount(account)}
                          className="mr-3 text-brand-300 hover:text-brand-200"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteAccount(account.id)}
                          className="text-red-300 hover:text-red-200"
                          aria-label={`Eliminar ${account.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-brand-400" />
            <h2 className="text-lg font-semibold">{editingId ? "Editar cuenta" : "Nueva cuenta"}</h2>
          </div>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm text-slate-300">
              Nombre
              <input
                value={form.name}
                onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                className="mt-2 w-full rounded border border-slate-700 bg-black px-3 py-2 text-slate-50 outline-none focus:border-brand-400"
                required
              />
            </label>

            <label className="block text-sm text-slate-300">
              Institución
              <select
                value={form.institution_id ?? ""}
                onChange={(event) => setForm((value) => ({ ...value, institution_id: event.target.value || null }))}
                className="mt-2 w-full rounded border border-slate-700 bg-black px-3 py-2 text-slate-50 outline-none focus:border-brand-400"
              >
                <option value="">Sin institución</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Tipo
              <select
                value={form.account_type}
                onChange={(event) =>
                  setForm((value) => ({ ...value, account_type: event.target.value as AccountPayload["account_type"] }))
                }
                className="mt-2 w-full rounded border border-slate-700 bg-black px-3 py-2 text-slate-50 outline-none focus:border-brand-400"
              >
                {accountTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-slate-300">
                Moneda
                <select
                  value={form.currency}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, currency: event.target.value as AccountPayload["currency"] }))
                  }
                  className="mt-2 w-full rounded border border-slate-700 bg-black px-3 py-2 text-slate-50 outline-none focus:border-brand-400"
                >
                  <option value="CLP">CLP</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              <label className="block text-sm text-slate-300">
                Saldo
                <input
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={(event) => setForm((value) => ({ ...value, balance: event.target.value }))}
                  className="mt-2 w-full rounded border border-slate-700 bg-black px-3 py-2 text-slate-50 outline-none focus:border-brand-400"
                  required
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black hover:bg-brand-400 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {editingId ? "Guardar cambios" : "Crear cuenta"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="w-full rounded border border-slate-700 px-4 py-2 text-sm hover:border-brand-400 hover:text-brand-300"
              >
                Cancelar edición
              </button>
            ) : null}
          </form>
        </aside>
      </div>
    </main>
  );
}
