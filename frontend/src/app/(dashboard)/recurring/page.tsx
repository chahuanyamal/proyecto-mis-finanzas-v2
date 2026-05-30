"use client";

import { categoriesApi, recurringApi } from "@/lib/api";
import type { Category, Recurring, RecurringDetectResult, RecurringPayload, UpcomingRecurring } from "@/lib/api-types";
import { asNumber, plain } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";

const FREQ_LABELS: Record<string, string> = { weekly: "Semanal", monthly: "Mensual", yearly: "Anual" };
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const LOGO_COLORS = ["#1DB954", "#E50914", "#10A37F", "#FF9900", "#5865F2", "#B49CFF", "#7AB0FF", "#E6B85C", "#06B6D4", "#FF6900"];
const emptyForm: RecurringPayload = {
  name: "", amount: "10000", currency: "CLP", frequency: "monthly",
  movement_type: "expense", category_id: "", next_date: "", active: true,
};

type Candidate = RecurringDetectResult["items"][number];

function normName(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" }).replace(".", "");
}
function annual(amount: number, frequency: string): number {
  if (frequency === "weekly") return amount * 52;
  if (frequency === "yearly") return amount;
  return amount * 12;
}
function monthlyEquiv(amount: number, frequency: string): number {
  if (frequency === "weekly") return amount * 52 / 12;
  if (frequency === "yearly") return amount / 12;
  return amount;
}

export default function RecurringPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RecurringPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [addingCandidate, setAddingCandidate] = useState<string | null>(null);

  const recurringQuery = useQuery({
    queryKey: ["recurring"],
    queryFn: async () => {
      const [r, c, u] = await Promise.all([recurringApi.list(), categoriesApi.list(), recurringApi.upcoming(45)]);
      return { items: r.data, categories: c.data, upcoming: u.data };
    },
    enabled: Boolean(user),
  });
  const candidatesQuery = useQuery({
    queryKey: ["recurring", "candidates"],
    queryFn: async () => (await recurringApi.candidates()).data.items,
    enabled: Boolean(user),
  });

  const items = useMemo<Recurring[]>(() => recurringQuery.data?.items ?? [], [recurringQuery.data]);
  const categories = useMemo<Category[]>(() => recurringQuery.data?.categories ?? [], [recurringQuery.data]);
  const upcoming = useMemo<UpcomingRecurring[]>(() => recurringQuery.data?.upcoming ?? [], [recurringQuery.data]);
  const candidates = useMemo<Candidate[]>(() => candidatesQuery.data ?? [], [candidatesQuery.data]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
    queryClient.invalidateQueries({ queryKey: ["nav-count", "recurring"] });
  }

  function reset() { setForm(emptyForm); setEditingId(null); setShowForm(false); }
  function startCreate() { setForm(emptyForm); setEditingId(null); setShowForm(true); }
  function edit(item: Recurring) {
    setEditingId(item.id);
    setForm({
      name: item.name, amount: item.amount, currency: item.currency, frequency: item.frequency,
      movement_type: item.movement_type, category_id: item.category_id ?? "", next_date: item.next_date ?? "", active: item.active,
    });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: RecurringPayload) => (editingId ? recurringApi.update(editingId, payload) : recurringApi.create(payload)),
    onSuccess: () => { reset(); invalidate(); },
  });
  const toggleMutation = useMutation({
    mutationFn: (item: Recurring) => recurringApi.update(item.id, { active: !item.active }),
    onSuccess: () => { invalidate(); },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => recurringApi.remove(id),
    onSuccess: () => { reset(); invalidate(); },
  });
  const detectMutation = useMutation({
    mutationFn: () => recurringApi.detect(),
    onSuccess: (res) => {
      setInfo(`Detección completa: ${res.data.created} recurrente(s) creado(s) de ${res.data.detected} detectado(s).`);
      invalidate();
    },
  });
  const addCandidateMutation = useMutation({
    mutationFn: (c: Candidate) =>
      recurringApi.create({
        name: c.name, amount: c.amount, currency: c.currency, frequency: c.frequency,
        movement_type: c.movement_type, next_date: c.next_date, active: true,
      }),
    onSettled: () => { setAddingCandidate(null); },
    onSuccess: () => { invalidate(); },
  });

  const busy = detectMutation.isPending;
  const error = recurringQuery.isError
    ? "No se pudieron cargar los recurrentes."
    : saveMutation.isError
      ? "No se pudo guardar el recurrente."
      : toggleMutation.isError
        ? "No se pudo actualizar."
        : removeMutation.isError
          ? "No se pudo eliminar."
          : detectMutation.isError
            ? "No se pudo detectar recurrentes."
            : addCandidateMutation.isError
              ? "No se pudo agregar el recurrente detectado."
              : "";

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({ ...form, category_id: form.category_id || null, next_date: form.next_date || null });
  }
  function toggleActive(item: Recurring) { toggleMutation.mutate(item); }
  function remove(id: string) { removeMutation.mutate(id); }
  function detect() { setInfo(""); detectMutation.mutate(); }
  function addCandidate(c: Candidate) {
    const key = `${normName(c.name)}|${c.amount}|${c.frequency}`;
    setAddingCandidate(key);
    addCandidateMutation.mutate(c);
  }

  // ── Derived data ──
  const activeItems = items.filter((i) => i.active);
  const expenses = activeItems.filter((i) => i.movement_type === "expense");
  const monthlyTotal = expenses.reduce((s, i) => s + monthlyEquiv(asNumber(i.amount), i.frequency), 0);
  const annualTotal = expenses.reduce((s, i) => s + annual(asNumber(i.amount), i.frequency), 0);
  const nextUp = [...upcoming].sort((a, b) => a.days_until - b.days_until)[0];

  // Candidatos detectados sin registrar: ocultar los que ya existen (nombre normalizado + monto aprox 2%)
  const newCandidates = candidates.filter((c) => {
    const cn = normName(c.name);
    const ca = asNumber(c.amount);
    return !items.some((it) => {
      if (normName(it.name) !== cn) return false;
      const ia = asNumber(it.amount);
      const tol = Math.max(Math.abs(ia) * 0.02, 1);
      return Math.abs(ia - ca) <= tol;
    });
  });

  // Calendar: current month, count charges per day from upcoming + next_date
  const today = new Date();
  const calYear = today.getFullYear();
  const calMonth = today.getMonth(); // 0-based
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayDay = today.getDate();

  const chargesByDay = useMemo(() => {
    const map: Record<number, number> = {};
    const consider = (iso: string | null) => {
      if (!iso) return;
      const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
      if (Number.isNaN(d.getTime())) return;
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        map[day] = (map[day] ?? 0) + 1;
      }
    };
    for (const u of upcoming) consider(u.due_date);
    return map;
  }, [upcoming, calYear, calMonth]);

  const chargeDayCount = Object.keys(chargesByDay).length;

  function hitClass(count: number): { bg: string; badge: string } {
    if (count >= 3) return { bg: "rgba(94,233,181,0.18)", badge: "var(--acc)" };
    if (count === 2) return { bg: "rgba(230,184,92,0.18)", badge: "var(--gold)" };
    return { bg: "rgba(180,156,255,0.15)", badge: "var(--violet)" };
  }

  // upcoming within 7 days as "this week"
  const thisWeek = upcoming.filter((u) => u.days_until <= 7);
  const sortedItems = [...items].sort((a, b) => monthlyEquiv(asNumber(b.amount), b.frequency) - monthlyEquiv(asNumber(a.amount), a.frequency));

  function statusFor(item: Recurring): { cls: string; label: string } {
    if (!item.active) return { cls: "dead", label: "Pausada" };
    const up = upcoming.find((u) => u.id === item.id);
    if (up) {
      if (up.days_until === 0) return { cls: "today", label: "Hoy" };
      if (up.days_until <= 7) return { cls: "soon", label: `${up.days_until}d` };
    }
    return { cls: "live", label: "Activa" };
  }

  function SubCard({ item, idx }: { item: Recurring; idx: number }) {
    const status = statusFor(item);
    const amount = asNumber(item.amount);
    const color = LOGO_COLORS[idx % LOGO_COLORS.length];
    const statusStyle: React.CSSProperties =
      status.cls === "live" ? { color: "var(--acc)", background: "rgba(94,233,181,0.1)" }
        : status.cls === "soon" ? { color: "var(--gold)", background: "rgba(230,184,92,0.12)" }
          : status.cls === "today" ? { color: "var(--bg)", background: "var(--acc)" }
            : { color: "var(--text-3)", background: "var(--bg-3)" };
    return (
      <div
        className="panel"
        style={{ padding: 18, cursor: "pointer", opacity: item.active ? 1 : 0.65, borderColor: status.cls === "soon" ? "rgba(230,184,92,0.3)" : status.cls === "today" ? "rgba(94,233,181,0.4)" : undefined, background: status.cls === "today" ? "linear-gradient(135deg, var(--bg-2), rgba(94,233,181,0.04))" : undefined }}
        onClick={() => edit(item)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div className="mono" style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, color: "white", background: color }}>
            {item.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em" }}>{item.name}</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
              {item.category_id ? categories.find((c) => c.id === item.category_id)?.name ?? "SUSCRIPCIÓN" : item.movement_type === "income" ? "INGRESO" : "SUSCRIPCIÓN"}
            </div>
          </div>
          <span className="mono" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, padding: "2px 7px", borderRadius: 99, ...statusStyle }}>{status.label}</span>
        </div>
        <div className="num mono" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400, marginRight: 5 }}>{item.currency}</span>
          {item.movement_type === "income" ? "+" : ""}{plain(amount)}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.04em", marginBottom: 14 }}>
          {FREQ_LABELS[item.frequency].toUpperCase()} · <span style={{ color: "var(--text-2)" }}>${plain(annual(amount, item.frequency))}/año</span>
        </div>
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--line-2)", fontSize: 11 }}>
          <span style={{ color: "var(--text-3)" }}>Próx.</span>
          <span style={{ color: "var(--text)", fontWeight: 500 }}>{item.next_date ? shortDate(item.next_date) : "—"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>Tus <span className="serif">suscripciones</span></h1>
          <div className="sub">
            {activeItems.length} activas · <strong>${plain(monthlyTotal)}/mes</strong> · <strong>${plain(annualTotal)} al año</strong>
            {upcoming.length > 0 ? <> · {upcoming.length} próximo{upcoming.length === 1 ? "" : "s"}</> : null}
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => detect()} disabled={busy}>{busy ? "Detectando…" : "¶ Detectar automático"}</button>
          <button className="btn primary" onClick={startCreate}>+ Nueva suscripción</button>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body"><div className="txt">{error}</div></div>
          <span />
        </div>
      ) : null}
      {info ? (
        <div className="insight ok" style={{ marginBottom: 20 }}>
          <div className="insight-mark serif">¶</div>
          <div className="insight-body"><div className="txt">{info}</div></div>
          <span />
        </div>
      ) : null}

      {newCandidates.length > 0 ? (
        <div className="insight" style={{ marginBottom: 20, alignItems: "flex-start", borderColor: "rgba(230,184,92,0.3)" }}>
          <div className="insight-mark" style={{ color: "var(--gold)" }}>¶</div>
          <div className="insight-body" style={{ flex: 1 }}>
            <div className="txt" style={{ marginBottom: 12 }}>
              <strong>{newCandidates.length} patrón{newCandidates.length === 1 ? "" : "es"} detectado{newCandidates.length === 1 ? "" : "s"} sin registrar</strong>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginLeft: 10 }}>Detectadas en tus movimientos · sin registrar</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {newCandidates.slice(0, 4).map((c) => {
                const key = `${normName(c.name)}|${c.amount}|${c.frequency}`;
                const adding = addingCandidate === key;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "var(--bg-3)", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span className="mono" style={{ fontSize: 13, color: c.movement_type === "income" ? "var(--acc)" : "var(--text)", fontWeight: 500 }}>
                      <span style={{ fontSize: 10, color: "var(--text-3)", marginRight: 4 }}>{c.currency}</span>
                      {c.movement_type === "income" ? "+" : ""}{plain(asNumber(c.amount))}
                    </span>
                    <span className="chip mono" style={{ fontSize: 10 }}>{FREQ_LABELS[c.frequency] ?? c.frequency}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{c.occurrences}× visto</span>
                    <button className="btn primary" style={{ padding: "4px 12px", fontSize: 12 }} disabled={adding} onClick={() => addCandidate(c)}>
                      {adding ? "Agregando…" : "+ Agregar"}
                    </button>
                  </div>
                );
              })}
            </div>
            {newCandidates.length > 4 ? (
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>+{newCandidates.length - 4} más · usa “Detectar automático” para registrarlos todos</div>
            ) : null}
          </div>
          <span />
        </div>
      ) : null}

      <section className="strip">
        <div className="kpi on">
          <div className="lbl"><span className="sw" />Activas</div>
          <div className="val num">{activeItems.length}</div>
          <div className="sub">{items.length} en total</div>
        </div>
        <div className="kpi r">
          <div className="lbl"><span className="sw" />Mensual</div>
          <div className="val"><span className="cu">CLP</span>{plain(monthlyTotal)}</div>
          <div className="sub">gasto recurrente fijo</div>
        </div>
        <div className="kpi g">
          <div className="lbl"><span className="sw" />Anual proyectado</div>
          <div className="val"><span className="cu">CLP</span>{plain(annualTotal)}</div>
          <div className="sub">a este ritmo de cobros</div>
        </div>
        <div className="kpi v">
          <div className="lbl"><span className="sw" />Próximo cobro</div>
          <div className="val" style={{ fontSize: 18 }}>{nextUp ? `${nextUp.name} · ${shortDate(nextUp.due_date)}` : "—"}</div>
          <div className="sub">{nextUp ? `en ${nextUp.days_until} día(s) · $${plain(asNumber(nextUp.amount))}` : "sin vencimientos"}</div>
        </div>
      </section>

      {/* Calendar */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h3>Calendario · {MONTH_NAMES[calMonth]} {calYear}</h3>
          <span className="meta">{upcoming.length} cobros próximos · distribuidos en <strong style={{ color: "var(--text)" }}>{chargeDayCount}</strong> día(s)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(31, 1fr)", gap: 3, marginBottom: 8 }}>
          {Array.from({ length: daysInMonth }, (_, k) => k + 1).map((d) => {
            const count = chargesByDay[d] ?? 0;
            const isToday = d === todayDay;
            const isPast = d < todayDay;
            const hit = count > 0 ? hitClass(count) : null;
            return (
              <div
                key={d}
                className="mono"
                style={{
                  height: 34, background: hit ? hit.bg : "var(--bg-3)", borderRadius: 3, position: "relative",
                  display: "flex", alignItems: "flex-start", padding: "3px 4px", fontSize: 9, color: "var(--text-4)",
                  outline: isToday ? "1.5px solid var(--acc)" : undefined, opacity: isPast && !hit ? 0.55 : 1,
                }}
              >
                {d}
                {count > 0 ? (
                  <span style={{ position: "absolute", bottom: 3, right: 3, fontSize: 8, color: "var(--bg)", background: hit!.badge, borderRadius: 99, padding: "1px 5px", fontWeight: 600, lineHeight: 1.2 }}>{count}</span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>
          <span>1</span>
          <div style={{ display: "flex", gap: 14 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(180,156,255,0.4)" }} />1 cargo</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(230,184,92,0.5)" }} />2 cargos</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(94,233,181,0.5)" }} />3+ cargos</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, outline: "1.5px solid var(--acc)", background: "var(--bg-3)" }} />Hoy</span>
          </div>
          <span>{daysInMonth}</span>
        </div>
      </div>

      {/* This week */}
      {thisWeek.length > 0 ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <h3 className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-2)", fontWeight: 500 }}>Próximos cobros · esta semana</h3>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{thisWeek.length} · ${plain(thisWeek.reduce((s, u) => s + asNumber(u.amount), 0))}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            {thisWeek.map((u, i) => {
              const matching = items.find((it) => it.id === u.id);
              const color = LOGO_COLORS[i % LOGO_COLORS.length];
              const isToday = u.days_until === 0;
              return (
                <div
                  key={`${u.id}-${u.due_date}`}
                  className="panel"
                  style={{ padding: 18, cursor: matching ? "pointer" : "default", borderColor: isToday ? "rgba(94,233,181,0.4)" : "rgba(230,184,92,0.3)", background: isToday ? "linear-gradient(135deg, var(--bg-2), rgba(94,233,181,0.04))" : undefined }}
                  onClick={() => matching && edit(matching)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div className="mono" style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, color: "white", background: color }}>{u.name.slice(0, 2).toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", marginTop: 2 }}>{FREQ_LABELS[u.frequency]}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, padding: "2px 7px", borderRadius: 99, ...(isToday ? { color: "var(--bg)", background: "var(--acc)" } : { color: "var(--gold)", background: "rgba(230,184,92,0.12)" }) }}>{isToday ? "Hoy" : shortDate(u.due_date)}</span>
                  </div>
                  <div className="num mono" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 2 }}>
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400, marginRight: 5 }}>{u.currency}</span>{plain(asNumber(u.amount))}
                  </div>
                  <div className="mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--line-2)", fontSize: 11 }}>
                    <span style={{ color: "var(--text-3)" }}>Próximo cobro</span>
                    <span style={{ color: isToday ? "var(--acc)" : "var(--gold)", fontWeight: 500 }}>en {u.days_until} día(s)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* All subscriptions */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, marginTop: 8 }}>
        <h3 className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-2)", fontWeight: 500 }}>Todas tus suscripciones · ordenadas por monto</h3>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="panel"><p className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>Sin recurrentes todavía. Crea el primero o usa la detección automática.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {sortedItems.map((item, i) => <SubCard key={item.id} item={item} idx={i} />)}
        </div>
      )}

      {/* Form panel */}
      {showForm ? (
        <div className="panel" style={{ maxWidth: 460 }}>
          <div className="panel-head">
            <h3>{editingId ? "Editar" : "Nuevo"} recurrente</h3>
          </div>
          <form onSubmit={save}>
            <div className="field">
              <label>Nombre</label>
              <input className="input" placeholder="Nombre (ej. Netflix)" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Monto</label>
              <input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select className="input" value={form.movement_type} onChange={(e) => setForm((v) => ({ ...v, movement_type: e.target.value as RecurringPayload["movement_type"] }))}>
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </div>
            <div className="field">
              <label>Frecuencia</label>
              <select className="input" value={form.frequency} onChange={(e) => setForm((v) => ({ ...v, frequency: e.target.value as RecurringPayload["frequency"] }))}>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </div>
            <div className="field">
              <label>Categoría</label>
              <select className="input" value={form.category_id ?? ""} onChange={(e) => setForm((v) => ({ ...v, category_id: e.target.value }))}>
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Moneda</label>
              <select className="input" value={form.currency} onChange={(e) => setForm((v) => ({ ...v, currency: e.target.value }))}>
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="field">
              <label>Próxima fecha</label>
              <input type="date" className="input" value={form.next_date ?? ""} onChange={(e) => setForm((v) => ({ ...v, next_date: e.target.value }))} />
            </div>
            {editingId ? (
              <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <label style={{ marginBottom: 0 }}>Activo</label>
                <div className={`toggle ${form.active ? "on" : ""}`} onClick={() => setForm((v) => ({ ...v, active: !v.active }))} />
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn primary">Guardar</button>
              <button type="button" className="btn ghost" onClick={reset}>Cancelar</button>
              {editingId ? (
                <>
                  <button type="button" className="btn ghost" onClick={() => { const it = items.find((i) => i.id === editingId); if (it) toggleActive(it); }}>{form.active ? "Pausar" : "Activar"}</button>
                  <button type="button" className="btn danger" style={{ marginLeft: "auto" }} onClick={() => remove(editingId)}>Eliminar</button>
                </>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
