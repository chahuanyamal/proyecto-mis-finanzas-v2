"use client";

import { transactionsApi } from "@/lib/api";
import type { CategoryAggregate, TransactionSummary } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const CAT_TONES = ["", "r", "g", "v", "b"] as const;

function fmt(value: number, currency = "CLP"): string {
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
function plain(value: number, currency = "CLP"): string {
  return fmt(value, currency).replace(/[^\d.,\-]/g, "");
}
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10); // día 0 del mes siguiente = último del actual
  return { start, end };
}
function ymOffset(offset: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(ym: string): { name: string; year: string } {
  const [y, m] = ym.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long" });
  return { name, year: String(y) };
}
function primaryCurrency(s: TransactionSummary | null): string {
  if (!s) return "CLP";
  let best = "CLP"; let max = -1;
  for (const [cur, v] of Object.entries(s.by_currency)) if (v.count > max) { max = v.count; best = cur; }
  return best;
}
function delta(a: number, b: number): { abs: number; pct: number | null } {
  return { abs: a - b, pct: b === 0 ? null : ((a - b) / b) * 100 };
}

export default function CompararPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [monthA, setMonthA] = useState(ymOffset(0));
  const [monthB, setMonthB] = useState(ymOffset(-1));
  const [sumA, setSumA] = useState<TransactionSummary | null>(null);
  const [sumB, setSumB] = useState<TransactionSummary | null>(null);
  const [catA, setCatA] = useState<CategoryAggregate[]>([]);
  const [catB, setCatB] = useState<CategoryAggregate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/comparar"); }, [hasVerified, router, user]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const ra = monthRange(monthA); const rb = monthRange(monthB);
    try {
      const [sa, sb, ca, cb] = await Promise.all([
        transactionsApi.summary({ start_date: ra.start, end_date: ra.end }),
        transactionsApi.summary({ start_date: rb.start, end_date: rb.end }),
        transactionsApi.byCategory({ start_date: ra.start, end_date: ra.end }),
        transactionsApi.byCategory({ start_date: rb.start, end_date: rb.end }),
      ]);
      setSumA(sa.data); setSumB(sb.data); setCatA(ca.data); setCatB(cb.data);
    } catch { setError("No se pudo cargar la comparación."); }
    finally { setIsLoading(false); }
  }, [monthA, monthB]);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const cur = primaryCurrency(sumA);
  const aIncome = Number(sumA?.by_currency[cur]?.income ?? 0);
  const aExpense = Number(sumA?.by_currency[cur]?.expense ?? 0);
  const bIncome = Number(sumB?.by_currency[cur]?.income ?? 0);
  const bExpense = Number(sumB?.by_currency[cur]?.expense ?? 0);

  const aNet = aIncome - aExpense;
  const bNet = bIncome - bExpense;
  const aRate = aIncome > 0 ? (aNet / aIncome) * 100 : 0;
  const bRate = bIncome > 0 ? (bNet / bIncome) * 100 : 0;

  const labelA = monthLabel(monthA);
  const labelB = monthLabel(monthB);
  const daysIn = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const daysA = daysIn(monthA);
  const daysB = daysIn(monthB);

  const categoryRows = useMemo(() => {
    const map = new Map<string, { name: string; a: number; b: number }>();
    for (const c of catA) { const k = c.category_id ?? "uncategorized"; map.set(k, { name: c.category_name, a: Number(c.expense), b: 0 }); }
    for (const c of catB) {
      const k = c.category_id ?? "uncategorized";
      const e = map.get(k);
      if (e) e.b = Number(c.expense); else map.set(k, { name: c.category_name, a: 0, b: Number(c.expense) });
    }
    return [...map.values()].filter((r) => r.a || r.b).sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
  }, [catA, catB]);

  const catMax = Math.max(1, ...categoryRows.flatMap((r) => [r.a, r.b]));
  const topChanges = useMemo(
    () => [...categoryRows].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, 6),
    [categoryRows],
  );

  // KPI comparison cards. invert=true → subir gasto es malo (rust).
  const kpis: Array<{ label: string; tone: string; a: number; b: number; invert: boolean; pp?: boolean }> = [
    { label: "Ingresos", tone: "", a: aIncome, b: bIncome, invert: false },
    { label: "Gastos", tone: "r", a: aExpense, b: bExpense, invert: true },
    { label: "Ahorro neto", tone: "", a: aNet, b: bNet, invert: false },
    { label: "Tasa ahorro", tone: "g", a: aRate, b: bRate, invert: false, pp: true },
  ];

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Comparar <span className="serif">períodos</span>
          </h1>
          <div className="sub">
            PERIODO A: <strong>{labelA.name} {labelA.year}</strong> · PERIODO B: <strong>{labelB.name} {labelB.year}</strong> · {daysA} días vs. {daysB} días
          </div>
        </div>
      </div>

      {/* Period pickers */}
      <div className="grid items-center gap-4 border-b border-[color:var(--line)] pb-6" style={{ gridTemplateColumns: "1fr 60px 1fr", marginBottom: 24 }}>
        <label
          className="flex cursor-pointer flex-col rounded-[10px] border border-[color:var(--line)] px-5 py-4"
          style={{ background: "var(--bg-2)", borderLeft: "3px solid var(--acc)" }}
        >
          <span className="mono mb-1.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">▲ Período A</span>
          <input
            type="month"
            value={monthA}
            onChange={(e) => setMonthA(e.target.value)}
            className="serif bg-transparent text-[34px] italic tracking-[-0.015em] text-[color:var(--text)] outline-none"
          />
        </label>
        <div className="serif text-center text-[30px] italic text-[color:var(--text-3)]">vs.</div>
        <label
          className="flex cursor-pointer flex-col rounded-[10px] border border-[color:var(--line)] px-5 py-4"
          style={{ background: "var(--bg-2)", borderLeft: "3px solid var(--gold)" }}
        >
          <span className="mono mb-1.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">● Período B</span>
          <input
            type="month"
            value={monthB}
            onChange={(e) => setMonthB(e.target.value)}
            className="serif bg-transparent text-[34px] italic tracking-[-0.015em] text-[color:var(--text)] outline-none"
          />
        </label>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body"><div className="txt">{error}</div></div>
          <span />
        </div>
      ) : null}

      {isLoading ? (
        <p className="flex gap-2 font-mono text-sm text-[color:var(--text-3)]"><Loader2 className="animate-spin" /> Cargando…</p>
      ) : (
        <>
          {/* KPI compare strip */}
          <section className="strip" style={{ marginBottom: 24 }}>
            {kpis.map((k) => {
              const d = delta(k.a, k.b);
              const good = k.invert ? d.abs <= 0 : d.abs >= 0;
              const fa = k.pp ? `${k.a.toFixed(1)}%` : plain(k.a, cur);
              const fb = k.pp ? `${k.b.toFixed(1)}%` : plain(k.b, cur);
              const absStr = k.pp
                ? `${d.abs >= 0 ? "+" : ""}${d.abs.toFixed(1)} pp`
                : `${d.abs >= 0 ? "+" : "−"}${plain(Math.abs(d.abs), cur)}`;
              return (
                <div key={k.label} className={`kpi ${k.tone}`.trim()}>
                  <div className="lbl"><span className="sw" />{k.label}</div>
                  <div className="grid grid-cols-2 gap-2.5" style={{ marginBottom: 12 }}>
                    <div className="flex flex-col gap-1">
                      <span className="mono flex items-center gap-1.5 text-[10px] tracking-[0.06em] text-[color:var(--text-3)]">
                        <span style={{ width: 8, height: 2, background: "var(--acc)" }} />A · {labelA.name.slice(0, 3)}
                      </span>
                      <span className="num text-[18px] font-light tracking-[-0.02em]">{fa}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="mono flex items-center gap-1.5 text-[10px] tracking-[0.06em] text-[color:var(--text-3)]">
                        <span style={{ width: 8, height: 2, background: "var(--gold)" }} />B · {labelB.name.slice(0, 3)}
                      </span>
                      <span className="num text-[18px] font-light tracking-[-0.02em] text-[color:var(--text-3)]">{fb}</span>
                    </div>
                  </div>
                  <div className="delta flex items-center justify-between border-t pt-2.5" style={{ borderColor: "var(--line-2)" }}>
                    <span className="text-[11px] text-[color:var(--text-3)]">{d.abs >= 0 ? "▲" : "▼"} {absStr}</span>
                    <span className={`text-[14px] font-medium ${good ? "up" : "dn"}`}>
                      {d.pct !== null ? `${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Insight */}
          {bNet !== 0 ? (
            <div className={`insight ${aNet >= bNet ? "ok" : "err"}`} style={{ marginBottom: 24 }}>
              <div className="insight-mark serif">¶</div>
              <div className="insight-body">
                <div className="lbl">{aNet >= bNet ? "Mejora general" : "Retroceso"}</div>
                <div className="txt">
                  Tu ahorro neto {aNet >= bNet ? "subió" : "bajó"}{" "}
                  <strong>{delta(aNet, bNet).pct !== null ? `${Math.abs(delta(aNet, bNet).pct as number).toFixed(1)}%` : "—"}</strong>{" "}
                  de {labelB.name} a {labelA.name}.{" "}
                  <span className="serif" style={{ color: "var(--text-2)" }}>
                    {fmt(aIncome, cur)} en ingresos · {fmt(aExpense, cur)} en gastos.
                  </span>
                </div>
              </div>
              <span />
            </div>
          ) : null}

          {/* Comparison by category + top changes */}
          <section className="grid gap-6" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 24 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Gastos por categoría · A vs. B</h3>
                <span className="meta">top {categoryRows.length}</span>
              </div>
              <div className="flex flex-col">
                {categoryRows.map((r, i) => {
                  const tone = CAT_TONES[i % CAT_TONES.length];
                  const d = delta(r.a, r.b);
                  const swColor = tone === "r" ? "var(--rust)" : tone === "g" ? "var(--gold)" : tone === "v" ? "var(--violet)" : tone === "b" ? "var(--blue)" : "var(--acc)";
                  return (
                    <div
                      key={r.name}
                      className="grid items-center border-b py-3 last:border-0"
                      style={{ gridTemplateColumns: "1fr 70px 1fr 90px", columnGap: 14, borderColor: "var(--line-2)" }}
                    >
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: swColor }} />
                        {r.name}
                      </div>
                      <div />
                      <div className="grid grid-rows-2 gap-[3px]">
                        <div className="relative h-3.5 overflow-hidden rounded-[2px]" style={{ background: "var(--bg-3)" }}>
                          <div className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${(r.a / catMax) * 100}%`, background: "var(--acc)" }} />
                          <span className="mono num absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "white", opacity: 0.8, mixBlendMode: "difference", textShadow: "0 0 4px rgba(0,0,0,0.4)" }}>{plain(r.a, cur)}</span>
                          <span className="mono absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] tracking-[0.04em] text-[color:var(--text-3)]">A</span>
                        </div>
                        <div className="relative h-3.5 overflow-hidden rounded-[2px]" style={{ background: "var(--bg-3)" }}>
                          <div className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${(r.b / catMax) * 100}%`, background: "var(--gold)" }} />
                          <span className="mono num absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "white", opacity: 0.8, mixBlendMode: "difference", textShadow: "0 0 4px rgba(0,0,0,0.4)" }}>{plain(r.b, cur)}</span>
                          <span className="mono absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] tracking-[0.04em] text-[color:var(--text-3)]">B</span>
                        </div>
                      </div>
                      <div className={`mono num text-right text-[13px] font-medium ${d.abs > 0 ? "text-[color:var(--rust)]" : "text-[color:var(--acc)]"}`}>
                        {d.abs >= 0 ? "+" : "−"}{plain(Math.abs(d.abs), cur)}
                        <span className="block text-[10px] font-normal text-[color:var(--text-3)]">
                          {d.pct !== null ? `${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {categoryRows.length === 0 ? (
                  <p className="py-6 text-center font-mono text-[12px] text-[color:var(--text-3)]">Sin datos en estos períodos.</p>
                ) : null}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Mayores cambios</h3>
                <span className="meta">Δ abs.</span>
              </div>
              <div className="flex flex-col">
                {topChanges.map((r) => {
                  const d = delta(r.a, r.b);
                  const up = d.abs > 0;
                  return (
                    <div key={r.name} className="flex items-center gap-3 border-b py-2.5 last:border-0" style={{ borderColor: "var(--line-2)" }}>
                      <div
                        className="mono grid h-[30px] w-[30px] place-items-center rounded-[7px] text-[12px] font-semibold"
                        style={{
                          background: up ? "rgba(232,122,91,0.1)" : "rgba(94,233,181,0.1)",
                          color: up ? "var(--rust)" : "var(--acc)",
                        }}
                      >
                        {up ? "↑" : "↓"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{r.name}</div>
                        <div className="mono mt-0.5 text-[10px] tracking-[0.04em] text-[color:var(--text-3)]">
                          {plain(r.b, cur)} → {plain(r.a, cur)}
                        </div>
                      </div>
                      <div className={`mono num text-right text-[13px] font-medium ${up ? "text-[color:var(--rust)]" : "text-[color:var(--acc)]"}`}>
                        {d.abs >= 0 ? "+" : "−"}{plain(Math.abs(d.abs), cur)}
                        <span className="block text-[10px] font-normal text-[color:var(--text-3)]">
                          {d.pct !== null ? `${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {topChanges.length === 0 ? (
                  <p className="py-6 font-mono text-[12px] text-[color:var(--text-3)]">Sin cambios.</p>
                ) : null}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
