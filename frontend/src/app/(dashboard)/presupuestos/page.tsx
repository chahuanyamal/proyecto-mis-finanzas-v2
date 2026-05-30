"use client";

import { budgetsApi, categoriesApi, dashboardApi } from "@/lib/api";
import type { Budget, BudgetPayload, BudgetSuggestion, Category, MonthlyDashboard } from "@/lib/api-types";
import { asNumber, plain, shiftMonth, monthLabel, today, chipColor } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { FormEvent, useEffect, useMemo, useState } from "react";

function currentMonth(): string { return today().slice(0, 7); }
const emptyForm: BudgetPayload = { category_id: "", month: currentMonth(), amount: "100000", alert_at_percent: 80 };

const MARK_COLORS = ["#5EE9B5", "#E87A5B", "#E6B85C", "#7AB0FF", "#B49CFF", "#807A6E"];

export default function BudgetsPage() {
  const { user } = useAuthStore();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthly, setMonthly] = useState<MonthlyDashboard | null>(null);
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);
  const [form, setForm] = useState<BudgetPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function loadData(month = form.month) {
    try {
      const [budgetResponse, categoryResponse, monthlyResponse, suggestionResponse] = await Promise.all([
        budgetsApi.list(month),
        categoriesApi.list(),
        dashboardApi.monthly(month),
        budgetsApi.suggestions(month),
      ]);
      setBudgets(budgetResponse.data);
      setCategories(categoryResponse.data);
      setMonthly(monthlyResponse.data);
      setSuggestions(suggestionResponse.data);
    } catch { setError("No se pudieron cargar los presupuestos."); }
  }
  useEffect(() => { if (user) void loadData(); }, [user]);
  function reset() { setForm({ ...emptyForm, month: form.month }); setEditingId(null); setShowForm(false); }
  function edit(budget: Budget) { setEditingId(budget.id); setForm({ category_id: budget.category_id, month: budget.month, amount: budget.amount, alert_at_percent: budget.alert_at_percent }); setShowForm(true); }
  function startCreate(categoryId = "") { setEditingId(null); setForm({ ...emptyForm, month: form.month, category_id: categoryId }); setShowForm(true); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingId) await budgetsApi.update(editingId, { amount: form.amount, alert_at_percent: form.alert_at_percent });
      else await budgetsApi.create(form);
      reset(); await loadData(form.month);
    } catch { setError("No se pudo guardar el presupuesto. Puede existir uno para esa categoría y mes."); }
  }
  async function createFromSuggestion(s: BudgetSuggestion) {
    try {
      await budgetsApi.create({ category_id: s.category_id, month: form.month, amount: s.suggested_amount, alert_at_percent: 80 });
      await loadData(form.month);
    } catch { setError("No se pudo crear el presupuesto sugerido. Puede existir uno para esa categoría y mes."); }
  }
  async function remove(id: string) {
    try { await budgetsApi.remove(id); await loadData(); } catch { setError("No se pudo eliminar el presupuesto."); }
  }
  function changeMonth(delta: number) {
    const next = shiftMonth(form.month, delta);
    setForm((v) => ({ ...v, month: next }));
    void loadData(next);
  }

  // ── Derived data from monthly dashboard ──
  const mLabel = monthLabel(form.month);
  const today = new Date();
  const isCurrentMonth = form.month === currentMonth();
  const [yy, mm] = form.month.split("-").map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
  const monthPace = Math.round((dayOfMonth / daysInMonth) * 100);

  const dashBudgets = monthly?.budgets ?? [];
  const budgetById = useMemo(() => new Map(dashBudgets.map((b) => [b.id, b])), [dashBudgets]);

  const totalBudgeted = dashBudgets.reduce((s, b) => s + asNumber(b.amount), 0);
  const totalSpent = dashBudgets.reduce((s, b) => s + asNumber(b.spent), 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const exceededCount = dashBudgets.filter((b) => b.status === "exceeded").length;
  const overallPace = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;
  const paceDelta = overallPace - monthPace;

  // categories without a budget this month
  const budgetedCategoryIds = new Set(budgets.map((b) => b.category_id));
  const unbudgeted = categories.filter((c) => !budgetedCategoryIds.has(c.id));

  const tagClass = (status: string) => (status === "exceeded" ? "over" : status === "warning" ? "warn" : "ok");

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>Presupuestos <span className="serif">— {mLabel.name} {mLabel.year}</span></h1>
          <div className="sub">
            {budgets.length} presupuestos · gastaste <strong>${plain(totalSpent)}</strong> de <strong>${plain(totalBudgeted)}</strong>
            {exceededCount > 0 ? <> · <strong style={{ color: "var(--rust)" }}>{exceededCount} excedido{exceededCount === 1 ? "" : "s"}</strong></> : null}
            {" "}· día {dayOfMonth} de {daysInMonth}
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => startCreate()}>+ Nuevo presupuesto</button>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body"><div className="txt">{error}</div></div>
          <span />
        </div>
      ) : null}

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, padding: "16px 20px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10 }}>
        <button
          className="mono"
          onClick={() => changeMonth(-1)}
          aria-label="Mes anterior"
          style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-3)", border: "1px solid var(--line)", color: "var(--text-2)", display: "grid", placeItems: "center", cursor: "pointer" }}
        >‹</button>
        <div className="serif" style={{ fontStyle: "italic", fontSize: 30, letterSpacing: "-0.015em" }}>
          {mLabel.name}<span style={{ color: "var(--text-3)", fontSize: 22, marginLeft: 8 }}>{mLabel.year}</span>
        </div>
        <button
          className="mono"
          onClick={() => changeMonth(1)}
          aria-label="Mes siguiente"
          style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-3)", border: "1px solid var(--line)", color: "var(--text-2)", display: "grid", placeItems: "center", cursor: "pointer" }}
        >›</button>
        <div className="mono" style={{ marginLeft: 18, fontSize: 11, color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 2 }}>
          <span>DÍA {dayOfMonth} / {daysInMonth}</span>
          <span style={{ color: "var(--text)", fontSize: 13 }}>{monthPace}% del mes</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 24 }}>
          <div className="mono" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span className="label">Presupuestado</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 500 }}>${plain(totalBudgeted)}</span>
          </div>
          <div className="mono" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span className="label">Gastado</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 500, color: totalSpent > totalBudgeted ? "var(--rust)" : "var(--acc)" }}>${plain(totalSpent)}</span>
          </div>
          <div className="mono" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span className="label">Restante</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 500, color: totalRemaining < 0 ? "var(--rust)" : "var(--acc)" }}>${plain(totalRemaining)}</span>
          </div>
        </div>
      </div>

      {/* Pace bar */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head" style={{ alignItems: "baseline", marginBottom: 14 }}>
          <h3>Ritmo general · todos los presupuestos</h3>
          <span className="meta">
            Gastaste <strong style={{ color: "var(--text)" }}>{overallPace}%</strong> · esperaríamos <strong style={{ color: "var(--text)" }}>{monthPace}%</strong>
            {" "}· vas <strong style={{ color: paceDelta > 0 ? "var(--gold)" : "var(--acc)" }}>{paceDelta >= 0 ? "+" : ""}{paceDelta}pp {paceDelta >= 0 ? "por encima" : "por debajo"}</strong>
          </span>
        </div>
        <div style={{ height: 8, background: "var(--bg-3)", borderRadius: 4, overflow: "hidden", position: "relative", marginBottom: 10 }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: "var(--acc)", borderRadius: 4, width: `${Math.min(overallPace, 100)}%` }} />
          <div style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: "var(--text)", opacity: 0.7, left: `${Math.min(monthPace, 100)}%` }} />
        </div>
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
          <span>$0</span>
          <span><strong style={{ color: "var(--text)" }}>Hoy · día {dayOfMonth}</strong></span>
          <span>${plain(totalBudgeted)} · {daysInMonth} {mLabel.name.slice(0, 3)}</span>
        </div>
      </div>

      {/* Budgets grid */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 24 }}>
        {budgets.map((budget, i) => {
          const dash = budgetById.get(budget.id);
          const amount = asNumber(budget.amount);
          const spent = asNumber(dash?.spent);
          const percent = dash?.percent ?? (amount > 0 ? Math.round((spent / amount) * 100) : 0);
          const status = dash?.status ?? "ok";
          const tone = tagClass(status);
          const name = budget.category?.name ?? dash?.category_name ?? budget.category_id;
          const remaining = amount - spent;
          const mark = MARK_COLORS[i % MARK_COLORS.length];
          return (
            <div
              key={budget.id}
              className="panel"
              style={{ padding: "18px 20px", cursor: "pointer", borderColor: status === "exceeded" ? "rgba(232,122,91,0.3)" : status === "warning" ? "rgba(230,184,92,0.3)" : "rgba(94,233,181,0.18)" }}
              onClick={() => edit(budget)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div className="mono" style={{ width: 30, height: 30, borderRadius: 7, display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13, color: "white", background: mark }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                  {name}
                  <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--text-3)", fontWeight: 400, marginTop: 2, letterSpacing: "0.04em" }}>
                    ALERTA {budget.alert_at_percent}% · {budget.month}
                  </span>
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99,
                    color: tone === "over" ? "var(--rust)" : tone === "warn" ? "var(--gold)" : "var(--acc)",
                    background: tone === "over" ? "rgba(232,122,91,0.1)" : tone === "warn" ? "rgba(230,184,92,0.1)" : "rgba(94,233,181,0.1)",
                  }}
                >{percent}%</span>
              </div>
              <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden", position: "relative", marginBottom: 8 }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(percent, 100)}%`, background: status === "exceeded" ? "var(--rust)" : status === "warning" ? "var(--gold)" : "var(--acc)" }} />
                <div style={{ position: "absolute", top: -2, bottom: -2, width: 2, background: "var(--text-2)", opacity: 0.5, left: `${Math.min(monthPace, 100)}%` }} />
              </div>
              <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
                <span><span style={{ color: "var(--text)" }}>${plain(spent)}</span> / ${plain(amount)}</span>
                <span style={{ color: remaining < 0 ? "var(--rust)" : "var(--acc)" }}>
                  {remaining < 0 ? `$${plain(-remaining)} sobre el límite` : `$${plain(remaining)} restantes`}
                </span>
              </div>
            </div>
          );
        })}

        <div
          onClick={() => startCreate()}
          style={{ padding: "18px 20px", background: "transparent", border: "1.5px dashed var(--line)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", color: "var(--text-3)", fontSize: 13, minHeight: 140 }}
        >
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-3)", display: "grid", placeItems: "center", fontSize: 18 }}>+</div>
          <span>Nuevo presupuesto</span>
        </div>
      </section>

      {/* Presupuestos sugeridos */}
      {suggestions.length > 0 ? (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head" style={{ alignItems: "baseline", marginBottom: 14 }}>
            <h3>Presupuestos sugeridos</h3>
            <span className="meta">según tu gasto promedio reciente</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {suggestions.map((s) => (
              <div
                key={s.category_id}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--bg-3)", border: "1px solid var(--line)", borderRadius: 10 }}
              >
                <span className="chip">
                  <span className="sw" style={{ background: chipColor(s.category_name) }} />
                  {s.category_name}
                </span>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div className="mono num" style={{ fontSize: 15, fontWeight: 500 }}>${plain(s.suggested_amount)}</div>
                  <div className="mono text-3" style={{ fontSize: 11, color: "var(--text-3)" }}>prom. ${plain(s.avg_monthly)}/mes</div>
                </div>
                <button className="btn primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => void createFromSuggestion(s)}>
                  + Crear
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Categorías sin presupuesto */}
      {unbudgeted.length > 0 ? (
        <div className="panel">
          <div className="panel-head" style={{ alignItems: "baseline", marginBottom: 14 }}>
            <h3>Categorías sin presupuesto · sugeridas</h3>
            <span className="meta">crea un presupuesto desde cualquier categoría</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unbudgeted.map((c) => (
              <span
                key={c.id}
                onClick={() => startCreate(c.id)}
                className="mono"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", border: "1px dashed var(--line)", borderRadius: 99, background: "var(--bg)", fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}
              >
                <span style={{ color: "var(--acc)", fontSize: 14, lineHeight: 1 }}>+</span>{c.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Form modal/panel */}
      {showForm ? (
        <div className="panel" style={{ marginTop: 24, maxWidth: 460 }}>
          <div className="panel-head">
            <h3>{editingId ? "Editar" : "Nuevo"} presupuesto</h3>
          </div>
          <form onSubmit={save}>
            <div className="field">
              <label>Mes</label>
              <input type="month" className="input" value={form.month} onChange={(e) => { setForm((v) => ({ ...v, month: e.target.value })); void loadData(e.target.value); }} required disabled={Boolean(editingId)} />
            </div>
            <div className="field">
              <label>Categoría</label>
              <select className="input" value={form.category_id} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value }))} required disabled={Boolean(editingId)}>
                <option value="">Categoría</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Monto</label>
              <input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Alerta al %</label>
              <input type="number" min="1" max="100" className="input" value={form.alert_at_percent} onChange={(e) => setForm((v) => ({ ...v, alert_at_percent: Number(e.target.value) }))} required />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn primary">Guardar</button>
              <button type="button" className="btn ghost" onClick={reset}>Cancelar</button>
              {editingId ? <button type="button" className="btn danger" style={{ marginLeft: "auto" }} onClick={() => void remove(editingId)}>Eliminar</button> : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
