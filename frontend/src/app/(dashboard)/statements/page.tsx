"use client";

import { accountsApi, statementsApi } from "@/lib/api";
import type { Account, ParserOption, StatementQualityStats, StatementUpload } from "@/lib/api-types";
import type { StatementPreview } from "@/lib/api-types";
import StatementPreviewCard from "@/components/statements/StatementPreviewCard";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Upload } from "lucide-react";
import Link from "next/link";
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

// Tipo de archivo a partir de la extensión → glyph + tono del file-mark.
function fileKind(filename: string): { label: string; tone: "pdf" | "csv" | "xls" | "ofx" } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") return { label: "CSV", tone: "csv" };
  if (ext === "xls" || ext === "xlsx") return { label: "XLS", tone: "xls" };
  if (ext === "ofx" || ext === "qif") return { label: "OFX", tone: "ofx" };
  return { label: "PDF", tone: "pdf" };
}
const FILE_TONE: Record<string, string> = {
  pdf: "var(--rust)",
  csv: "var(--acc)",
  xls: "var(--gold)",
  ofx: "var(--violet)",
};

// Estado → barra de progreso (ancho + color) y meta legible.
function statusProgress(status: string): { width: string; color: string } {
  const s = status.toLowerCase();
  if (s.includes("process") && !s.includes("ed")) return { width: "62%", color: "var(--gold)" };
  if (s === "pending") return { width: "62%", color: "var(--gold)" };
  if (s === "error" || s.includes("fail")) return { width: "34%", color: "var(--rust)" };
  if (s === "cancelled") return { width: "100%", color: "var(--text-3)" };
  return { width: "100%", color: "var(--acc)" };
}

export default function StatementsPage() {
  const { user } = useAuthStore();
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
            <p className="mono" style={{ fontSize: 12, color: "var(--text-3)", letterSpacing: "0.04em" }}>SOPORTE PDF · DETECCIÓN AUTOMÁTICA DE BANCO · <span style={{ color: "var(--text-2)" }}>REVISA Y EDITA FILAS ANTES DE CONFIRMAR</span></p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {["PDF", "CSV", "XLSX", "OFX", "QIF"].map((f) => (
                <span key={f} className="mono" style={{ fontSize: 10, color: "var(--text-3)", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 7px", background: "var(--bg)" }}>{f}</span>
              ))}
            </div>
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
                    className="mono"
                    title={row.account.name}
                    style={{ fontSize: 11, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}
                  >
                    <span style={{ flex: "0 0 7px", width: 7, height: 7, borderRadius: 2, background: row.account.account_type === "credit" ? "var(--rust)" : "var(--acc)" }} />
                    {row.account.name}
                  </div>
                  {row.cells.map((cell) => {
                    const visual =
                      cell.state === "ok"
                        ? { bg: "rgba(94,233,181,0.7)", color: "var(--bg)", weight: 600, glyph: "✓" }
                        : cell.state === "partial"
                          ? { bg: "rgba(230,184,92,0.5)", color: "var(--bg)", weight: 600, glyph: "·" }
                          : cell.state === "missing"
                            ? { bg: "rgba(232,122,91,0.15)", color: "var(--rust)", weight: 400, glyph: "!" }
                            : { bg: "var(--bg-3)", color: "var(--text-3)", weight: 400, glyph: "·" };
                    const stateLabel =
                      cell.state === "ok" ? "cubierto" : cell.state === "partial" ? "parcial" : cell.state === "future" ? "futuro" : "sin cartola";
                    return (
                      <div
                        key={cell.month.key}
                        className="mono"
                        title={`${row.account.name} · ${cell.month.key} · ${stateLabel}`}
                        style={{
                          height: 24,
                          borderRadius: 3,
                          background: visual.bg,
                          opacity: cell.state === "future" ? 0.4 : 1,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 9,
                          color: visual.color,
                          fontWeight: visual.weight,
                          transition: "transform 0.1s",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        {visual.glyph}
                      </div>
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
        <div className="tbl-head" style={{ display: "grid", gridTemplateColumns: "38px 1fr 220px 180px 140px 90px 32px", gap: 14 }}>
          <div />
          <div>Archivo</div>
          <div>Cuenta</div>
          <div>Estado</div>
          <div>Período</div>
          <div className="r">Banco</div>
          <div />
        </div>

        {byMonth.map(([month, items]) => {
          const allOk = items.every((s) => statusChip(s.status) === "ok");
          return (
            <div key={month}>
              {/* timeline-head */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "var(--bg)", borderBottom: "1px solid var(--line-2)" }}>
                <span className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>{month}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{items.length} cartola(s){allOk ? " · todas OK" : ""}</span>
              </div>
              {items.map((s) => {
                const acc = accounts.find((a) => a.id === s.account_id);
                const accName = acc?.name;
                const isCredit = acc?.account_type === "credit";
                const kind = fileKind(s.filename);
                const tone = kind.tone;
                const chipTone = statusChip(s.status);
                const prog = statusProgress(s.status);
                const isErr = chipTone === "err";
                const isWarn = chipTone === "warn";
                return (
                  <Link
                    key={s.id}
                    href={`/statements/${s.id}`}
                    className="tbl-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "38px 1fr 220px 180px 140px 90px 32px",
                      gap: 14,
                      textDecoration: "none",
                      color: "inherit",
                      background: isErr ? "rgba(232,122,91,0.04)" : isWarn ? "rgba(230,184,92,0.03)" : undefined,
                    }}
                  >
                    {/* file-mark: 38×46 con corner-fold via gradient */}
                    <div
                      className="mono"
                      style={{
                        width: 38,
                        height: 46,
                        background: "var(--bg-3)",
                        border: "1px solid var(--line)",
                        borderRadius: 5,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        color: FILE_TONE[tone],
                        position: "relative",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          width: 10,
                          height: 10,
                          background: "linear-gradient(135deg, transparent 50%, var(--bg) 50%)",
                          borderLeft: "1px solid var(--line)",
                          borderBottom: "1px solid var(--line)",
                        }}
                      />
                      {kind.label}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.filename}
                        {s.bank_detected ? <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", background: "var(--bg-3)", padding: "1px 6px", borderRadius: 99, fontWeight: 400 }}>{s.bank_detected.toUpperCase()}</span> : null}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 10 }}>
                        <span>{kind.label}</span>
                      </div>
                    </div>
                    <div className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: isCredit ? "var(--rust)" : "var(--acc)" }} />
                      <span>{accName ?? "—"}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className={`chip ${chipTone}`}><span className="sw" />{s.status}</span>
                      <div style={{ width: "100%", height: 3, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: prog.width, background: prog.color }} />
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
                      {s.period_start && s.period_end ? `${s.period_start} → ${s.period_end}` : "—"}
                    </div>
                    <div className="mono r" style={{ fontSize: 11, color: "var(--text-3)" }}>{s.bank_detected ?? "—"}</div>
                    <div className="r" onClick={(e) => e.preventDefault()} style={{ color: "var(--text-3)", fontSize: 14 }}>
                      <button className="btn ghost" style={{ padding: "4px 8px" }} title="Reprocesar" onClick={(e) => { e.preventDefault(); void reprocess(s.id); }}>⟳</button>
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
        {statements.length === 0 ? (
          <div className="empty"><div className="empty-mark">∅</div><h4>Sin cartolas</h4><p>No hay cartolas importadas. Sube un PDF para comenzar.</p></div>
        ) : null}
      </div>
    </div>
  );
}
