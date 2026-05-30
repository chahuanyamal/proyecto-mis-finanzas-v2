"use client";

import { dashboardApi, transactionsApi } from "@/lib/api";
import type { CategoryAggregate, MonthAggregate, MonthlyInsights } from "@/lib/api-types";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { usePeriodStore } from "@/stores/period";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  return { start: `${ym}-01`, end: new Date(y, m, 0).toISOString().slice(0, 10) };
}
function ymOffset(offset: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function InsightsPage() {
  const { user } = useAuthStore();
  const currency = usePeriodStore((s) => s.currency);
  const [series, setSeries] = useState<MonthAggregate[]>([]);
  const [catThis, setCatThis] = useState<CategoryAggregate[]>([]);
  const [catPrev, setCatPrev] = useState<CategoryAggregate[]>([]);
  const [insights, setInsights] = useState<MonthlyInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    const rThis = monthRange(ymOffset(0)); const rPrev = monthRange(ymOffset(-1));
    try {
      const [sr, ct, cp, ins] = await Promise.all([
        transactionsApi.byMonth({ months: 12 }),
        transactionsApi.byCategory({ start_date: rThis.start, end_date: rThis.end }),
        transactionsApi.byCategory({ start_date: rPrev.start, end_date: rPrev.end }),
        dashboardApi.insights(undefined, currency),
      ]);
      setSeries(sr.data); setCatThis(ct.data); setCatPrev(cp.data); setInsights(ins.data);
    } catch { setError("No se pudieron cargar los insights."); }
    finally { setIsLoading(false); }
  }, [currency]);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const maxBar = useMemo(() => Math.max(1, ...series.flatMap((m) => [Number(m.income), Number(m.expense)])), [series]);
  const avgExpense = useMemo(() => series.length ? series.reduce((a, m) => a + Number(m.expense), 0) / series.length : 0, [series]);
  const thisMonth = series[series.length - 1];
  const tIncome = Number(thisMonth?.income ?? 0);
  const tExpense = Number(thisMonth?.expense ?? 0);
  const savingsRate = tIncome > 0 ? ((tIncome - tExpense) / tIncome) * 100 : 0;

  const topCategories = useMemo(() => {
    const max = Math.max(1, ...catThis.map((c) => Number(c.expense)));
    return catThis.filter((c) => Number(c.expense) > 0).slice(0, 8).map((c) => ({ name: c.category_name, value: Number(c.expense), pct: (Number(c.expense) / max) * 100 }));
  }, [catThis]);

  const variations = useMemo(() => {
    const prev = new Map(catPrev.map((c) => [c.category_id ?? "uncategorized", Number(c.expense)]));
    return catThis
      .map((c) => ({ name: c.category_name, now: Number(c.expense), before: prev.get(c.category_id ?? "uncategorized") ?? 0 }))
      .map((r) => ({ ...r, diff: r.now - r.before }))
      .filter((r) => Math.abs(r.diff) > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5);
  }, [catThis, catPrev]);

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Tendencias y res<span className="serif">úmenes</span>
          </h1>
          <div className="sub">
            <strong>insights</strong> · evolución de ingresos, gastos y categorías
          </div>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="lbl">Error</div>
            <div className="txt">{error}</div>
          </div>
          <div />
        </div>
      ) : null}

      {isLoading ? (
        <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--text-3)" }}>
          <Loader2 className="animate-spin" size={16} /> Cargando…
        </div>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h3>Resumen del mes</h3>
              {insights ? <span className="meta">{insights.month}</span> : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {insights && insights.items.length > 0 ? (
                insights.items.map((item, i) => {
                  const variant =
                    item.type === "ok" ? "insight ok" : item.type === "err" ? "insight err" : "insight gold";
                  const mark = item.type === "ok" ? "✓" : item.type === "err" ? "!" : "i";
                  return (
                    <div key={`${item.title}-${i}`} className={variant}>
                      <div className="insight-mark">{mark}</div>
                      <div className="insight-body">
                        <div className="lbl">{item.title}</div>
                        <div className="txt">{item.detail}</div>
                      </div>
                      <div />
                    </div>
                  );
                })
              ) : (
                <div className="insight ok">
                  <div className="insight-mark">✓</div>
                  <div className="insight-body">
                    <div className="lbl">Sin novedades este mes</div>
                    <div className="txt">No hay alertas ni hallazgos relevantes por ahora.</div>
                  </div>
                  <div />
                </div>
              )}
            </div>
          </div>

          <div className={`insight ${savingsRate >= 0 ? "ok" : "err"}`}>
            <div className="insight-mark">{savingsRate >= 0 ? "✓" : "!"}</div>
            <div className="insight-body">
              <div className="lbl">Tasa de ahorro · este mes</div>
              <div className="txt">
                Estás ahorrando <strong>{savingsRate.toFixed(0)}%</strong> de tus ingresos. Ingreso{" "}
                <strong>{formatMoney(tIncome)}</strong> · gasto <strong>{formatMoney(tExpense)}</strong>.
              </div>
            </div>
            <div className="num" style={{ fontSize: 28, fontWeight: 300, color: savingsRate >= 0 ? "var(--acc)" : "var(--rust)" }}>
              {savingsRate.toFixed(0)}%
            </div>
          </div>

          <div className="strip">
            <div className="kpi r">
              <div className="lbl"><span className="sw" />Gasto este mes</div>
              <div className="val num">{formatMoney(tExpense)}</div>
            </div>
            <div className="kpi">
              <div className="lbl"><span className="sw" />Ingreso este mes</div>
              <div className="val num">{formatMoney(tIncome)}</div>
            </div>
            <div className="kpi v">
              <div className="lbl"><span className="sw" />Gasto medio · 12m</div>
              <div className="val num">{formatMoney(avgExpense)}</div>
            </div>
            <div className="kpi g">
              <div className="lbl"><span className="sw" />Tasa de ahorro</div>
              <div className="val num">{savingsRate.toFixed(0)}%</div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h3>Ingresos vs gastos · 12 meses</h3>
              <span className="meta">{series.length} meses</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180 }}>
              {series.map((m) => (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <div style={{ display: "flex", width: "100%", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 150 }}>
                    <div style={{ width: "45%", borderRadius: "2px 2px 0 0", background: "var(--acc)", height: `${(Number(m.income) / maxBar) * 100}%` }} title={`Ingreso ${formatMoney(Number(m.income))}`} />
                    <div style={{ width: "45%", borderRadius: "2px 2px 0 0", background: "var(--rust)", height: `${(Number(m.expense) / maxBar) * 100}%` }} title={`Gasto ${formatMoney(Number(m.expense))}`} />
                  </div>
                  <span className="mono" style={{ fontSize: 9, color: "var(--text-3)" }}>{m.month.slice(5)}</span>
                </div>
              ))}
              {series.length === 0 ? <p className="mono" style={{ fontSize: 13, color: "var(--text-3)" }}>Sin datos todavía.</p> : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Top categorías · este mes</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {topCategories.map((c) => (
                  <div key={c.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span>{c.name}</span>
                      <span className="mono" style={{ color: "var(--text-2)" }}>{formatMoney(c.value)}</span>
                    </div>
                    <div style={{ height: 4, width: "100%", borderRadius: 2, background: "var(--bg-3)", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "var(--acc)", borderRadius: 2, width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
                {topCategories.length === 0 ? <p className="mono" style={{ fontSize: 13, color: "var(--text-3)" }}>Sin gastos este mes.</p> : null}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Mayores variaciones vs mes anterior</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {variations.map((v) => (
                  <div key={v.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--line-2)", background: "var(--bg-3)", borderRadius: 6, padding: "10px 12px", fontSize: 13 }}>
                    <span>{v.name}</span>
                    <span className="mono" style={{ display: "flex", alignItems: "center", gap: 6, color: v.diff > 0 ? "var(--rust)" : "var(--acc)" }}>
                      {v.diff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {v.diff > 0 ? "+" : ""}{formatMoney(v.diff)}
                    </span>
                  </div>
                ))}
                {variations.length === 0 ? <p className="mono" style={{ fontSize: 13, color: "var(--text-3)" }}>Sin variaciones relevantes.</p> : null}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
