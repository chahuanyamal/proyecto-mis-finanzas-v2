"use client";

import { goalsApi } from "@/lib/api";
import type { Goal, GoalContribution, GoalDepositPayload, GoalPayload } from "@/lib/api-types";
import { asNumber, plain } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths } from "date-fns";
import { FormEvent, useEffect, useMemo, useState } from "react";

const emptyForm: GoalPayload = { name: "", target_amount: "1000000", current_amount: "0", currency: "CLP", target_date: "" };
const emptyDeposit: GoalDepositPayload = { amount: "10000", date: new Date().toISOString().slice(0, 10), note: "" };

const MARK_TONES = ["green", "gold", "violet", "blue"] as const;

function shortDate(iso: string): string {
  const d = parseDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }).toUpperCase().replace(".", "");
}
function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(d.getTime()) ? null : d;
}
function monthKey(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

// Aporte mensual promedio a partir del historial (últimos meses con aporte).
function monthlyRate(list: GoalContribution[]): number | null {
  const dated = list
    .map((c) => ({ amount: asNumber(c.amount), date: parseDate(c.date) }))
    .filter((c): c is { amount: number; date: Date } => c.date !== null && c.amount > 0);
  if (dated.length === 0) return null;
  const byMonth = new Map<string, number>();
  for (const c of dated) byMonth.set(monthKey(c.date), (byMonth.get(monthKey(c.date)) ?? 0) + c.amount);
  const months = [...byMonth.keys()].sort().reverse().slice(0, 6); // últimos ~6 meses con aporte
  if (months.length === 0) return null;
  const total = months.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
  return total / months.length;
}

export default function GoalsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GoalPayload>(emptyForm);
  const [depositForms, setDepositForms] = useState<Record<string, GoalDepositPayload>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [openDeposit, setOpenDeposit] = useState<string | null>(null);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const goalList = (await goalsApi.list()).data;
      const pairs = await Promise.all(
        goalList.map(async (goal) => [goal.id, (await goalsApi.contributions(goal.id)).data] as const),
      );
      return { goals: goalList, contributions: Object.fromEntries(pairs) as Record<string, GoalContribution[]> };
    },
    enabled: Boolean(user),
  });

  const goals = useMemo<Goal[]>(() => goalsQuery.data?.goals ?? [], [goalsQuery.data]);
  const contributions = useMemo<Record<string, GoalContribution[]>>(() => goalsQuery.data?.contributions ?? {}, [goalsQuery.data]);

  // Mantén un form de depósito por meta cuando aparecen nuevas metas.
  useEffect(() => {
    if (goals.length === 0) return;
    setDepositForms((current) => {
      const next = { ...current };
      for (const goal of goals) if (!next[goal.id]) next[goal.id] = emptyDeposit;
      return next;
    });
  }, [goals]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["goals"] });
  }

  function reset() { setForm(emptyForm); setEditingId(null); setShowForm(false); }
  function edit(goal: Goal) {
    setEditingId(goal.id);
    setForm({ name: goal.name, target_amount: goal.target_amount, current_amount: goal.current_amount, currency: goal.currency, target_date: goal.target_date ?? "" });
    setShowForm(true);
  }
  function startCreate() { setForm(emptyForm); setEditingId(null); setShowForm(true); }

  const saveMutation = useMutation({
    mutationFn: (payload: GoalPayload) => (editingId ? goalsApi.update(editingId, payload) : goalsApi.create(payload)),
    onSuccess: () => { reset(); invalidate(); },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => goalsApi.remove(id),
    onSuccess: () => { reset(); invalidate(); },
  });
  const depositMutation = useMutation({
    mutationFn: ({ goalId, payload }: { goalId: string; payload: GoalDepositPayload }) => goalsApi.deposit(goalId, payload),
    onSuccess: (_data, { goalId }) => {
      setDepositForms((current) => ({ ...current, [goalId]: emptyDeposit }));
      setOpenDeposit(null);
      invalidate();
    },
  });

  const error = goalsQuery.isError
    ? "No se pudieron cargar las metas."
    : saveMutation.isError
      ? "No se pudo guardar la meta."
      : removeMutation.isError
        ? "No se pudo eliminar la meta."
        : depositMutation.isError
          ? "No se pudo registrar el aporte."
          : "";

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({ ...form, target_date: form.target_date || null });
  }
  function remove(id: string) { removeMutation.mutate(id); }
  function setDeposit(goalId: string, changes: Partial<GoalDepositPayload>) {
    setDepositForms((current) => ({ ...current, [goalId]: { ...emptyDeposit, ...current[goalId], ...changes } }));
  }
  function deposit(goalId: string) {
    const payload = depositForms[goalId] ?? emptyDeposit;
    depositMutation.mutate({ goalId, payload: { ...payload, date: payload.date || null, note: payload.note || null } });
  }

  // ── Derived KPIs ──
  const totalTarget = goals.reduce((s, g) => s + asNumber(g.target_amount), 0);
  const totalSaved = goals.reduce((s, g) => s + asNumber(g.current_amount), 0);
  const completed = goals.filter((g) => g.percent >= 100).length;
  const active = goals.length - completed;
  const avgPercent = goals.length ? goals.reduce((s, g) => s + g.percent, 0) / goals.length : 0;
  const primaryCurrency = goals[0]?.currency ?? "CLP";

  const allContributions = useMemo(() => {
    const goalName = new Map(goals.map((g) => [g.id, g.name]));
    return Object.entries(contributions)
      .flatMap(([goalId, list]) => list.map((c) => ({ ...c, goalName: goalName.get(goalId) ?? "" })))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [contributions, goals]);
  const historyRows = allContributions.slice(0, 12);
  const historyTotal = allContributions.reduce((s, c) => s + asNumber(c.amount), 0);

  const featured = goals[0];
  const rest = goals.slice(1);

  function statusFor(goal: Goal): { cls: string; label: string } {
    if (goal.percent >= 100) return { cls: "done", label: "Completada" };
    if (goal.percent >= 67) return { cls: "ok", label: "A tiempo" };
    if (goal.percent >= 34) return { cls: "warn", label: "Algo atrasado" };
    return { cls: "risk", label: "En riesgo" };
  }
  function fillClass(goal: Goal): string {
    if (goal.percent >= 67) return "";
    if (goal.percent >= 34) return "warn";
    return "risk";
  }

  function DepositBox({ goal }: { goal: Goal }) {
    const depositForm = depositForms[goal.id] ?? emptyDeposit;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 26px 20px", borderTop: "1px solid var(--line-2)" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Monto aporte</label>
          <input type="number" step="0.01" className="input" value={depositForm.amount} onChange={(e) => setDeposit(goal.id, { amount: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Fecha</label>
          <input type="date" className="input" value={depositForm.date ?? ""} onChange={(e) => setDeposit(goal.id, { date: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0, gridColumn: "span 2" }}>
          <label>Nota</label>
          <input className="input" value={depositForm.note ?? ""} onChange={(e) => setDeposit(goal.id, { note: e.target.value })} placeholder="Nota (opcional)" />
        </div>
        <div style={{ gridColumn: "span 2", display: "flex", gap: 10 }}>
          <button className="btn primary" onClick={() => deposit(goal.id)}>+ Aportar</button>
          <button className="btn ghost" onClick={() => setOpenDeposit(null)}>Cerrar</button>
        </div>
      </div>
    );
  }

  function renderGoal(goal: Goal, idx: number, featured = false) {
    const status = statusFor(goal);
    const tone = MARK_TONES[idx % MARK_TONES.length];
    const target = asNumber(goal.target_amount);
    const current = asNumber(goal.current_amount);
    const remaining = target - current;

    // ── Tasa (aporte mensual promedio) y ETA proyectada ──
    const goalContribs = contributions[goal.id] ?? [];
    const rate = monthlyRate(goalContribs);
    const targetDate = parseDate(goal.target_date);
    let etaDate: Date | null = null;
    if (remaining > 0 && rate && rate > 0) {
      const monthsLeft = Math.ceil(remaining / rate);
      etaDate = addMonths(new Date(), monthsLeft);
    }
    // Adelanto (mint) si la ETA llega antes/igual que la fecha objetivo; atraso (rust) si después.
    const etaColor = etaDate && targetDate
      ? (etaDate.getTime() <= targetDate.getTime() ? "var(--acc)" : "var(--rust)")
      : "var(--text-2)";
    const etaLabel = remaining <= 0 ? "✓ logrado" : etaDate ? shortDate(etaDate.toISOString().slice(0, 10)) : "—";
    const rateLabel = rate && rate > 0 ? `$${plain(rate)}/mes` : "—";

    // Historial de aportes inline (mini bar chart) por mes — solo featured.
    const sparkMonths: { key: string; total: number }[] = (() => {
      if (!featured) return [];
      const byMonth = new Map<string, number>();
      for (const c of goalContribs) {
        const d = parseDate(c.date);
        if (!d) continue;
        byMonth.set(monthKey(d), (byMonth.get(monthKey(d)) ?? 0) + asNumber(c.amount));
      }
      return [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-8).map(([key, total]) => ({ key, total }));
    })();
    const sparkMax = sparkMonths.reduce((m, s) => Math.max(m, s.total), 0);

    return (
      <div
        key={goal.id}
        className="panel"
        style={{
          padding: 0,
          gridColumn: featured ? "span 2" : undefined,
          borderColor: featured ? "rgba(94,233,181,0.25)" : undefined,
          background: featured ? "linear-gradient(135deg, var(--bg-2), rgba(94,233,181,0.04))" : undefined,
          cursor: "pointer",
        }}
      >
        <div style={{ padding: "22px 26px 16px", display: "flex", alignItems: "flex-start", gap: 18 }} onClick={() => edit(goal)}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 12, display: "grid", placeItems: "center", flex: "0 0 48px",
              background: tone === "green" ? "rgba(94,233,181,0.12)" : tone === "gold" ? "rgba(230,184,92,0.12)" : tone === "violet" ? "rgba(180,156,255,0.12)" : "rgba(122,176,255,0.12)",
              color: tone === "green" ? "var(--acc)" : tone === "gold" ? "var(--gold)" : tone === "violet" ? "var(--violet)" : "var(--blue)",
              fontFamily: "var(--font-instrument-serif), serif", fontStyle: "italic", fontSize: 22,
            }}
          >
            {goal.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: featured ? 24 : 18, fontWeight: featured ? 400 : 500, letterSpacing: featured ? "-0.02em" : "-0.01em", marginBottom: 4 }}>{goal.name}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.04em", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span>{goal.target_date ? `META ${shortDate(goal.target_date)}` : "SIN FECHA · OBJETIVO ABIERTO"}</span>
              <span>·</span>
              <span>{goal.currency}</span>
            </div>
          </div>
          <span
            className="mono"
            style={{
              flex: "0 0 auto", padding: "4px 10px", borderRadius: 99, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500,
              color: status.cls === "ok" ? "var(--acc)" : status.cls === "warn" ? "var(--gold)" : status.cls === "risk" ? "var(--rust)" : "var(--text-2)",
              background: status.cls === "ok" ? "rgba(94,233,181,0.12)" : status.cls === "warn" ? "rgba(230,184,92,0.12)" : status.cls === "risk" ? "rgba(232,122,91,0.12)" : "rgba(255,255,255,0.06)",
            }}
          >{status.label}</span>
        </div>

        <div style={{ padding: "0 26px 22px" }} onClick={() => edit(goal)}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="num" style={{ fontSize: featured ? 44 : 30, fontWeight: featured ? 200 : 300, letterSpacing: "-0.02em" }}>
              <span className="mono" style={{ fontSize: 13, color: "var(--text-3)", marginRight: 6 }}>{goal.currency}</span>{plain(current)}
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right" }}>
              META<strong style={{ color: "var(--text-2)", display: "block", fontSize: 16, marginTop: 4, fontWeight: 500 }}>${plain(target)}</strong>
            </div>
          </div>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <div style={{ height: 8, background: "var(--bg-3)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  height: "100%", borderRadius: 4, width: `${Math.min(goal.percent, 100)}%`, position: "relative",
                  background: fillClass(goal) === "warn" ? "var(--gold)" : fillClass(goal) === "risk" ? "var(--rust)" : "var(--acc)",
                }}
              >
                <span style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, background: "var(--text)", opacity: 0.3, borderRadius: "0 4px 4px 0" }} />
              </div>
            </div>
            <div style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: "var(--text-2)", opacity: 0.5, left: "50%" }}>
              <span className="mono" style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9, letterSpacing: "0.06em", color: "var(--text-3)", whiteSpace: "nowrap" }}>MITAD</span>
            </div>
          </div>
          {featured && sparkMonths.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <span className="label" style={{ display: "block", marginBottom: 8, letterSpacing: "0.1em" }}>Aportes · últimos {sparkMonths.length} meses</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 48 }}>
                {sparkMonths.map((s) => (
                  <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${s.key}: $${plain(s.total)}`}>
                    <div
                      style={{
                        width: "100%", borderRadius: "3px 3px 0 0",
                        height: `${sparkMax > 0 ? Math.max(4, (s.total / sparkMax) * 36) : 4}px`,
                        background: "var(--acc)", opacity: 0.85,
                      }}
                    />
                    <span className="mono" style={{ fontSize: 8, color: "var(--text-3)" }}>{s.key.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, padding: "14px 26px", borderTop: "1px solid var(--line-2)", background: "rgba(0,0,0,0.15)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="label">Faltan</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{remaining > 0 ? `$${plain(remaining)}` : "✓ logrado"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="label">A este ritmo</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 500, color: etaColor }}>{etaLabel}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="label">Tasa</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 500, color: "var(--acc)" }}>{rateLabel}</span>
          </div>
        </div>

        <div style={{ padding: "0 26px 14px", display: "flex", gap: 10 }}>
          <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setOpenDeposit(openDeposit === goal.id ? null : goal.id); }}>+ Aportar</button>
        </div>
        {openDeposit === goal.id ? <DepositBox goal={goal} /> : null}
      </div>
    );
  }

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>Tus <span className="serif">metas</span></h1>
          <div className="sub">
            {active} activa{active === 1 ? "" : "s"} · {completed} completada{completed === 1 ? "" : "s"} · ahorrado <strong style={{ color: "var(--acc)" }}>${plain(totalSaved)}</strong> de ${plain(totalTarget)}
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={startCreate}>+ Nueva meta</button>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body"><div className="txt">{error}</div></div>
          <span />
        </div>
      ) : null}

      <section className="strip">
        <div className="kpi on">
          <div className="lbl"><span className="sw" />Activas</div>
          <div className="val num">{active}</div>
          <div className="sub">{completed} completada{completed === 1 ? "" : "s"}</div>
        </div>
        <div className="kpi">
          <div className="lbl"><span className="sw" />Total objetivo</div>
          <div className="val"><span className="cu">{primaryCurrency}</span>{plain(totalTarget)}</div>
          <div className="sub">monto agregado de metas</div>
        </div>
        <div className="kpi g">
          <div className="lbl"><span className="sw" />Aportado total</div>
          <div className="val"><span className="cu">{primaryCurrency}</span>{plain(totalSaved)}</div>
          <div className="sub">{allContributions.length} aporte{allContributions.length === 1 ? "" : "s"}</div>
        </div>
        <div className="kpi v">
          <div className="lbl"><span className="sw" />Avance promedio</div>
          <div className="val num">{avgPercent.toFixed(1)}%</div>
          <div className="sub">entre todas las metas</div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {featured ? renderGoal(featured, 0, true) : null}
        {rest.map((goal, i) => renderGoal(goal, i + 1, false))}

        <div
          onClick={startCreate}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 26px", background: "transparent", border: "1.5px dashed var(--line)", borderRadius: 14, cursor: "pointer", textAlign: "center", gap: 14, color: "var(--text-3)" }}
        >
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--bg-2)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 300 }}>+</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nueva meta</div>
          <div className="mono" style={{ fontSize: 11, lineHeight: 1.5 }}>define un objetivo, monto y fecha</div>
        </div>
      </section>

      {/* History */}
      <div className="panel">
        <div className="panel-head">
          <h3>Historial de aportes</h3>
          <span className="meta">{allContributions.length} movimientos · ${plain(historyTotal)} total</span>
        </div>
        {historyRows.length === 0 ? (
          <p className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>Aún no registras aportes.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {historyRows.map((row) => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 18, alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--line-2)" }}>
                <span className="mono" style={{ color: "var(--text-3)", fontSize: 10, letterSpacing: "0.06em" }}>{shortDate(row.date)}</span>
                <span style={{ fontSize: 13 }}>Aporte a <strong style={{ fontWeight: 500 }}>{row.goalName}</strong>{row.note ? <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}> · {row.note}</span> : null}</span>
                <span className="num" style={{ fontWeight: 500, color: "var(--acc)", textAlign: "right" }}>+${plain(asNumber(row.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form panel */}
      {showForm ? (
        <div className="panel" style={{ marginTop: 24, maxWidth: 460 }}>
          <div className="panel-head">
            <h3>{editingId ? "Editar" : "Nueva"} meta</h3>
          </div>
          <form onSubmit={save}>
            <div className="field">
              <label>Nombre</label>
              <input className="input" placeholder="Nombre" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Monto objetivo</label>
              <input type="number" step="0.01" className="input" value={form.target_amount} onChange={(e) => setForm((v) => ({ ...v, target_amount: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Ahorrado</label>
              <input type="number" step="0.01" className="input" value={form.current_amount} onChange={(e) => setForm((v) => ({ ...v, current_amount: e.target.value }))} />
            </div>
            <div className="field">
              <label>Moneda</label>
              <select className="input" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}>
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="field">
              <label>Fecha objetivo</label>
              <input type="date" className="input" value={form.target_date ?? ""} onChange={(e) => setForm((v) => ({ ...v, target_date: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn primary">Guardar</button>
              <button type="button" className="btn ghost" onClick={reset}>Cancelar</button>
              {editingId ? <button type="button" className="btn danger" style={{ marginLeft: "auto" }} onClick={() => remove(editingId)}>Eliminar</button> : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
