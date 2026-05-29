"use client";

import { accountsApi, statementsApi } from "@/lib/api";
import type { Account, ParserOption, StatementQualityStats, StatementUpload } from "@/lib/api-types";
import type { StatementPreview } from "@/lib/api-types";
import StatementPreviewCard from "@/components/statements/StatementPreviewCard";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";

function monthLabel(s: StatementUpload): string {
  const ref = s.period_end ?? s.period_start;
  if (!ref) return "Sin período";
  return new Date(`${ref}T00:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

type CoverageState = "ok" | "partial" | "missing" | "future";

const MONTH_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function monthKey(iso: string): string {
  // iso like "2026-05-12" -> "2026-05"
  return iso.slice(0, 7);
}

export default function StatementsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<StatementUpload[]>([]);
  const [previews, setPreviews] = useState<StatementPreview[]>([]);
  const [parsers, setParsers] = useState<ParserOption[]>([]);
  const [qualityStats, setQualityStats] = useState<StatementQualityStats | null>(null);
  const [accountId, setAccountId] = useState("");
  const [parserKey, setParserKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/statements"); }, [hasVerified, router, user]);

  async function loadData() {
    const [acc, st, pr, parserOptions, quality] = await Promise.all([
      accountsApi.list(),
      statementsApi.list(),
      statementsApi.previews(),
      statementsApi.parsers(),
      statementsApi.qualityStats(),
    ]);
    setAccounts(acc.data);
    setStatements(st.data);
    setPreviews(pr.data);
    setParsers(parserOptions.data);
    setQualityStats(quality.data);
    if (!accountId && acc.data[0]) setAccountId(acc.data[0].id);
  }
  useEffect(() => { if (user) void loadData(); }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || !file) return;
    setIsBusy(true);
    setMessage("");
    try {
      const response = await statementsApi.preview(accountId, file, parserKey || undefined);
      const rows = response.data.rows.length;
      const bank = response.data.bank_detected ?? "desconocido";
      const mode = parserKey ? `parser forzado: ${parserKey}` : "parser automatico";
      setMessage(`Preview creado: ${rows} transacciones detectadas (banco: ${bank}, ${mode}).`);
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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of statements) counts[s.status] = (counts[s.status] ?? 0) + 1;
    return counts;
  }, [statements]);

  const byMonth = useMemo(() => {
    const map = new Map<string, StatementUpload[]>();
    for (const s of statements) { const k = monthLabel(s); if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); }
    return [...map.entries()];
  }, [statements]);

  // Coverage matrix: cuentas x últimos 12 meses
  const coverageMonths = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTH_ABBR[d.getMonth()] });
    }
    return months;
  }, []);

  const coverageMatrix = useMemo(() => {
    const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const isSuccess = (status: string): boolean => {
      const s = status.toLowerCase();
      return s === "processed" || (s.includes("process") && s.includes("ed")) || s === "imported" || s === "done";
    };
    return accounts.map((acc) => {
      const accStatements = statements.filter((s) => s.account_id === acc.id);
      const cells = coverageMonths.map((m) => {
        let state: CoverageState = m.key > currentKey ? "future" : "missing";
        let hasSuccess = false;
        let hasAny = false;
        for (const s of accStatements) {
          const start = s.period_start ? monthKey(s.period_start) : null;
          const end = s.period_end ? monthKey(s.period_end) : start;
          const ref = start ?? end;
          if (!ref) continue;
          const lo = start ?? end!;
          const hi = end ?? start!;
          const covers = m.key >= lo && m.key <= hi;
          if (covers) {
            hasAny = true;
            if (isSuccess(s.status)) hasSuccess = true;
          }
        }
        if (hasSuccess) state = "ok";
        else if (hasAny) state = "partial";
        return { month: m, state };
      });
      return { account: acc, cells };
    });
  }, [accounts, statements, coverageMonths]);

  const statusChip = (status: string): string => {
    const s = status.toLowerCase();
    if (s.includes("process") && !s.includes("ed")) return "warn";
    if (s === "error" || s.includes("fail")) return "err";
    if (s === "pending") return "warn";
    if (s === "cancelled") return "k";
    return "ok";
  };

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>Cartolas <span className="serif">importadas</span></h1>
          <div className="sub">
            {statements.length} archivos · {qualityStats?.transaction_count ?? 0} movimientos extraídos
            {statusCounts["error"] ? <> · <strong style={{ color: "var(--rust)" }}>{statusCounts["error"]} con problemas</strong></> : null}
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => fileInputRef.current?.click()}>+ Importar cartola</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="strip">
        <div className="kpi on">
          <div className="lbl"><span className="sw" />Importadas · todas</div>
          <div className="val num">{statusCounts["processed"] ?? 0}</div>
          <div className="sub">{statements.length} archivos en total</div>
        </div>
        <div className="kpi g">
          <div className="lbl"><span className="sw" />Procesando</div>
          <div className="val num">{(statusCounts["pending"] ?? 0) + (statusCounts["processing"] ?? 0)}</div>
          <div className="sub">{previews.length} previews pendientes</div>
        </div>
        <div className="kpi r">
          <div className="lbl"><span className="sw" />Con error</div>
          <div className="val num">{statusCounts["error"] ?? 0}</div>
          <div className="sub">revisar formato</div>
        </div>
        <div className="kpi v">
          <div className="lbl"><span className="sw" />Parsers usados</div>
          <div className="val num">{qualityStats?.by_parser.length ?? 0}</div>
          <div className="sub">{qualityStats?.transaction_count ?? 0} mov. importados</div>
        </div>
      </div>

      {/* Drop / upload zone */}
      <form onSubmit={submit} className="panel" style={{ marginBottom: 24, background: "linear-gradient(180deg, var(--bg-2), var(--bg))", border: "1.5px dashed var(--line-3)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(94,233,181,0.1)", color: "var(--acc)", display: "grid", placeItems: "center" }}>
            <Upload size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 400, marginBottom: 6 }}>Sube una cartola <span className="serif" style={{ color: "var(--acc)" }}>— preview antes de importar</span></h3>
            <p className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>SOPORTE PDF · DETECCIÓN AUTOMÁTICA DE BANCO · REVISA Y EDITA FILAS ANTES DE CONFIRMAR</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <select className="input" style={{ width: "auto", minWidth: 160 }} value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                <option value="">Cuenta</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select className="input" style={{ width: "auto", minWidth: 160 }} value={parserKey} onChange={(e) => setParserKey(e.target.value)} title="Deja automatico salvo que una cartola falle o se detecte mal.">
                <option value="">Parser automático</option>
                {parsers.map((parser) => <option key={parser.key} value={parser.key}>{parser.display_name}</option>)}
              </select>
              <input ref={fileInputRef} className="input" style={{ width: "auto" }} type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </div>
          </div>
          <button className="btn primary lg" disabled={isBusy}>
            {isBusy ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            Preview
          </button>
        </div>
        {message ? <p className="mono" style={{ marginTop: 14, fontSize: 12, color: "var(--text-2)", background: "var(--bg-3)", padding: "8px 12px", borderRadius: 6 }}>{message}</p> : null}
      </form>

      {/* Previews pendientes */}
      {previews.length > 0 ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 14 }}>Previews pendientes</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {previews.map((preview) => (
              <StatementPreviewCard key={preview.id} preview={preview} onChanged={loadData} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Coverage matrix */}
      {accounts.length > 0 ? (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <h3>Cobertura</h3>
            <span className="meta">12 meses</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "140px repeat(12, 1fr)", gap: 4, minWidth: 560 }}>
              {/* header row */}
              <div />
              {coverageMonths.map((m) => (
                <div
                  key={m.key}
                  className="mono"
                  title={m.key}
                  style={{ fontSize: 10, textAlign: "center", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4 }}
                >
                  {m.label}
                </div>
              ))}
              {/* account rows */}
              {coverageMatrix.map((row) => (
                <React.Fragment key={row.account.id}>
                  <div
                    title={row.account.name}
                    style={{ fontSize: 11, color: "var(--text-2)", display: "flex", alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}
                  >
                    {row.account.name}
                  </div>
                  {row.cells.map((cell) => {
                    const bg =
                      cell.state === "ok"
                        ? "rgba(94,233,181,0.18)"
                        : cell.state === "partial"
                          ? "rgba(230,184,92,0.18)"
                          : cell.state === "missing"
                            ? "rgba(232,122,91,0.12)"
                            : "var(--bg-3)";
                    const stateLabel =
                      cell.state === "ok" ? "cubierto" : cell.state === "partial" ? "parcial" : cell.state === "future" ? "futuro" : "sin cartola";
                    return (
                      <div
                        key={cell.month.key}
                        title={`${row.account.name} · ${cell.month.key} · ${stateLabel}`}
                        style={{
                          height: 24,
                          borderRadius: 4,
                          background: bg,
                          border: "1px solid var(--line)",
                          transition: "transform 0.12s ease",
                          cursor: "default",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
          {/* legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
            {([
              ["ok", "rgba(94,233,181,0.18)", "Cubierto"],
              ["partial", "rgba(230,184,92,0.18)", "Parcial"],
              ["missing", "rgba(232,122,91,0.12)", "Sin cartola"],
            ] as const).map(([k, c, l]) => (
              <span key={k} className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-3)" }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: c, border: "1px solid var(--line)" }} />
                {l}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Calidad por parser */}
      {(qualityStats?.by_parser.length ?? 0) > 0 ? (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <h3>Cobertura por parser</h3>
            <span className="meta">{qualityStats?.transaction_count ?? 0} movimientos importados</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {(qualityStats?.by_parser ?? []).map((item) => (
              <div key={item.parser} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 8 }}>
                <span style={{ fontSize: 13 }}>{item.parser}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{item.statements} cartola(s) · {item.transactions} mov.</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Tabla historial */}
      <div className="tbl">
        <div className="tbl-head" style={{ display: "grid", gridTemplateColumns: "1fr 200px 150px 180px 90px 110px", gap: 14 }}>
          <div>Archivo</div>
          <div>Cuenta</div>
          <div>Estado</div>
          <div>Período</div>
          <div className="r">Banco</div>
          <div className="r">Acción</div>
        </div>

        {byMonth.map(([month, items]) => (
          <div key={month}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "var(--bg)", borderBottom: "1px solid var(--line-2)" }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>{month}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{items.length} cartola(s)</span>
            </div>
            {items.map((s) => {
              const accName = accounts.find((a) => a.id === s.account_id)?.name;
              return (
                <Link
                  key={s.id}
                  href={`/statements/${s.id}`}
                  className="tbl-row"
                  style={{ display: "grid", gridTemplateColumns: "1fr 200px 150px 180px 90px 110px", gap: 14, textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.filename}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{accName ?? "—"}</div>
                  <div>
                    <span className={`chip ${statusChip(s.status)}`}><span className="sw" />{s.status}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
                    {s.period_start && s.period_end ? `${s.period_start} → ${s.period_end}` : "—"}
                  </div>
                  <div className="mono r" style={{ fontSize: 11, color: "var(--text-3)" }}>{s.bank_detected ?? "—"}</div>
                  <div className="r" onClick={(e) => e.preventDefault()}>
                    <button className="btn ghost" onClick={(e) => { e.preventDefault(); void reprocess(s.id); }}>Reprocesar</button>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
        {statements.length === 0 ? (
          <div className="empty"><div className="empty-mark">∅</div><h4>Sin cartolas</h4><p>No hay cartolas importadas. Sube un PDF para comenzar.</p></div>
        ) : null}
      </div>
    </div>
  );
}
