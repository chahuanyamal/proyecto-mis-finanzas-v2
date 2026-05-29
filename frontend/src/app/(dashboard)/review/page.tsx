"use client";

import { categoriesApi, rulesApi, transactionsApi } from "@/lib/api";
import type { Category, Transaction } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type QueueTab = "all" | "uncategorized" | "flagged";

function fmt(value: string, currency = "CLP"): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(n);
}

function suggestedPattern(description: string): string {
  const clean = description
    .replace(/\b\d{2,}\b/g, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.split(" ").slice(0, 3).join(" ") || description.slice(0, 40);
}

type Drafts = Record<string, { categoryId: string; pattern: string }>;

const kbdStyle: CSSProperties = {
  display: "inline-block",
  border: "1px solid var(--line)",
  background: "var(--bg-2)",
  borderRadius: 3,
  padding: "1px 6px",
  fontSize: 10,
  margin: "0 2px",
  color: "var(--text-2)",
};

export default function ReviewPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [uncategorized, setUncategorized] = useState<Transaction[]>([]);
  const [flagged, setFlagged] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [tab, setTab] = useState<QueueTab>("all");
  const [cursor, setCursor] = useState(0);
  const [createRule, setCreateRule] = useState(true);

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/review"); }, [hasVerified, router, user]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [unc, flg, cat] = await Promise.all([
        transactionsApi.list({ only_uncategorized: true, exclude_internal: true, exclude_duplicates: true, limit: 200 }),
        transactionsApi.list({ only_flagged: true, limit: 100 }),
        categoriesApi.list(),
      ]);
      setUncategorized(unc.data);
      setFlagged(flg.data);
      setCategories(cat.data);
      setDrafts((current) => {
        const next = { ...current };
        for (const tx of unc.data) {
          if (!next[tx.id]) next[tx.id] = { categoryId: "", pattern: suggestedPattern(tx.description) };
        }
        return next;
      });
    } catch {
      setError("No se pudo cargar la bandeja de revision.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(); }, [user, load]);

  function updateDraft(id: string, changes: Partial<Drafts[string]>) {
    setDrafts((current) => {
      const existing = current[id] ?? { categoryId: "", pattern: "" };
      return { ...current, [id]: { ...existing, ...changes } };
    });
  }

  async function assign(tx: Transaction) {
    const categoryId = drafts[tx.id]?.categoryId;
    if (!categoryId) {
      setError("Selecciona una categoria primero.");
      return;
    }
    setBusyId(tx.id);
    setError("");
    setInfo("");
    try {
      await transactionsApi.update(tx.id, { category_id: categoryId });
      setInfo("Movimiento categorizado.");
      await load();
    } catch {
      setError("No se pudo categorizar el movimiento.");
    } finally {
      setBusyId(null);
    }
  }

  async function createRuleAndApply(tx: Transaction) {
    const draft = drafts[tx.id];
    if (!draft?.categoryId || !draft.pattern.trim()) {
      setError("Selecciona una categoria y define el patron de la regla.");
      return;
    }
    setBusyId(tx.id);
    setError("");
    setInfo("");
    try {
      await rulesApi.create({
        target_category_id: draft.categoryId,
        field: "description",
        operator: "contains",
        pattern: draft.pattern.trim(),
        priority: 100,
      });
      const { data } = await transactionsApi.autoCategorize();
      setInfo(`Regla creada. ${data.updated} movimiento(s) categorizado(s).`);
      await load();
    } catch {
      setError("No se pudo crear la regla.");
    } finally {
      setBusyId(null);
    }
  }

  async function applyRules() {
    setIsApplyingRules(true);
    setError("");
    setInfo("");
    try {
      const { data } = await transactionsApi.autoCategorize();
      setInfo(`Reglas aplicadas. ${data.updated} movimiento(s) actualizado(s).`);
      await load();
    } catch {
      setError("No se pudieron aplicar las reglas.");
    } finally {
      setIsApplyingRules(false);
    }
  }

  async function unflag(id: string) {
    setBusyId(id);
    try {
      await transactionsApi.setFlag(id, false);
      await load();
    } catch {
      setError("No se pudo desmarcar el movimiento.");
    } finally {
      setBusyId(null);
    }
  }

  // Cola unificada según pestaña. "flagged" muestra marcados; resto, sin categoría.
  const queue = useMemo<Transaction[]>(() => {
    if (tab === "flagged") return flagged;
    return uncategorized;
  }, [tab, uncategorized, flagged]);

  // Mantén el cursor dentro de rango cuando cambia la cola.
  useEffect(() => { setCursor((c) => (queue.length === 0 ? 0 : Math.min(c, queue.length - 1))); }, [queue.length]);

  const current = queue[cursor] ?? null;
  const isFlaggedView = tab === "flagged";

  // Aplica al item actual: crea regla (si está activo y hay patrón) o solo categoriza.
  const applyCurrent = useCallback(async (withRule: boolean) => {
    if (!current) return;
    const draft = drafts[current.id];
    if (withRule && draft?.categoryId && draft.pattern.trim()) await createRuleAndApply(current);
    else await assign(current);
  }, [current, drafts]);

  // Atajos de teclado: ↑/↓ navega, 1–9 elige categoría, ⏎ aplica+regla, ⇧⏎ solo este, S salta.
  useEffect(() => {
    if (isLoading) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (!queue.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, queue.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); setCursor((c) => Math.min(c + 1, queue.length - 1)); }
      else if (!isFlaggedView && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const cat = categories[idx];
        if (cat && current) updateDraft(current.id, { categoryId: cat.id });
      }
      else if (e.key === "Enter" && !isFlaggedView) { e.preventDefault(); void applyCurrent(!e.shiftKey); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, current, categories, isFlaggedView, isLoading, applyCurrent]);

  const draft = current ? (drafts[current.id] ?? { categoryId: "", pattern: suggestedPattern(current.description) }) : null;
  const isBusy = current ? busyId === current.id : false;
  const remaining = queue.length - cursor - 1;
  const progressPct = queue.length ? Math.round(((cursor + 1) / queue.length) * 100) : 0;
  const swColors = ["var(--violet)", "var(--blue)", "var(--acc)", "var(--gold)", "var(--rust)"];

  return (
    <main className="grid grid-cols-1 lg:grid-cols-[340px_1fr]" style={{ minHeight: "100%" }}>
      {/* Cola (izquierda) */}
      <div style={{ borderRight: "1px solid var(--line)", background: "var(--bg)", overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "24px 22px 16px", borderBottom: "1px solid var(--line)" }}>
          <h1 style={{ fontSize: 26 }}>Por <span className="serif" style={{ color: "var(--gold)" }}>revisar</span></h1>
          <div className="sub mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, letterSpacing: "0.04em" }}>
            {uncategorized.length + flagged.length} ITEMS · {uncategorized.length} SIN CAT · {flagged.length} MARCADOS
          </div>
          <button type="button" onClick={() => void applyRules()} disabled={isApplyingRules} className="btn ghost" style={{ marginTop: 12, width: "100%" }}>
            {isApplyingRules ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Aplicar reglas
          </button>
        </div>

        <div style={{ display: "flex", padding: "0 14px", borderBottom: "1px solid var(--line)" }}>
          {([
            { key: "all" as QueueTab, label: "Sin cat.", n: uncategorized.length },
            { key: "flagged" as QueueTab, label: "Marcados", n: flagged.length },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setCursor(0); }}
              className="mono"
              style={{ padding: "11px 11px", fontSize: 11, letterSpacing: "0.04em", cursor: "pointer", background: "transparent", border: 0, borderBottom: `2px solid ${tab === t.key ? "var(--acc)" : "transparent"}`, color: tab === t.key ? "var(--text)" : "var(--text-3)" }}
            >
              {t.label}<span style={{ marginLeft: 3, color: "var(--gold)", fontWeight: 500 }}>·{t.n}</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="mono" style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-3)", padding: 22 }}><Loader2 size={14} className="animate-spin" /> Cargando…</p>
        ) : queue.length === 0 ? (
          <div className="empty"><div className="empty-mark">✓</div><h4>Todo limpio</h4><p>No hay items pendientes en esta cola.</p></div>
        ) : (
          queue.map((tx, i) => (
            <div
              key={tx.id}
              onClick={() => setCursor(i)}
              style={{ padding: "14px 22px", borderBottom: "1px solid var(--line-2)", cursor: "pointer", position: "relative", background: i === cursor ? "var(--bg-3)" : undefined, borderLeft: i === cursor ? "2px solid var(--acc)" : "2px solid transparent" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginRight: 8 }}>{tx.description}</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: tx.movement_type === "income" ? "var(--acc)" : "var(--text)" }}>{tx.movement_type === "income" ? "+" : "−"}{fmt(tx.amount, tx.currency).replace(/[^\d.,-]/g, "")}</div>
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", display: "flex", gap: 10, letterSpacing: "0.04em" }}>
                <span>{tx.date}</span><span>·</span><span>{(tx.account?.name ?? "CUENTA").toUpperCase()}</span>
              </div>
              <div className="mono" style={{ marginTop: 6, fontSize: 11, color: "var(--gold)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--gold)" }} />
                {isFlaggedView ? (tx.flag_reason || "Marcado para revisar") : "Sin categoría · sin regla"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detalle (derecha) */}
      <div style={{ padding: "32px 48px 40px", overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div className="crumbs" style={{ marginBottom: 22 }}>
          <span>movimientos</span><span className="sep">/</span><span>por revisar</span><span className="sep">/</span>
          <span className="here">{queue.length ? `${String(cursor + 1).padStart(2, "0")} / ${String(queue.length).padStart(2, "0")}` : "0 / 0"}</span>
        </div>

        {error ? <div className="insight err" style={{ marginBottom: 16 }}><div className="insight-mark">!</div><div className="insight-body"><div className="txt">{error}</div></div><div /></div> : null}
        {info ? <div className="insight ok" style={{ marginBottom: 16 }}><div className="insight-mark">✓</div><div className="insight-body"><div className="txt">{info}</div></div><div /></div> : null}

        {!isFlaggedView ? (
          <div className="mono" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, fontSize: 11, color: "var(--text-3)" }}>
            <span>{queue.length ? `${String(cursor + 1).padStart(2, "0")} / ${String(queue.length).padStart(2, "0")}` : "0 / 0"}</span>
            <div style={{ flex: "0 1 240px", height: 2, background: "var(--bg-3)", borderRadius: 1, overflow: "hidden" }}><div style={{ height: "100%", background: "var(--acc)", width: `${progressPct}%` }} /></div>
            <span>{remaining < 0 ? 0 : remaining} RESTANTES</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
              <span><kbd className="mono" style={kbdStyle}>↑</kbd><kbd className="mono" style={kbdStyle}>↓</kbd> NAV</span>
              <span><kbd className="mono" style={kbdStyle}>1</kbd>–<kbd className="mono" style={kbdStyle}>9</kbd> CAT</span>
              <span><kbd className="mono" style={kbdStyle}>⏎</kbd> APLICAR</span>
              <span><kbd className="mono" style={kbdStyle}>S</kbd> SALTAR</span>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="panel mono" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)" }}><Loader2 size={16} className="animate-spin" /> Cargando bandeja…</div>
        ) : !current ? (
          <div className="empty"><div className="empty-mark">✓</div><h4>Todo categorizado</h4><p>Importa nuevas cartolas o revisa movimientos marcados.</p></div>
        ) : (
          <div className="panel" style={{ maxWidth: 780, padding: "36px 40px", position: "relative", overflow: "hidden", borderRadius: 14 }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gold)", display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gold)", boxShadow: "0 0 0 3px rgba(230,184,92,0.15)" }} />
              {isFlaggedView ? (current.flag_reason || "Marcado para revisar") : "Sin categoría · sin regla previa"}
            </div>
            <h2 style={{ fontSize: 38, fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: 8 }}>{current.description}</h2>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 24, padding: "6px 12px", background: "var(--bg)", borderRadius: 5, border: "1px solid var(--line-2)", display: "inline-block", letterSpacing: "0.06em" }}>{current.description.toUpperCase()}</div>

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 32, rowGap: 14, margin: "24px 0 28px", padding: "22px 0", borderTop: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)" }}>
              <dt className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", paddingTop: 4 }}>Monto</dt>
              <dd style={{ fontSize: 14, color: "var(--text)" }}><span style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.025em" }}>{current.movement_type === "income" ? "+" : "−"}{fmt(current.amount, current.currency)}</span> <span style={{ color: "var(--text-3)" }}>{current.currency}</span></dd>
              <dt className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", paddingTop: 4 }}>Fecha</dt>
              <dd style={{ fontSize: 14, color: "var(--text)" }}>{new Date(`${current.date}T00:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</dd>
              <dt className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", paddingTop: 4 }}>Cuenta</dt>
              <dd style={{ fontSize: 14, color: "var(--text)" }}>{current.account?.name ?? "—"}</dd>
            </dl>

            {isFlaggedView ? (
              <div className="actions" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                <button type="button" onClick={() => void unflag(current.id)} disabled={isBusy} className="btn primary lg">{isBusy ? "…" : "Desmarcar"}</button>
                <span className="mono skip" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }} onClick={() => setCursor((c) => Math.min(c + 1, queue.length - 1))}>Saltar · <kbd className="mono" style={kbdStyle}>S</kbd></span>
              </div>
            ) : (
              <>
                <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  Categoría
                  <span className="serif" style={{ color: "var(--acc)", textTransform: "none", letterSpacing: 0, fontSize: 13 }}>¶ elige o crea una regla</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                  {categories.map((category, idx) => {
                    const pick = draft?.categoryId === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => current && updateDraft(current.id, { categoryId: category.id })}
                        style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", border: `1px solid ${pick ? "var(--acc)" : "var(--line)"}`, borderRadius: 8, background: pick ? "var(--acc)" : "var(--bg)", cursor: "pointer", fontSize: 13, color: pick ? "var(--bg)" : "var(--text)", fontFamily: "inherit" }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: pick ? "var(--bg)" : swColors[idx % swColors.length] }} />
                        {category.name}
                        {idx < 9 ? <span className="mono" style={{ fontSize: 9, border: `1px solid ${pick ? "rgba(10,10,11,0.3)" : "var(--line)"}`, borderRadius: 3, padding: "0 5px", color: pick ? "rgba(10,10,11,0.7)" : "var(--text-3)" }}>{idx + 1}</span> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>Patrón de regla</div>
                <input
                  className="input"
                  style={{ marginBottom: 18, maxWidth: 420 }}
                  value={draft?.pattern ?? ""}
                  onChange={(e) => current && updateDraft(current.id, { pattern: e.target.value })}
                  placeholder="Patrón para la regla"
                />

                <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 22px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 24, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--acc)" }} />
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(94,233,181,0.1)", color: "var(--acc)", display: "grid", placeItems: "center" }} className="serif">¶</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                      Crear regla: descripción contiene <strong style={{ color: "var(--acc)" }}>&ldquo;{draft?.pattern || "…"}&rdquo;</strong>
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>aplica a futuros · revisable en /reglas</div>
                  </div>
                  <span className={`toggle${createRule ? " on" : ""}`} onClick={() => setCreateRule((v) => !v)} role="switch" aria-checked={createRule} />
                </div>

                <div className="actions" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                  <button type="button" onClick={() => void applyCurrent(createRule)} disabled={isBusy} className="btn primary lg">{isBusy ? "…" : "Aplicar y siguiente"}<kbd className="mono" style={kbdStyle}>⏎</kbd></button>
                  <button type="button" onClick={() => void assign(current)} disabled={isBusy} className="btn ghost lg">Solo este<kbd className="mono" style={kbdStyle}>⇧⏎</kbd></button>
                  <span className="mono skip" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }} onClick={() => setCursor((c) => Math.min(c + 1, queue.length - 1))}>Saltar · <kbd className="mono" style={kbdStyle}>S</kbd></span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
