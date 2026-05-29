"use client";

import { accountsApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { Account, AccountPayload, Institution } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

const typeLabels: Record<Account["account_type"], string> = {
  checking: "Cuenta corriente",
  credit: "Tarjeta crédito",
  savings: "Ahorro",
  cash: "Efectivo",
};

// Tone per account type → reuses the acc-mark color palette of the design.
const typeTone: Record<Account["account_type"], string> = {
  checking: "green",
  savings: "green",
  cash: "neutral",
  credit: "red",
};

function asNumber(value: string | null | undefined): number {
  return Number(value ?? 0);
}

function formatMoney(value: string | number, currency = "CLP"): string {
  const n = typeof value === "number" ? value : asNumber(value);
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(n);
}

function initials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "··";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const toneStyles: Record<string, { background: string; color: string }> = {
  green: { background: "rgba(94,233,181,0.12)", color: "var(--acc)" },
  red: { background: "rgba(232,122,91,0.12)", color: "var(--rust)" },
  gold: { background: "rgba(230,184,92,0.12)", color: "var(--gold)" },
  violet: { background: "rgba(180,156,255,0.12)", color: "var(--violet)" },
  neutral: { background: "var(--bg-3)", color: "var(--text-2)" },
};

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
  const [showForm, setShowForm] = useState(false);

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
    setShowForm(false);
  }

  function newAccount() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
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
    setShowForm(true);
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
    setError("");
    try {
      await accountsApi.remove(id);
      await loadData();
      if (editingId === id) resetForm();
    } catch {
      setError("No se pudo eliminar la cuenta.");
    }
  }

  // ── Grouping & derived metrics ─────────────────────────────────────────
  const assets = useMemo(
    () => accounts.filter((a) => a.account_type !== "credit"),
    [accounts],
  );
  const liabilities = useMemo(
    () => accounts.filter((a) => a.account_type === "credit"),
    [accounts],
  );

  const assetsTotal = assets.reduce((sum, a) => sum + asNumber(a.balance), 0);
  const liabilitiesTotal = liabilities.reduce((sum, a) => sum + asNumber(a.balance), 0);
  const netWorth = accounts.reduce((sum, a) => sum + asNumber(a.balance), 0);
  const bankCount = new Set(
    accounts.map((a) => a.institution_id).filter((id): id is string => Boolean(id)),
  ).size;

  const GRID = "grid grid-cols-[46px_1fr_200px_160px] gap-3.5 items-center";

  function Row({ account }: { account: Account }) {
    const tone = typeTone[account.account_type];
    const balance = asNumber(account.balance);
    const pct = netWorth !== 0 ? Math.abs((balance / netWorth) * 100) : 0;
    const negative = balance < 0;
    return (
      <div
        className={`${GRID} cursor-pointer border-b border-[color:var(--line-2)] px-4 py-3.5 last:border-0 hover:bg-[color:var(--bg-3)]`}
        onClick={() => editAccount(account)}
      >
        <div
          className="grid h-[46px] w-[46px] place-items-center rounded-[10px] font-mono text-[13px] font-semibold"
          style={toneStyles[tone]}
        >
          {initials(account.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-[color:var(--text)]">{account.name}</div>
          <div className="mt-[3px] font-mono text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)]">
            {typeLabels[account.account_type]} · {account.currency}
          </div>
        </div>
        <div>
          <span className="chip">
            <span className="sw" />
            {account.institution?.name ?? "Manual"}
          </span>
        </div>
        <div
          className="flex items-center justify-end gap-3 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`font-mono text-[16px] font-medium num ${negative ? "text-[color:var(--rust)]" : "text-[color:var(--text)]"}`}>
            {formatMoney(balance, account.currency)}
            <span className="mt-[3px] block font-normal text-[11px] text-[color:var(--text-3)]">
              {pct.toFixed(1)}% patr.
            </span>
          </div>
          <ConfirmButton
            title="Eliminar cuenta"
            description="Esta acción eliminará la cuenta si no tiene dependencias activas."
            confirmLabel="Eliminar"
            onConfirm={() => deleteAccount(account.id)}
            className="text-[color:var(--text-3)] hover:text-[color:var(--rust)]"
          >
            ✕
          </ConfirmButton>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Tus <span className="serif">cuentas</span>
          </h1>
          <div className="sub">
            {accounts.length} cuentas · {bankCount} {bankCount === 1 ? "banco" : "bancos"} · patrimonio neto{" "}
            <strong style={{ color: netWorth >= 0 ? "var(--acc)" : "var(--rust)" }}>
              {netWorth >= 0 ? "+" : ""}
              {formatMoney(netWorth)}
            </strong>
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={newAccount}>
            + Nueva cuenta
          </button>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="txt">{error}</div>
          </div>
          <span />
        </div>
      ) : null}

      {/* KPI strip */}
      <section className="strip">
        <div className="kpi">
          <div className="lbl">
            <span className="sw" />
            Activos
          </div>
          <div className="val">
            <span className="cu">CLP</span>
            <span className="pos">{formatMoney(assetsTotal).replace(/[^\d.,\-]/g, "")}</span>
          </div>
          <div className="sub">{assets.length} cuentas</div>
        </div>
        <div className="kpi r">
          <div className="lbl">
            <span className="sw" />
            Pasivos
          </div>
          <div className="val">
            <span className="cu">CLP</span>
            <span className="neg">{formatMoney(liabilitiesTotal).replace(/[^\d.,\-]/g, "")}</span>
          </div>
          <div className="sub">{liabilities.length} tarjetas</div>
        </div>
        <div className="kpi on">
          <div className="lbl">
            <span className="sw" />
            Patrimonio neto
          </div>
          <div className="val">
            <span className="cu">CLP</span>
            <span className={netWorth >= 0 ? "pos" : "neg"}>
              {formatMoney(netWorth).replace(/[^\d.,\-]/g, "")}
            </span>
          </div>
          <div className="sub">activos − pasivos</div>
        </div>
        <div className="kpi g">
          <div className="lbl">
            <span className="sw" />
            Bancos · tipos
          </div>
          <div className="val num">
            {bankCount} · {new Set(accounts.map((a) => a.account_type)).size}
          </div>
          <div className="sub">{institutions.length} instituciones disponibles</div>
        </div>
      </section>

      {/* Form */}
      {showForm ? (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <h3>{editingId ? "Editar cuenta" : "Nueva cuenta"}</h3>
            <button className="meta" style={{ cursor: "pointer" }} onClick={resetForm}>
              cerrar ✕
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Institución</label>
              <select
                className="input"
                value={form.institution_id ?? ""}
                onChange={(event) => setForm((value) => ({ ...value, institution_id: event.target.value || null }))}
              >
                <option value="">Sin institución</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Tipo</label>
              <select
                className="input"
                value={form.account_type}
                onChange={(event) =>
                  setForm((value) => ({ ...value, account_type: event.target.value as AccountPayload["account_type"] }))
                }
              >
                {accountTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Moneda</label>
              <select
                className="input"
                value={form.currency}
                onChange={(event) =>
                  setForm((value) => ({ ...value, currency: event.target.value as AccountPayload["currency"] }))
                }
              >
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Saldo</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(event) => setForm((value) => ({ ...value, balance: event.target.value }))}
                required
              />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn primary" disabled={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : null}
                {editingId ? "Guardar cambios" : "Crear cuenta"}
              </button>
              <button type="button" className="btn ghost" onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Accounts table */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 font-mono text-[13px] text-[color:var(--text-3)]">
          <Loader2 className="animate-spin" size={18} /> Cargando cuentas…
        </div>
      ) : accounts.length === 0 ? (
        <div className="tbl">
          <div className="empty">
            <div className="empty-mark">∅</div>
            <h4>Aún no hay cuentas</h4>
            <p>Crea la primera para empezar a registrar tus movimientos.</p>
            <button className="btn primary" onClick={newAccount}>
              + Nueva cuenta
            </button>
          </div>
        </div>
      ) : (
        <div className="tbl">
          <div className={`${GRID} tbl-head`}>
            <div />
            <div>Cuenta</div>
            <div>Banco</div>
            <div className="r">Saldo · % patr.</div>
          </div>

          {assets.length > 0 ? (
            <>
              <div className="bg-[color:var(--bg)] px-4 pb-2 pt-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
                ● Activos · {assets.length} cuentas · {formatMoney(assetsTotal)}
              </div>
              {assets.map((account) => (
                <Row key={account.id} account={account} />
              ))}
            </>
          ) : null}

          {liabilities.length > 0 ? (
            <>
              <div className="bg-[color:var(--bg)] px-4 pb-2 pt-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
                ● Pasivos · {liabilities.length} tarjetas · {formatMoney(liabilitiesTotal)}
              </div>
              {liabilities.map((account) => (
                <Row key={account.id} account={account} />
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
