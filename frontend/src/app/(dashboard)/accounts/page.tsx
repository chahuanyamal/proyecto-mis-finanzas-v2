"use client";

import { accountsApi, patrimonioApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { Account, AccountPayload, Institution, PatrimonioAccountTrend } from "@/lib/api-types";
import { asNumber, formatMoney, plain, initials, compactMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

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

const toneStyles: Record<string, { background: string; color: string }> = {
  green: { background: "rgba(94,233,181,0.12)", color: "var(--acc)" },
  red: { background: "rgba(232,122,91,0.12)", color: "var(--rust)" },
  gold: { background: "rgba(230,184,92,0.12)", color: "var(--gold)" },
  violet: { background: "rgba(180,156,255,0.12)", color: "var(--violet)" },
  neutral: { background: "var(--bg-3)", color: "var(--text-2)" },
};

type AccountTrend = PatrimonioAccountTrend["accounts"][number];

// Bank logo palette mirrors the design's `.bank-pill .logo` tones.
function bankLogoStyle(name: string): { background: string; color: string } {
  const n = name.toLowerCase();
  if (n.includes("estado")) return { background: "#FFD100", color: "#000" };
  if (n.includes("chile")) return { background: "#003DA5", color: "#fff" };
  if (n.includes("itaú") || n.includes("itau")) return { background: "#EC7000", color: "#fff" };
  if (n.includes("falabella")) return { background: "#00A859", color: "#fff" };
  if (n.includes("fintual")) return { background: "#7C3AED", color: "#fff" };
  if (n.includes("manual") || n.includes("efectivo")) {
    return { background: "var(--bg-3)", color: "var(--text-3)" };
  }
  return { background: "var(--bg-3)", color: "var(--text-3)" };
}

function Sparkline({ trend }: { trend: AccountTrend }) {
  const points = trend.points;
  const delta = Number(trend.delta ?? 0);
  const negative = delta < 0;
  const color = negative ? "#E87A5B" : "#5EE9B5";
  if (!points || points.length < 2) {
    return <svg className="spark block h-10 w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" />;
  }
  const values = points.map((p) => Number(p.balance ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 40;
  const last = values.length - 1;
  let lastX = 0;
  let lastY = 0;
  const coords = values
    .map((v, i) => {
      const x = (i / last) * w;
      const y = 4 + (1 - (v - min) / range) * (h - 8);
      if (i === last) {
        lastX = x;
        lastY = y;
      }
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="spark block h-10 w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r={2} fill={color} />
    </svg>
  );
}

export default function AccountsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AccountPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | Account["account_type"]>("all");

  const accountsData = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const [accountsResponse, institutionsResponse, trendResponse] = await Promise.all([
        accountsApi.list(),
        accountsApi.institutions(),
        patrimonioApi.accountTrend(12).catch(() => null),
      ]);
      return {
        accounts: accountsResponse.data,
        institutions: institutionsResponse.data,
        accountTrends: trendResponse?.data.accounts ?? [],
      };
    },
    enabled: Boolean(user),
  });

  const accounts = useMemo<Account[]>(() => accountsData.data?.accounts ?? [], [accountsData.data]);
  const institutions = useMemo<Institution[]>(() => accountsData.data?.institutions ?? [], [accountsData.data]);
  const accountTrends = useMemo<AccountTrend[]>(() => accountsData.data?.accountTrends ?? [], [accountsData.data]);
  const isLoading = accountsData.isPending;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["nav-count", "accounts"] });
  }

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

  const saveMutation = useMutation({
    mutationFn: (payload: AccountPayload) =>
      editingId ? accountsApi.update(editingId, payload) : accountsApi.create(payload),
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });
  const isSaving = saveMutation.isPending;

  const removeMutation = useMutation({
    mutationFn: (id: string) => accountsApi.remove(id),
    onSuccess: (_data, id) => {
      if (editingId === id) resetForm();
      invalidate();
    },
  });

  const error = saveMutation.isError
    ? "No se pudo guardar la cuenta."
    : removeMutation.isError
      ? "No se pudo eliminar la cuenta."
      : accountsData.isError
        ? "No se pudieron cargar las cuentas."
        : "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({ ...form, institution_id: form.institution_id || null });
  }

  function deleteAccount(id: string) {
    removeMutation.mutate(id);
  }

  // ── Grouping & derived metrics ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter !== "all" && a.account_type !== typeFilter) return false;
      if (!q) return true;
      const bank = a.institution?.name?.toLowerCase() ?? "";
      return a.name.toLowerCase().includes(q) || bank.includes(q);
    });
  }, [accounts, query, typeFilter]);

  const assets = useMemo(
    () => filtered.filter((a) => a.account_type !== "credit"),
    [filtered],
  );
  const liabilities = useMemo(
    () => filtered.filter((a) => a.account_type === "credit"),
    [filtered],
  );

  const typeCounts = useMemo(() => {
    const c = { all: accounts.length, checking: 0, credit: 0, savings: 0, cash: 0 };
    for (const a of accounts) c[a.account_type] += 1;
    return c;
  }, [accounts]);

  const bankNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of accounts) if (a.institution?.name) names.add(a.institution.name);
    return Array.from(names);
  }, [accounts]);

  // Section-head totals follow the visible (filtered) rows.
  const assetsTotal = assets.reduce((sum, a) => sum + asNumber(a.balance), 0);
  const liabilitiesTotal = liabilities.reduce((sum, a) => sum + asNumber(a.balance), 0);
  // KPI totals always reflect the full portfolio.
  const allAssetsTotal = accounts
    .filter((a) => a.account_type !== "credit")
    .reduce((sum, a) => sum + asNumber(a.balance), 0);
  const allLiabilitiesTotal = accounts
    .filter((a) => a.account_type === "credit")
    .reduce((sum, a) => sum + asNumber(a.balance), 0);
  const netWorth = accounts.reduce((sum, a) => sum + asNumber(a.balance), 0);
  const bankCount = new Set(
    accounts.map((a) => a.institution_id).filter((id): id is string => Boolean(id)),
  ).size;

  const trendMap = useMemo(() => {
    const map = new Map<string, AccountTrend>();
    for (const t of accountTrends) map.set(t.id, t);
    return map;
  }, [accountTrends]);

  // Matches the design's 7-column accounts grid.
  const GRID = {
    display: "grid",
    gridTemplateColumns: "46px 1fr 200px 160px 160px 80px 32px",
    gap: 14,
    alignItems: "center",
  } as const;

  function Row({ account }: { account: Account }) {
    const tone = typeTone[account.account_type];
    const balance = asNumber(account.balance);
    const pct = netWorth !== 0 ? Math.abs((balance / netWorth) * 100) : 0;
    const negative = balance < 0;
    const trend = trendMap.get(account.id);
    const bankName = account.institution?.name ?? "Manual";
    const delta = trend ? Number(trend.delta ?? 0) : 0;
    const deltaUp = delta >= 0;
    return (
      <div
        className="tbl-row-acc cursor-pointer border-b border-[color:var(--line-2)] px-4 py-3.5 last:border-0 hover:bg-[color:var(--bg-3)]"
        style={GRID}
        onClick={() => editAccount(account)}
      >
        <div
          className="grid h-[46px] w-[46px] place-items-center rounded-[10px] font-mono text-[13px] font-semibold tracking-[-0.02em]"
          style={toneStyles[tone]}
        >
          {initials(account.name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate text-[14px] font-medium tracking-[-0.005em] text-[color:var(--text)]">
            {account.name}
          </div>
          <div className="mt-[3px] font-mono text-[11px] uppercase tracking-[0.04em] text-[color:var(--text-3)]">
            {typeLabels[account.account_type]} · {account.currency}
          </div>
        </div>
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-[6px] border border-[color:var(--line)] bg-[color:var(--bg-3)] px-3 py-[5px] text-[12px] text-[color:var(--text-2)]"
          >
            <span
              className="grid h-[18px] w-[18px] place-items-center rounded-[4px] font-mono text-[9px] font-bold"
              style={bankLogoStyle(bankName)}
            >
              {bankName.charAt(0).toUpperCase()}
            </span>
            {bankName}
          </span>
        </div>
        <div
          className="text-right font-mono text-[16px] font-medium tabular-nums"
          style={{ color: negative ? "var(--rust)" : undefined }}
        >
          {formatMoney(balance, account.currency)}
          {trend ? (
            <span
              className="mt-[3px] block text-[11px] font-normal tracking-[0.02em]"
              style={{ color: deltaUp ? "var(--acc)" : "var(--rust)" }}
            >
              {compactMoney(delta)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Sparkline trend={trend ?? ({ points: [] } as unknown as AccountTrend)} />
          {trend ? (
            <span
              className="font-mono text-[11px]"
              style={{ color: deltaUp ? "var(--acc)" : "var(--rust)" }}
            >
              {deltaUp ? "▲ " : "▼ "}
              {compactMoney(delta)}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-[color:var(--text-3)]">−</span>
          )}
        </div>
        <div
          className="text-right font-mono text-[13px] font-medium tabular-nums"
          style={{ color: negative ? "var(--rust)" : "var(--text-2)" }}
        >
          {negative ? "−" : ""}
          {pct.toFixed(1).replace(".", ",")}%
          <span
            className="mt-1 block h-[2px] overflow-hidden rounded-[1px]"
            style={{ background: "var(--bg-3)" }}
          >
            <span
              className="block h-full rounded-[1px]"
              style={{ width: `${Math.min(pct, 100)}%`, background: negative ? "var(--rust)" : "var(--acc)" }}
            />
          </span>
        </div>
        <div className="flex justify-end text-[color:var(--text-3)]" onClick={(e) => e.stopPropagation()}>
          <ConfirmButton
            title="Eliminar cuenta"
            description="Esta acción eliminará la cuenta si no tiene dependencias activas."
            confirmLabel="Eliminar"
            onConfirm={() => deleteAccount(account.id)}
            className="text-[color:var(--text-3)] hover:text-[color:var(--rust)]"
          >
            ⋯
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
            <span className="pos">{plain(allAssetsTotal)}</span>
          </div>
          <div className="sub">
            {accounts.filter((a) => a.account_type !== "credit").length} cuentas · {bankCount} bancos
          </div>
        </div>
        <div className="kpi r">
          <div className="lbl">
            <span className="sw" />
            Pasivos
          </div>
          <div className="val">
            <span className="cu">CLP</span>
            <span className="neg">{plain(allLiabilitiesTotal)}</span>
          </div>
          <div className="sub">
            {accounts.filter((a) => a.account_type === "credit").length} tarjetas
          </div>
        </div>
        <div className="kpi on">
          <div className="lbl">
            <span className="sw" />
            Patrimonio neto
          </div>
          <div className="val">
            <span className="cu">CLP</span>
            <span className={netWorth >= 0 ? "pos" : "neg"}>
              {plain(netWorth)}
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
          <div className="sub">{bankNames.length > 0 ? bankNames.join(" · ") : "sin banco"}</div>
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

      {/* Filters */}
      {!isLoading && accounts.length > 0 ? (
        <div className="filters">
          <div className="filt-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              placeholder="Buscar por nombre o banco…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="seg" style={{ marginLeft: "auto" }}>
            <button className={typeFilter === "all" ? "on" : ""} onClick={() => setTypeFilter("all")}>
              Todas · {typeCounts.all}
            </button>
            <button className={typeFilter === "checking" ? "on" : ""} onClick={() => setTypeFilter("checking")}>
              Corrientes · {typeCounts.checking}
            </button>
            <button className={typeFilter === "credit" ? "on" : ""} onClick={() => setTypeFilter("credit")}>
              Crédito · {typeCounts.credit}
            </button>
            <button className={typeFilter === "savings" ? "on" : ""} onClick={() => setTypeFilter("savings")}>
              Ahorro · {typeCounts.savings}
            </button>
            <button className={typeFilter === "cash" ? "on" : ""} onClick={() => setTypeFilter("cash")}>
              Efectivo · {typeCounts.cash}
            </button>
          </div>
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
          <div
            className="tbl-head font-mono"
            style={{ ...GRID, padding: "11px 16px" }}
          >
            <div />
            <div>Cuenta</div>
            <div>Banco</div>
            <div className="r">Saldo</div>
            <div className="r">Tendencia · 30d</div>
            <div className="r">% patr.</div>
            <div />
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
