"use client";

import { patrimonioApi } from "@/lib/api";
import type { NetWorth, PatrimonioAccountTrend, PatrimonioCompare, PatrimonioHistory, PatrimonioProjection } from "@/lib/api-types";
import { asNumber, formatPercent, initials, monthShortUpper, plain } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { usePeriodStore } from "@/stores/period";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const TYPE_LABELS: Record<string, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  credit: "Crédito",
  cash: "Efectivo",
};

const MARK_TONES = ["green", "gold", "v", ""] as const;

function signed(value: number, currency: string): string {
  return `${value >= 0 ? "+" : "−"}$${plain(Math.abs(value), currency)}`;
}

function snapDate(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${last.getDate()} ${monthShortUpper(ym)} ${y}`;
}

export default function PatrimonioPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const currency = usePeriodStore((s) => s.currency);
  const [data, setData] = useState<NetWorth | null>(null);
  const [history, setHistory] = useState<PatrimonioHistory | null>(null);
  const [trend, setTrend] = useState<PatrimonioAccountTrend | null>(null);
  const [compare, setCompare] = useState<PatrimonioCompare | null>(null);
  const [projection, setProjection] = useState<PatrimonioProjection | null>(null);
  const [projMonths, setProjMonths] = useState(6);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/patrimonio"); }, [hasVerified, router, user]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsLoading(true);
    setError("");
    Promise.all([
      patrimonioApi.get(),
      patrimonioApi.history(12, currency),
      patrimonioApi.accountTrend(12, currency),
      patrimonioApi.compare(1, currency),
      patrimonioApi.projection(projMonths, 12, currency),
    ]).then(([net, hist, accountTrend, cmp, proj]) => {
      if (cancelled) return;
      setData(net.data);
      setHistory(hist.data);
      setTrend(accountTrend.data);
      setCompare(cmp.data);
      setProjection(proj.data);
    }).catch(() => {
      if (!cancelled) setError("No se pudo cargar el patrimonio.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [currency, user]);

  const visibleAccounts = useMemo(() => (data?.accounts ?? []).filter((account) => account.currency === currency), [currency, data]);
  const historyPoints = history?.history ?? [];
  const compareTotal = compare?.totals.find((item) => item.currency === currency) ?? null;

  const total = asNumber(data?.totals_by_currency.find((t) => t.currency === currency)?.total);
  const assets = useMemo(() => visibleAccounts.reduce((acc, a) => acc + Math.max(0, asNumber(a.balance)), 0), [visibleAccounts]);
  const liabilities = useMemo(() => visibleAccounts.reduce((acc, a) => acc + Math.min(0, asNumber(a.balance)), 0), [visibleAccounts]);

  // Evolution chart geometry from history points.
  const chart = useMemo(() => {
    const pts = historyPoints.map((p) => asNumber(p.value));
    if (pts.length === 0) return null;
    const max = Math.max(...pts, 1);
    const min = Math.min(...pts, 0);
    const span = max - min || 1;
    const W = 1200, H = 260, top = 30, bottom = 230, left = 40, right = 1160;
    const stepX = pts.length > 1 ? (right - left) / (pts.length - 1) : 0;
    const xy = pts.map((v, i) => {
      const x = left + i * stepX;
      const y = bottom - ((v - min) / span) * (bottom - top);
      return { x, y };
    });
    const line = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ");
    const area = `${line} L${xy[xy.length - 1].x.toFixed(0)},250 L${xy[0].x.toFixed(0)},250 Z`;
    return { xy, line, area, W, H };
  }, [historyPoints]);

  // Snapshots: most recent first, with month-over-month delta.
  const snapshots = useMemo(() => {
    const pts = historyPoints.map((p) => ({ month: p.month, value: asNumber(p.value) }));
    const maxAbs = Math.max(1, ...pts.map((p) => Math.abs(p.value)));
    return [...pts].reverse().slice(0, 6).map((p, idx, arr) => {
      const prev = arr[idx + 1];
      const d = prev ? p.value - prev.value : null;
      const pct = prev && prev.value !== 0 ? (d! / Math.abs(prev.value)) * 100 : null;
      return { ...p, delta: d, pct, width: (Math.abs(p.value) / maxAbs) * 100 };
    });
  }, [historyPoints]);

  const compMax = Math.max(1, ...visibleAccounts.map((a) => Math.abs(asNumber(a.balance))));
  const firstHistory = historyPoints.length ? asNumber(historyPoints[0].value) : 0;
  const yearPct = firstHistory !== 0 ? ((total - firstHistory) / Math.abs(firstHistory)) * 100 : null;

  // Editorial volume line: "Vol. XXVI · N° V · Mayo 2026"
  const volLine = useMemo(() => {
    const now = new Date();
    const roman = (x: number) => {
      const map: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
      let r = "";
      for (const [v, s] of map) while (x >= v) { r += s; x -= v; }
      return r;
    };
    const monthName = now.toLocaleDateString("es-CL", { month: "long" });
    const cap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `Vol. ${roman(now.getFullYear() - 2000)} · N° ${roman(now.getMonth() + 1)} · ${cap} ${now.getFullYear()}`;
  }, []);

  // Best month-over-month gain across history.
  const bestMonth = useMemo(() => {
    const pts = historyPoints.map((p) => ({ month: p.month, value: asNumber(p.value) }));
    let best: { label: string; delta: number } | null = null;
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].value - pts[i - 1].value;
      if (best === null || d > best.delta) best = { label: monthShortUpper(pts[i].month).toLowerCase(), delta: d };
    }
    return best;
  }, [historyPoints]);

  // Evolution footer summary cells.
  const evoFoot = useMemo(() => {
    if (historyPoints.length === 0) return null;
    const prev = historyPoints.length >= 2 ? asNumber(historyPoints[historyPoints.length - 2].value) : null;
    return { first: firstHistory, prev, prevLabel: historyPoints.length >= 2 ? monthShortUpper(historyPoints[historyPoints.length - 2].month).toLowerCase() : "" };
  }, [historyPoints, firstHistory]);

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>Patrimonio <span className="serif">neto</span></h1>
          <div className="sub">SALDOS ACTUALES · TENDENCIA 12M · COMPARACIÓN VS. MES ANTERIOR</div>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body"><div className="txt">{error}</div></div>
          <span />
        </div>
      ) : null}

      {isLoading ? (
        <p className="flex gap-2 font-mono text-sm text-[color:var(--text-3)]"><Loader2 className="animate-spin" /> Cargando patrimonio…</p>
      ) : (
        <>
          {/* Hero */}
          <section
            className="grid items-start border-b pb-8"
            style={{ gridTemplateColumns: "1.4fr 1fr", gap: 32, paddingTop: 8, marginBottom: 28, borderColor: "var(--line)" }}
          >
            <div>
              <div
                className="mono flex items-center gap-3.5 uppercase"
                style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--gold)", marginBottom: 18 }}
              >
                {volLine}
                <span style={{ flex: 1, height: 1, maxWidth: 160, background: "var(--line-2)" }} />
              </div>
              <div
                className="mono uppercase"
                style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--text-3)", marginBottom: 14 }}
              >
                Patrimonio neto · hoy
              </div>
              <div className="serif flex items-baseline gap-[18px]" style={{ fontSize: 140, fontWeight: 400, lineHeight: 0.85, letterSpacing: "-0.04em" }}>
                <span style={{ fontSize: 26, fontStyle: "italic", fontWeight: 300, letterSpacing: 0, color: "var(--text-3)" }}>{currency}</span>
                <span style={{ color: total >= 0 ? "var(--acc)" : "var(--rust)" }}>{plain(total, currency)}</span>
              </div>
              <div className="mono flex flex-wrap items-center gap-6" style={{ marginTop: 22, fontSize: 13, color: "var(--text-2)" }}>
                {yearPct !== null ? (
                  <span><span style={{ color: yearPct >= 0 ? "var(--acc)" : "var(--rust)" }}>{yearPct >= 0 ? "▲" : "▼"} {yearPct >= 0 ? "+" : ""}{yearPct.toFixed(1)}%</span> · 12m</span>
                ) : null}
                {compareTotal ? (
                  <span><span style={{ color: asNumber(compareTotal.delta) >= 0 ? "var(--acc)" : "var(--rust)" }}>{signed(asNumber(compareTotal.delta), currency)}</span> · vs. mes anterior</span>
                ) : null}
                {bestMonth ? (
                  <span className="serif" style={{ fontSize: 15, color: "var(--text-3)" }}>
                    Mejor mes: {bestMonth.label} · {signed(bestMonth.delta, currency)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="pl-8" style={{ borderLeft: "1px solid var(--line)" }}>
              <SideRow tone="" label="Activos" valueClass="pos">
                <span className="cu" style={{ fontSize: 11, color: "var(--text-3)", marginRight: 5 }}>{currency}</span>{plain(assets, currency)}
              </SideRow>
              <SideRow tone="r" label="Pasivos" valueClass={liabilities < 0 ? "neg" : ""}>
                <span className="cu" style={{ fontSize: 11, color: "var(--text-3)", marginRight: 5 }}>{currency}</span>{liabilities < 0 ? "−" : ""}{plain(Math.abs(liabilities), currency)}
              </SideRow>
              <SideRow tone="g" label="Cuentas">
                <span className="num">{visibleAccounts.length} <span className="cu" style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>de {data?.account_count ?? 0}</span></span>
              </SideRow>
              <SideRow tone="v" label="Último snapshot">
                <span className="mono num" style={{ fontSize: 14, color: "var(--text-3)" }}>
                  {historyPoints.length ? snapDate(historyPoints[historyPoints.length - 1].month) : "—"}
                </span>
              </SideRow>
            </div>
          </section>

          {/* Evolution chart */}
          <section className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <h3>Evolución · 12 meses · patrimonio neto</h3>
              <span className="meta">snapshots mensuales</span>
            </div>
            {chart ? (
              <svg style={{ width: "100%", height: 260, display: "block" }} viewBox="0 0 1200 260" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="pg" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#5EE9B5" stopOpacity="0.25" />
                    <stop offset="1" stopColor="#5EE9B5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4">
                  <line x1="40" y1="40" x2="1200" y2="40" />
                  <line x1="40" y1="100" x2="1200" y2="100" />
                  <line x1="40" y1="160" x2="1200" y2="160" />
                  <line x1="40" y1="220" x2="1200" y2="220" />
                </g>
                <path d={chart.area} fill="url(#pg)" />
                <path d={chart.line} fill="none" stroke="#5EE9B5" strokeWidth="2" />
                {chart.xy.length ? (
                  <>
                    <circle cx={chart.xy[chart.xy.length - 1].x} cy={chart.xy[chart.xy.length - 1].y} r="4.5" fill="#5EE9B5" />
                    <circle cx={chart.xy[chart.xy.length - 1].x} cy={chart.xy[chart.xy.length - 1].y} r="10" fill="#5EE9B5" opacity="0.18" />
                  </>
                ) : null}
                <g fill="#807A6E" fontFamily="Geist Mono" fontSize="10" textAnchor="middle">
                  {historyPoints.map((p, i) => (
                    <text key={p.month} x={chart.xy[i].x} y="246">{monthShortUpper(p.month)}</text>
                  ))}
                </g>
                <g fontFamily="Geist Mono" fontSize="11" fill="#C9C5BC">
                  <rect x="60" y="14" width="14" height="2" fill="#5EE9B5" />
                  <text x="80" y="19">Patrimonio neto</text>
                </g>
              </svg>
            ) : (
              <p className="py-10 text-center font-mono text-[12px] text-[color:var(--text-3)]">Sin historial en {currency}.</p>
            )}
            {evoFoot ? (
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line-2)" }}
              >
                <div style={{ padding: "0 14px 0 0", borderRight: "1px solid var(--line-2)" }}>
                  <div className="mono uppercase text-[11px]" style={{ color: "var(--text-3)", letterSpacing: "0.08em" }}>Hace 12 meses</div>
                  <div className="num font-light" style={{ fontSize: 18, marginTop: 4, letterSpacing: "-0.02em", color: "var(--text)" }}>${plain(evoFoot.first, currency)}</div>
                </div>
                <div style={{ padding: "0 14px", borderRight: "1px solid var(--line-2)" }}>
                  <div className="mono uppercase text-[11px]" style={{ color: "var(--text-3)", letterSpacing: "0.08em" }}>Snapshot {evoFoot.prevLabel || "anterior"}</div>
                  <div className="num font-light" style={{ fontSize: 18, marginTop: 4, letterSpacing: "-0.02em", color: "var(--text)" }}>{evoFoot.prev !== null ? `$${plain(evoFoot.prev, currency)}` : "—"}</div>
                </div>
                <div style={{ padding: "0 14px", borderRight: "1px solid var(--line-2)" }}>
                  <div className="mono uppercase text-[11px]" style={{ color: "var(--text-3)", letterSpacing: "0.08em" }}>Mejor mes (+$)</div>
                  <div className="num font-light" style={{ fontSize: 18, marginTop: 4, letterSpacing: "-0.02em", color: "var(--text)" }}>
                    {bestMonth ? <span style={{ color: "var(--acc)" }}>{signed(bestMonth.delta, currency)} {bestMonth.label}</span> : "—"}
                  </div>
                </div>
                <div style={{ padding: "0 0 0 14px", textAlign: "right" }}>
                  <div className="mono uppercase text-[11px]" style={{ color: "var(--text-3)", letterSpacing: "0.08em" }}>
                    Hoy{yearPct !== null ? ` · ${yearPct >= 0 ? "+" : ""}${yearPct.toFixed(1)}%` : ""}
                  </div>
                  <div className="num font-light" style={{ fontSize: 18, marginTop: 4, letterSpacing: "-0.02em" }}><span style={{ color: "var(--acc)" }}>${plain(total, currency)}</span></div>
                </div>
              </div>
            ) : null}
          </section>

          {/* Composition + Snapshots */}
          <section className="grid gap-6" style={{ gridTemplateColumns: "1.3fr 1fr", marginBottom: 24 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Composición · por cuenta</h3>
                <span className="meta">{visibleAccounts.length} cuentas</span>
              </div>
              <div className="flex flex-col">
                {visibleAccounts.map((account, i) => {
                  const bal = asNumber(account.balance);
                  const neg = bal < 0;
                  const pct = (Math.abs(bal) / compMax) * 100;
                  const tone = neg ? "red" : MARK_TONES[i % MARK_TONES.length];
                  return (
                    <div
                      key={account.id}
                      className="grid items-center border-b py-3 last:border-0"
                      style={{ gridTemplateColumns: "auto 1fr auto auto", columnGap: 14, borderColor: "var(--line-2)" }}
                    >
                      <div
                        className="mono grid place-items-center rounded-[7px] font-semibold"
                        style={{
                          width: 34, height: 34, fontSize: 11,
                          background: neg ? "rgba(232,122,91,0.12)" : tone === "gold" ? "rgba(230,184,92,0.12)" : tone === "green" ? "rgba(94,233,181,0.12)" : "var(--bg-3)",
                          color: neg ? "var(--rust)" : tone === "gold" ? "var(--gold)" : tone === "green" ? "var(--acc)" : "var(--text-2)",
                        }}
                      >
                        {initials(account.name)}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium">{account.name}</div>
                        <div className="mono mt-0.5 text-[11px] uppercase text-[color:var(--text-3)]">{TYPE_LABELS[account.account_type] ?? account.account_type}</div>
                      </div>
                      <div style={{ width: 160 }}>
                        <div className="overflow-hidden rounded-[2px]" style={{ height: 4, background: "var(--bg-3)" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: neg ? "var(--rust)" : "var(--acc)" }} />
                        </div>
                        <div className="mono mt-1 text-right text-[11px] text-[color:var(--text-3)]">{pct.toFixed(1)}%</div>
                      </div>
                      <div className={`mono num text-right text-[14px] font-medium ${neg ? "text-[color:var(--rust)]" : ""}`} style={{ minWidth: 110 }}>
                        {neg ? "−" : ""}${plain(Math.abs(bal), account.currency)}
                      </div>
                    </div>
                  );
                })}
                {visibleAccounts.length === 0 ? (
                  <p className="py-6 text-center font-mono text-[12px] text-[color:var(--text-3)]">Sin cuentas en {currency}.</p>
                ) : null}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Snapshots recientes</h3>
                <span className="meta">{snapshots.length} / {historyPoints.length} meses</span>
              </div>
              <div className="flex flex-col">
                {snapshots.map((s, i) => (
                  <div key={s.month} className="border-b py-3.5 last:border-0" style={{ borderColor: "var(--line-2)" }}>
                    <div className="flex items-baseline justify-between">
                      <span className="mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">{snapDate(s.month)}</span>
                      <span className="mono num text-[14px] font-medium" style={i === 0 ? { color: "var(--acc)" } : undefined}>${plain(s.value, currency)}</span>
                    </div>
                    {s.delta !== null ? (
                      <div className="mono mt-1 text-[11px] text-[color:var(--text-3)]">
                        <span style={{ color: s.delta >= 0 ? "var(--acc)" : "var(--rust)" }}>{s.delta >= 0 ? "▲" : "▼"} {signed(s.delta, currency)}</span>
                        {s.pct !== null ? ` · ${s.pct >= 0 ? "+" : ""}${s.pct.toFixed(1)}%` : ""}
                      </div>
                    ) : null}
                    <div className="mt-2 overflow-hidden rounded-[1px]" style={{ height: 2, background: "var(--bg-3)" }}>
                      <div style={{ height: "100%", width: `${s.width}%`, background: "var(--acc)" }} />
                    </div>
                  </div>
                ))}
                {snapshots.length === 0 ? (
                  <p className="py-6 text-center font-mono text-[12px] text-[color:var(--text-3)]">Sin snapshots.</p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Projection */}
          {projection?.available ? (
            <section className="panel" style={{ marginBottom: 24 }}>
              <div className="panel-head">
                <h3>Proyección</h3>
                <span className="meta">regresión lineal · {projMonths} meses</span>
              </div>
              <div className="flex items-center gap-2 px-4 pb-3">
                {[3, 6, 12].map((m) => (
                  <button
                    key={m}
                    className={`btn ${projMonths === m ? "primary" : "ghost"}`}
                    style={{ fontSize: 12, padding: "4px 14px" }}
                    onClick={async () => {
                      setProjMonths(m);
                      const r = await patrimonioApi.projection(m, 12, currency);
                      setProjection(r.data);
                    }}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <div className="overflow-auto px-4 pb-4">
                {(() => {
                  const all = [...projection.history, ...projection.projection];
                  const vals = all.map((p) => asNumber(p.value));
                  const max = Math.max(...vals, 1);
                  const min = Math.min(...vals, 0);
                  const span = max - min || 1;
                  const top = 20, bottom = 180, left = 40, right = 1160;
                  const stepX = all.length > 1 ? (right - left) / (all.length - 1) : 0;
                  const xy = all.map((p, i) => {
                    const x = left + i * stepX;
                    const y = bottom - ((asNumber(p.value) - min) / span) * (bottom - top);
                    return { x, y, value: asNumber(p.value), isProj: i >= projection.history.length, lower: "lower" in p ? asNumber((p as { lower: string }).lower) : null, upper: "upper" in p ? asNumber((p as { upper: string }).upper) : null, month: p.month };
                  });

                  const mainLine = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ");
                  const upperLine = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(0)},${(bottom - ((p.upper ?? p.value) - min) / span * (bottom - top)).toFixed(0)}`).join(" ");
                  const lowerLine = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(0)},${(bottom - ((p.lower ?? p.value) - min) / span * (bottom - top)).toFixed(0)}`).join(" ");

                  return (
                    <svg style={{ width: "100%", height: 200, display: "block" }} viewBox={`0 0 1200 200`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="pg2" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0" stopColor="#8B5CF6" stopOpacity="0.2" />
                          <stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <g stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4">
                        <line x1="40" y1="30" x2="1200" y2="30" />
                        <line x1="40" y1="80" x2="1200" y2="80" />
                        <line x1="40" y1="130" x2="1200" y2="130" />
                      </g>
                      {lowerLine && upperLine ? (
                        <>
                          <path d={`${upperLine} L${xy[xy.length - 1].x.toFixed(0)},${bottom} L${xy[0].x.toFixed(0)},${bottom} Z`} fill="rgba(139,92,246,0.06)" />
                          <path d={`${upperLine} L${[...xy].reverse().map((p) => `${p.x.toFixed(0)},${(bottom - ((p.lower ?? p.value) - min) / span * (bottom - top)).toFixed(0)}`).join(" ")} Z`} fill="rgba(139,92,246,0.08)" />
                        </>
                      ) : null}
                      <path d={mainLine} fill="none" stroke="#8B5CF6" strokeWidth="2" />
                      {xy[xy.length - 1] ? (
                        <>
                          <circle cx={xy[xy.length - 1].x} cy={xy[xy.length - 1].y} r="4" fill="#8B5CF6" />
                          <circle cx={xy[xy.length - 1].x} cy={xy[xy.length - 1].y} r="9" fill="#8B5CF6" opacity="0.15" />
                        </>
                      ) : null}
                      {xy.length > 0 && xy[0] ? (
                        <circle cx={xy[0].x} cy={xy[0].y} r="3" fill="#5EE9B5" />
                      ) : null}
                      <g fill="#807A6E" fontFamily="Geist Mono" fontSize="10" textAnchor="middle">
                        {xy.filter((_, i) => i % Math.max(1, Math.floor(xy.length / 8)) === 0).map((p) => (
                          <text key={p.month} x={p.x} y="196">{monthShortUpper(p.month)}</text>
                        ))}
                      </g>
                    </svg>
                  );
                })()}
              </div>
              {projection.slope_per_month !== undefined ? (
                <div className="mono px-4 pb-3 text-[11px] text-[color:var(--text-3)]">
                  Tendencia: {projection.slope_per_month >= 0 ? "▲" : "▼"} {signed(projection.slope_per_month, currency ?? "CLP")} / mes
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Account trend */}
          {(trend?.accounts.length ?? 0) > 0 ? (
            <section className="panel" style={{ marginBottom: 24 }}>
              <div className="panel-head">
                <h3>Tendencia por cuenta</h3>
                <span className="meta">12 meses</span>
              </div>
              <div className="flex flex-col">
                {(trend?.accounts ?? []).map((account) => {
                  const max = Math.max(1, ...account.points.map((p) => Math.abs(asNumber(p.balance))));
                  const up = asNumber(account.delta) >= 0;
                  return (
                    <div key={account.id} className="grid items-center border-b py-3 last:border-0" style={{ gridTemplateColumns: "1fr 160px auto", columnGap: 18, borderColor: "var(--line-2)" }}>
                      <div>
                        <div className="text-[13px] font-medium">{account.name}</div>
                        <div className="mono mt-0.5 text-[11px] uppercase text-[color:var(--text-3)]">{TYPE_LABELS[account.account_type] ?? account.account_type}</div>
                      </div>
                      <div className="flex h-8 items-end gap-1">
                        {account.points.map((point) => (
                          <span key={point.month} className="flex-1 rounded-[1px]" style={{ background: "var(--line-2)", height: `${Math.max(8, (Math.abs(asNumber(point.balance)) / max) * 100)}%` }} />
                        ))}
                      </div>
                      <div className="text-right" style={{ minWidth: 130 }}>
                        <div className="mono num text-[14px] font-medium">${plain(asNumber(account.current_balance), account.currency)}</div>
                        <div className="mono mt-0.5 text-[11px]" style={{ color: up ? "var(--acc)" : "var(--rust)" }}>
                          {signed(asNumber(account.delta), account.currency)} · {formatPercent(account.delta_percent)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function SideRow({ tone, label, valueClass, children }: { tone: string; label: string; valueClass?: string; children: React.ReactNode }) {
  const swColor = tone === "r" ? "var(--rust)" : tone === "g" ? "var(--gold)" : tone === "v" ? "var(--violet)" : "var(--acc)";
  const valColor = valueClass === "pos" ? "var(--acc)" : valueClass === "neg" ? "var(--rust)" : "var(--text)";
  return (
    <div className="flex items-baseline justify-between border-b py-3.5 last:border-0" style={{ borderColor: "var(--line-2)" }}>
      <div className="mono flex items-center gap-2 uppercase" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-3)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: swColor }} />{label}
      </div>
      <div className="font-light" style={{ fontSize: 22, letterSpacing: "-0.02em", color: valColor }}>{children}</div>
    </div>
  );
}
