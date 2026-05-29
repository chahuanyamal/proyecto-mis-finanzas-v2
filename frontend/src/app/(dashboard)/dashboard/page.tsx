"use client";

import { dashboardApi } from "@/lib/api";
import type { DashboardSummary, DashboardTrends } from "@/lib/api-types";
import { asNumber, formatMoney, plain, formatPercent, monthDayLabel, monthShortUpper, catColor } from "@/lib/format";
import { usePeriodStore } from "@/stores/period";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CHIP_TONES = ["", "r", "g", "b", "v", "k"] as const;

export default function DashboardPage() {
  const router = useRouter();
  const { period, currency } = usePeriodStore();
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
  const flowMax = Math.max(1, ...trendData.flatMap((t) => [asNumber(t.income), asNumber(t.expenses)]));
  const PL = 40;
  const PR = 600;
  const PB = 240;
  const H = PB;
  const stepW = trendData.length ? (PR - PL) / trendData.length : 0;
  const barW = stepW * 0.32;
  const netPoints = trendData.map((t, i) => {
    const cx = PL + stepW * i + stepW / 2;
    const value = asNumber(t.net);
    const y = PB - Math.min(1, Math.max(-0.2, value / flowMax)) * H * 6;
    return `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${Math.max(4, y).toFixed(1)}`;
  });

  // ── Income / expense sparkline geometry ──────────────────────────────
  const spark = (key: "income" | "expenses" | "net") => {
    if (trendData.length < 2) return "";
    const vals = trendData.map((t) => asNumber(t[key]));
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const span = mx - mn || 1;
    const w = 200;
    const stepX = w / (vals.length - 1);
    return vals
      .map((v, i) => `${(i * stepX).toFixed(1)},${(28 - ((v - mn) / span) * 24).toFixed(1)}`)
      .join(" ");
  };

  return (
    <div className="content dash-section">
      <style jsx>{`
        .move {
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.1s;
        }
        .move:hover {
          background: var(--bg-3);
          margin: 0 -10px;
          padding-left: 10px;
          padding-right: 10px;
        }
      `}</style>
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
          <button className="btn primary" onClick={() => router.push("/transactions")}>
            + Movimiento
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

      {/* Hero KPI strip — 1.5fr 1fr 1fr 1fr */}
      <section
        className="strip"
        style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr", marginBottom: 24 }}
      >
        <div
          className="kpi"
          style={{ padding: "22px 24px", background: "linear-gradient(160deg, var(--bg-3) 0%, var(--bg-2) 100%)" }}
        >
          <div className="lbl">
            <span className="sw" />
            Ahorro neto · {summary?.period.toString().toLowerCase() ?? "periodo"}
          </div>
          <div className="val big">
            <span className="cu">{currency}</span>
            <span className={net >= 0 ? "pos" : "neg"}>
              {net >= 0 ? "+" : "−"}
              {isLoading ? "—" : plain(Math.abs(net), currency)}
            </span>
          </div>
          <div className="delta">
            <span className={asNumber(summary?.net_change) >= 0 ? "up" : "dn"}>
              {asNumber(summary?.net_change) >= 0 ? "▲" : "▼"} {formatPercent(summary?.net_change ?? null)}
            </span>
            <span>vs. periodo previo · </span>
            <span>
              tasa <strong style={{ color: "var(--text)" }}>{asNumber(summary?.savings_rate).toFixed(1)}%</strong>
            </span>
          </div>
          <svg className="spark" viewBox="0 0 200 32" preserveAspectRatio="none" style={{ height: 32, marginTop: 6 }}>
            {spark("net") ? (
              <polyline fill="none" stroke="#5EE9B5" strokeWidth="1.5" points={spark("net")} />
            ) : null}
          </svg>
        </div>
        <div className="kpi" style={{ padding: "22px 24px" }}>
          <div className="lbl">
            <span className="sw" />
            Ingresos
          </div>
          <div className="val">
            <span className="cu">{currency}</span>
            {isLoading ? "—" : plain(summary?.income ?? "0", currency)}
          </div>
          <div className="delta">
            <span className={asNumber(summary?.income_change) >= 0 ? "up" : "dn"}>
              {asNumber(summary?.income_change) >= 0 ? "▲" : "▼"} {formatPercent(summary?.income_change ?? null)}
            </span>
          </div>
          <svg className="spark" viewBox="0 0 200 32" preserveAspectRatio="none" style={{ height: 32, marginTop: 6 }}>
            {spark("income") ? (
              <polyline fill="none" stroke="#5EE9B5" strokeWidth="1.3" opacity="0.7" points={spark("income")} />
            ) : null}
          </svg>
        </div>
        <div className="kpi r" style={{ padding: "22px 24px" }}>
          <div className="lbl">
            <span className="sw" />
            Gastos
          </div>
          <div className="val">
            <span className="cu">{currency}</span>
            {isLoading ? "—" : plain(summary?.expenses ?? "0", currency)}
          </div>
          <div className="delta">
            <span className={asNumber(summary?.expenses_change) <= 0 ? "up" : "dn"}>
              {asNumber(summary?.expenses_change) >= 0 ? "▲" : "▼"} {formatPercent(summary?.expenses_change ?? null)}
            </span>
          </div>
          <svg className="spark" viewBox="0 0 200 32" preserveAspectRatio="none" style={{ height: 32, marginTop: 6 }}>
            {spark("expenses") ? (
              <polyline fill="none" stroke="#E87A5B" strokeWidth="1.3" opacity="0.7" points={spark("expenses")} />
            ) : null}
          </svg>
        </div>
        <div className="kpi g" style={{ padding: "22px 24px" }}>
          <div className="lbl">
            <span className="sw" />
            Tasa de ahorro
          </div>
          <div className="val">{isLoading ? "—" : `${asNumber(summary?.savings_rate).toFixed(1)}%`}</div>
          <div className="delta">{summary?.uncategorized_count ?? 0} sin categoría</div>
          <svg className="spark" viewBox="0 0 200 32" preserveAspectRatio="none" style={{ height: 32, marginTop: 6 }}>
            {spark("net") ? (
              <polyline fill="none" stroke="#E6B85C" strokeWidth="1.3" opacity="0.8" points={spark("net")} />
            ) : null}
          </svg>
        </div>
      </section>

      {/* Insight banner */}
      {summary && summary.uncategorized_count > 0 ? (
        <div className="insight" style={{ padding: "18px 22px", marginBottom: 24 }}>
          <div className="insight-mark serif">¶</div>
          <div className="insight-body">
            <div className="lbl">Por revisar</div>
            <div className="txt">
              Tienes <strong>{summary.uncategorized_count} movimientos sin categoría</strong> en este periodo.{" "}
              <span className="serif" style={{ color: "var(--text-2)", fontSize: 15 }}>
                Categorízalos para mejorar tus métricas.
              </span>
            </div>
          </div>
          <button className="btn ghost" onClick={() => router.push("/review")}>
            Ver detalle →
          </button>
        </div>
      ) : net > 0 ? (
        <div className="insight ok" style={{ padding: "18px 22px", marginBottom: 24 }}>
          <div className="insight-mark serif">✓</div>
          <div className="insight-body">
            <div className="lbl">Buen mes</div>
            <div className="txt">
              Cerraste con un <strong>ahorro positivo de {cur(net)}</strong>.{" "}
              <span className="serif" style={{ color: "var(--text-2)", fontSize: 15 }}>
                Sigue así.
              </span>
            </div>
          </div>
          <button className="btn ghost" onClick={() => router.push("/patrimonio")}>
            Ver detalle →
          </button>
        </div>
      ) : null}

      {/* Flow + Top categorías */}
      <section className="grid gap-6" style={{ gridTemplateColumns: "1.6fr 1fr", marginBottom: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Flujo mensual</h3>
              <div
                className="mono flex gap-[18px]"
                style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)" }}
              >
                <span className="flex items-center gap-[7px]">
                  <span style={{ width: 10, height: 2, background: "var(--acc)" }} />
                  Ingresos
                </span>
                <span className="flex items-center gap-[7px]">
                  <span style={{ width: 10, height: 2, background: "var(--rust)" }} />
                  Gastos
                </span>
                <span className="flex items-center gap-[7px]">
                  <span style={{ width: 10, height: 2, background: "var(--text-3)" }} />
                  Ahorro neto
                </span>
              </div>
            </div>
            <div className="seg">
              <button>3m</button>
              <button>6m</button>
              <button className="on">12m</button>
              <button>24m</button>
            </div>
          </div>
          <div style={{ position: "relative", height: 280 }}>
            <svg
              viewBox="0 0 600 260"
              preserveAspectRatio="none"
              style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
            >
              <g stroke="rgba(255,255,255,0.05)">
                <line x1="40" y1="40" x2="600" y2="40" />
                <line x1="40" y1="100" x2="600" y2="100" />
                <line x1="40" y1="160" x2="600" y2="160" />
                <line x1="40" y1="220" x2="600" y2="220" />
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
                    <text x={cx} y={PB + 18} fill="#807A6E" fontFamily="var(--font-geist-mono)" fontSize="9" textAnchor="middle">
                      {monthShortUpper(t.month)}
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
            <h3>Donde se fue · top 6</h3>
            <span className="meta">{summary?.period.toString().toLowerCase() ?? "periodo"}</span>
          </div>
          <div className="flex flex-col gap-[13px]">
            {(summary?.category_expenses ?? []).slice(0, 6).map((c, i) => {
              const swColor = c.category_color || catColor(i);
              const pct = (asNumber(c.amount) / topCategoryTotal) * 100;
              const totalExp = Math.max(1, asNumber(summary?.expenses));
              const sharePct = Math.round((asNumber(c.amount) / totalExp) * 100);
              return (
                <div key={c.category_id} className="grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-1.5">
                  <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
                    <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: swColor }} />
                    {c.category_name}
                  </div>
                  <div className="mono num text-right text-[13px]" style={{ color: "var(--text)" }}>
                    {cur(c.amount)} <span className="text-[10px]" style={{ color: "var(--text-3)", marginLeft: 6 }}>{sharePct}%</span>
                  </div>
                  <div className="col-span-2 overflow-hidden rounded-[2px]" style={{ height: 3, background: "var(--bg-3)" }}>
                    <div className="h-full rounded-[2px]" style={{ width: `${Math.max(2, pct)}%`, background: swColor }} />
                  </div>
                </div>
              );
            })}
            {(summary?.category_expenses ?? []).length === 0 && !isLoading ? (
              <p className="mono text-[12px]" style={{ color: "var(--text-3)" }}>Sin gastos categorizados.</p>
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
          <div
            className="mono grid gap-3.5 uppercase"
            style={{
              gridTemplateColumns: "80px 1fr 160px 140px 100px",
              padding: "0 0 10px",
              borderBottom: "1px solid var(--line)",
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "var(--text-3)",
            }}
          >
            <div>Fecha</div>
            <div>Descripción</div>
            <div>Categoría</div>
            <div>Cuenta</div>
            <div className="text-right">Monto</div>
          </div>
          {(summary?.recent_transactions ?? []).map((tx, i) => {
            const chipTone = tx.category_name ? CHIP_TONES[i % CHIP_TONES.length] : "k";
            return (
              <button
                key={tx.id}
                onClick={() => router.push("/transactions")}
                className="move grid items-center gap-3.5 text-left"
                style={{
                  gridTemplateColumns: "80px 1fr 160px 140px 100px",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--line-2)",
                }}
              >
                <div className="mono text-[11px]" style={{ color: "var(--text-3)" }}>{monthDayLabel(tx.date)}</div>
                <div className="min-w-0 text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  <span className="block truncate">{tx.description}</span>
                  <span className="mono block text-[11px] font-normal" style={{ color: "var(--text-3)", marginTop: 2 }}>
                    {tx.category_name ?? "sin categoría"} · {tx.movement_type === "income" ? "ingreso" : "gasto"}
                  </span>
                </div>
                <div>
                  <span className={`chip ${chipTone}`.trim()}>
                    <span className="sw" style={tx.category_color ? { background: tx.category_color } : undefined} />
                    {tx.category_name ?? "Sin categoría"}
                  </span>
                </div>
                <div className="mono flex items-center gap-[7px] text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span
                    className="inline-block rounded-[2px]"
                    style={{ width: 8, height: 8, background: tx.movement_type === "income" ? "var(--acc)" : "var(--rust)" }}
                  />
                  <span className="truncate">{tx.account_name}</span>
                </div>
                <div
                  className="mono num text-right text-[14px] font-medium"
                  style={{ color: tx.movement_type === "income" ? "var(--acc)" : "var(--text)" }}
                >
                  {tx.movement_type === "income" ? "+" : "−"}
                  {plain(tx.amount, tx.currency)}
                </div>
              </button>
            );
          })}
          {(summary?.recent_transactions ?? []).length === 0 && !isLoading ? (
            <p className="mono text-[12px]" style={{ padding: "24px 0", color: "var(--text-3)" }}>Sin movimientos recientes.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
