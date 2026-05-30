"use client";

import { reportsApi } from "@/lib/api";
import type { AnnualReport } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { usePeriodStore } from "@/stores/period";
import { Download, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

function currentYear(): number {
  return new Date().getFullYear();
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [year, setYear] = useState(currentYear());
  const currency = usePeriodStore((s) => s.currency);

  const reportQuery = useQuery({
    queryKey: ["reports", "annual", year],
    queryFn: async () => (await reportsApi.annual(year)).data,
    enabled: Boolean(user),
  });
  const report: AnnualReport | null = reportQuery.data ?? null;
  const isLoading = reportQuery.isPending;
  const error = reportQuery.isError ? "No se pudo cargar el reporte anual." : "";

  const total = report?.totals.find((item) => item.currency === currency) ?? null;
  const months = useMemo(() => (report?.by_month ?? []).filter((item) => item.currency === currency), [currency, report]);
  const categories = useMemo(
    () => (report?.by_category ?? []).filter((item) => item.currency === currency).sort((a, b) => Number(b.expenses) - Number(a.expenses)),
    [currency, report],
  );
  const maxBar = Math.max(1, ...months.flatMap((item) => [Number(item.income), Number(item.expenses)]));
  const maxCatExpense = Math.max(1, ...categories.map((item) => Number(item.expenses)));
  const net = Number(total?.net ?? 0);

  const thisYear = currentYear();
  const years = [thisYear - 2, thisYear - 1, thisYear];

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Reporte an<span className="serif">ual</span>
          </h1>
          <div className="sub">
            <strong>reportes</strong> · ingresos, gastos, neto mensual y categorías del año
          </div>
        </div>
        <div className="actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a className="btn ghost" href={reportsApi.annualCsvUrl(year)} target="_blank" rel="noreferrer">
            <Download size={14} /> CSV
          </a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {years.map((y) => (
          <button
            key={y}
            className="pill"
            onClick={() => setYear(y)}
            style={{
              cursor: "pointer",
              background: y === year ? "var(--acc)" : undefined,
              color: y === year ? "var(--bg)" : undefined,
              borderColor: y === year ? "var(--acc)" : undefined,
              fontWeight: y === year ? 600 : undefined,
            }}
          >
            {y === thisYear ? `${y} · YTD` : y}
          </button>
        ))}
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 18 }}>
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
          <Loader2 className="animate-spin" size={16} /> Cargando reporte…
        </div>
      ) : (
        <>
          <div className="strip">
            <div className="kpi">
              <div className="lbl"><span className="sw" />Ingresos · {year}</div>
              <div className="val num">{formatMoney(total?.income ?? "0", currency)}</div>
            </div>
            <div className="kpi r">
              <div className="lbl"><span className="sw" />Gastos · {year}</div>
              <div className="val num">{formatMoney(total?.expenses ?? "0", currency)}</div>
            </div>
            <div className={`kpi ${net >= 0 ? "g" : "r"}`}>
              <div className="lbl"><span className="sw" />Ahorro neto</div>
              <div className="val num">{formatMoney(total?.net ?? "0", currency)}</div>
            </div>
            <div className="kpi v">
              <div className="lbl"><span className="sw" />Movimientos</div>
              <div className="val num">{total?.count ?? 0}</div>
              <div className="sub">{report?.uncategorized_count ?? 0} sin categoría</div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h3>Mes a mes · ingresos vs gastos</h3>
              <span className="meta">{months.length} meses</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180 }}>
              {months.map((item) => (
                <div key={`${item.month}-${item.currency}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <div style={{ display: "flex", width: "100%", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 150 }}>
                    <div style={{ width: "45%", borderRadius: "2px 2px 0 0", background: "var(--acc)", height: `${(Number(item.income) / maxBar) * 100}%` }} title={`Ingreso ${formatMoney(item.income, currency)}`} />
                    <div style={{ width: "45%", borderRadius: "2px 2px 0 0", background: "var(--rust)", height: `${(Number(item.expenses) / maxBar) * 100}%` }} title={`Gasto ${formatMoney(item.expenses, currency)}`} />
                  </div>
                  <span className="mono" style={{ fontSize: 9, color: "var(--text-3)" }}>{item.month.slice(5)}</span>
                </div>
              ))}
              {months.length === 0 ? (
                <div className="empty" style={{ width: "100%" }}>
                  <div className="empty-mark">∅</div>
                  <h4>Sin datos mensuales</h4>
                  <p>No hay movimientos para {year} en {currency}.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Categorías del año</h3>
              <span className="meta">{categories.length} categorías</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {categories.map((item) => {
                const pct = (Number(item.expenses) / maxCatExpense) * 100;
                return (
                  <div
                    key={`${item.category_id ?? "none"}-${item.currency}`}
                    style={{ padding: "10px 0", borderBottom: "1px solid var(--line-2)", display: "grid", gridTemplateColumns: "150px 1fr 220px", gap: 14, alignItems: "center" }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.category_name}</div>
                    <div style={{ height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "var(--acc)", borderRadius: 2, width: `${pct}%` }} />
                    </div>
                    <div className="mono" style={{ fontSize: 12, textAlign: "right", color: "var(--text-2)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <span>{formatMoney(item.expenses, item.currency)}</span>
                      <span style={{ color: "var(--text-3)" }}>{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
              {categories.length === 0 ? (
                <div className="empty">
                  <div className="empty-mark">∅</div>
                  <h4>Sin categorías</h4>
                  <p>No hay categorías para mostrar en {year} · {currency}.</p>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
