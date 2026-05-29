"use client";

import { dashboardApi } from "@/lib/api";
import type { DashboardPeriod, DashboardSummary, DashboardTrends } from "@/lib/api-types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const PERIODS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "mtd", label: "Mes" },
  { value: "30d", label: "30d" },
  { value: "ytd", label: "Año" },
  { value: "12m", label: "12m" },
];

const CAT_TONES = ["", "r", "g", "v", "b"] as const;

function asNumber(value: string | null | undefined): number {
  return Number(value ?? 0);
}

function formatMoney(value: string | number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(typeof value === "number" ? value : asNumber(value));
}

function formatPercent(value: string | null): string {
  if (value === null) return "sin base";
  const number = asNumber(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<DashboardPeriod>("mtd");
  const [currency, setCurrency] = useState("CLP");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [summaryResponse, trendsResponse] = await Promise.all([
          dashboardApi.summary(period, currency),
          dashboardApi.trends(12, currency),
        ]);
        if (!cancelled) {
          setSummary(summaryResponse.data);
          setTrends(trendsResponse.data);
        }
      } catch {
        if (!cancelled) setError("No se pudo cargar el tablero.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [currency, period]);

  const cur = (v: string | number) => formatMoney(v, currency);
  const net = asNumber(summary?.net);
  const topCategoryTotal = Math.max(1, ...(summary?.category_expenses ?? []).map((i) => asNumber(i.amount)));

  // ── Flow chart geometry ──────────────────────────────────────────────
  const trendData = trends?.trends ?? [];
  const flowMax = Math.max(
    1,
    ...trendData.flatMap((t) => [asNumber(t.income), asNumber(t.expenses)]),
  );
  const PL = 8;
  const PR = 600;
  const PB = 240;
  const H = PB;
  const stepW = trendData.length ? (PR - PL) / trendData.length : 0;
  const barW = stepW * 0.32;
  const netPoints = trendData.map((t, i) => {
    const cx = PL + stepW * i + stepW / 2;
    const value = asNumber(t.net);
    const y = PB - Math.min(1, Math.max(-0.2, value / flowMax)) * H;
    return `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${Math.max(4, y).toFixed(1)}`;
  });

  return (
    <div className="content dash-section">
      {/* Title row */}
      <div className="title-row">
        <div>
          <h1>
            Tablero <span className="serif">financiero</span>
          </h1>
          <div className="sub">
            {summary ? (
              <>
                {summary.date_from} <span className="light">→</span> {summary.date_to}
              </>
            ) : (
              "Cargando periodo…"
            )}
          </div>
        </div>
        <div className="actions">
          <div className="seg">
            {PERIODS.map((p) => (
              <button key={p.value} className={period === p.value ? "on" : ""} onClick={() => setPeriod(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
          <button
            className="pill"
            onClick={() => setCurrency((c) => (c === "CLP" ? "USD" : "CLP"))}
          >
            {currency} ▾
          </button>
          <button className="btn primary" onClick={() => router.push("/transactions")}>
            + Movimiento
          </button>
        </div>
      </div>

      {error ? <div className="insight err" style={{ marginBottom: 20 }}><div className="insight-mark">!</div><div className="insight-body"><div className="txt">{error}</div></div><span /></div> : null}

      {/* Hero KPI strip */}
      <section className="strip">
        <div className="kpi">
          <div className="lbl">
            <span className="sw" />
            Ahorro neto
          </div>
          <div className="val big">
            <span className="cu">{currency}</span>
            <span className={net >= 0 ? "pos" : "neg"}>
              {net >= 0 ? "+" : ""}
              {isLoading ? "—" : cur(net).replace(/[^\d.,\-]/g, "")}
            </span>
          </div>
          <div className="delta">
            <span className={asNumber(summary?.net_change) >= 0 ? "up" : "dn"}>
              {asNumber(summary?.net_change) >= 0 ? "▲" : "▼"} {formatPercent(summary?.net_change ?? null)}
            </span>
            <span>vs. periodo previo</span>
          </div>
        </div>
        <div className="kpi">
          <div className="lbl">
            <span className="sw" />
            Ingresos
          </div>
          <div className="val">{isLoading ? "—" : cur(summary?.income ?? "0")}</div>
          <div className="delta">
            <span className={asNumber(summary?.income_change) >= 0 ? "up" : "dn"}>
              {asNumber(summary?.income_change) >= 0 ? "▲" : "▼"} {formatPercent(summary?.income_change ?? null)}
            </span>
          </div>
        </div>
        <div className="kpi r">
          <div className="lbl">
            <span className="sw" />
            Gastos
          </div>
          <div className="val">{isLoading ? "—" : cur(summary?.expenses ?? "0")}</div>
          <div className="delta">
            <span className={asNumber(summary?.expenses_change) <= 0 ? "up" : "dn"}>
              {asNumber(summary?.expenses_change) >= 0 ? "▲" : "▼"} {formatPercent(summary?.expenses_change ?? null)}
            </span>
          </div>
        </div>
        <div className="kpi g">
          <div className="lbl">
            <span className="sw" />
            Tasa de ahorro
          </div>
          <div className="val">{isLoading ? "—" : `${asNumber(summary?.savings_rate).toFixed(1)}%`}</div>
          <div className="delta">{summary?.uncategorized_count ?? 0} sin categoría</div>
        </div>
      </section>

      {/* Insight banner */}
      {summary && summary.uncategorized_count > 0 ? (
        <div className="insight">
          <div className="insight-mark serif">¶</div>
          <div className="insight-body">
            <div className="lbl">Por revisar</div>
            <div className="txt">
              Tienes <strong>{summary.uncategorized_count} movimientos sin categoría</strong> en este periodo.{" "}
              <span className="serif">Categorízalos para mejorar tus métricas.</span>
            </div>
          </div>
          <button className="btn ghost" onClick={() => router.push("/review")}>
            Revisar →
          </button>
        </div>
      ) : net > 0 ? (
        <div className="insight ok">
          <div className="insight-mark serif">✓</div>
          <div className="insight-body">
            <div className="lbl">Buen mes</div>
            <div className="txt">
              Cerraste con un <strong>ahorro positivo de {cur(net)}</strong>.{" "}
              <span className="serif">Sigue así.</span>
            </div>
          </div>
          <button className="btn ghost" onClick={() => router.push("/patrimonio")}>
            Ver patrimonio →
          </button>
        </div>
      ) : null}

      {/* Flow + Top categorías */}
      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]" style={{ marginBottom: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Flujo mensual</h3>
              <div className="mt-2 flex gap-4 font-mono text-[11px] text-[color:var(--text-3)]">
                <span className="flex items-center gap-2">
                  <span style={{ width: 10, height: 2, background: "var(--acc)" }} />
                  Ingresos
                </span>
                <span className="flex items-center gap-2">
                  <span style={{ width: 10, height: 2, background: "var(--rust)" }} />
                  Gastos
                </span>
                <span className="flex items-center gap-2">
                  <span style={{ width: 10, height: 2, background: "var(--text-3)" }} />
                  Neto
                </span>
              </div>
            </div>
            <span className="meta">12m</span>
          </div>
          <div style={{ height: 260 }}>
            <svg viewBox="0 0 600 260" preserveAspectRatio="none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
              <g stroke="rgba(255,255,255,0.05)">
                <line x1="0" y1="40" x2="600" y2="40" />
                <line x1="0" y1="100" x2="600" y2="100" />
                <line x1="0" y1="160" x2="600" y2="160" />
                <line x1="0" y1="220" x2="600" y2="220" />
              </g>
              {trendData.map((t, i) => {
                const cx = PL + stepW * i + stepW / 2;
                const incH = (asNumber(t.income) / flowMax) * H;
                const expH = (asNumber(t.expenses) / flowMax) * H;
                const last = i === trendData.length - 1;
                return (
                  <g key={t.month}>
                    <rect x={cx - barW - 1} y={PB - incH} width={barW} height={incH} fill="#5EE9B5" opacity={last ? 1 : 0.75} rx="1" />
                    <rect x={cx + 1} y={PB - expH} width={barW} height={expH} fill="#E87A5B" opacity={last ? 1 : 0.65} rx="1" />
                    <text x={cx} y={PB + 16} fill="#807A6E" fontFamily="var(--font-geist-mono)" fontSize="9" textAnchor="middle">
                      {t.month.slice(5)}
                    </text>
                  </g>
                );
              })}
              {netPoints.length > 1 ? (
                <path d={netPoints.join(" ")} fill="none" stroke="#807A6E" strokeWidth="1.4" strokeDasharray="3 3" />
              ) : null}
            </svg>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Dónde se fue · top 6</h3>
            <span className="meta">periodo</span>
          </div>
          <div className="flex flex-col gap-[13px]">
            {(summary?.category_expenses ?? []).slice(0, 6).map((c, i) => {
              const tone = CAT_TONES[i % CAT_TONES.length];
              const pct = (asNumber(c.amount) / topCategoryTotal) * 100;
              const totalExp = Math.max(1, asNumber(summary?.expenses));
              const sharePct = Math.round((asNumber(c.amount) / totalExp) * 100);
              return (
                <div key={c.category_id} className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1.5">
                  <div className={`cat-name flex items-center gap-2 text-[13px]`}>
                    <span
                      className="inline-block h-2 w-2 rounded-[2px]"
                      style={{ background: c.category_color || `var(--${tone === "r" ? "rust" : tone === "g" ? "gold" : tone === "v" ? "violet" : tone === "b" ? "blue" : "acc"})` }}
                    />
                    {c.category_name}
                  </div>
                  <div className="font-mono text-[13px] num text-right">
                    {cur(c.amount)} <span className="text-[10px] text-[color:var(--text-3)]">{sharePct}%</span>
                  </div>
                  <div className="col-span-2 h-[3px] overflow-hidden rounded-[2px]" style={{ background: "var(--bg-3)" }}>
                    <div
                      className="h-full rounded-[2px]"
                      style={{ width: `${Math.max(2, pct)}%`, background: c.category_color || "var(--acc)" }}
                    />
                  </div>
                </div>
              );
            })}
            {(summary?.category_expenses ?? []).length === 0 && !isLoading ? (
              <p className="font-mono text-[12px] text-[color:var(--text-3)]">Sin gastos categorizados.</p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Últimos movimientos */}
      <section className="panel">
        <div className="panel-head">
          <h3>Últimos movimientos</h3>
          <button className="meta" style={{ color: "var(--acc)", cursor: "pointer" }} onClick={() => router.push("/transactions")}>
            Ver todos →
          </button>
        </div>
        <div className="flex flex-col">
          <div className="grid grid-cols-[80px_1fr_180px_120px] gap-3.5 border-b border-[color:var(--line)] pb-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-3)]">
            <div>Fecha</div>
            <div>Descripción</div>
            <div>Categoría</div>
            <div className="text-right">Monto</div>
          </div>
          {(summary?.recent_transactions ?? []).map((tx) => (
            <button
              key={tx.id}
              onClick={() => router.push("/transactions")}
              className="grid grid-cols-[80px_1fr_180px_120px] items-center gap-3.5 border-b border-[color:var(--line-2)] py-3 text-left last:border-0 hover:bg-[color:var(--bg-3)]"
            >
              <div className="font-mono text-[11px] text-[color:var(--text-3)]">{tx.date.slice(5)}</div>
              <div className="min-w-0 truncate text-[13px] font-medium text-[color:var(--text)]">{tx.description}</div>
              <div>
                <span className="chip">
                  <span className="sw" style={tx.category_color ? { background: tx.category_color } : undefined} />
                  {tx.category_name ?? "Sin categoría"}
                </span>
              </div>
              <div
                className={`text-right font-mono text-[14px] num font-medium ${tx.movement_type === "income" ? "text-[color:var(--acc)]" : "text-[color:var(--text)]"}`}
              >
                {tx.movement_type === "income" ? "+" : "−"}
                {formatMoney(tx.amount, tx.currency).replace(/[^\d.,]/g, "")}
              </div>
            </button>
          ))}
          {(summary?.recent_transactions ?? []).length === 0 && !isLoading ? (
            <p className="py-6 font-mono text-[12px] text-[color:var(--text-3)]">Sin movimientos recientes.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
