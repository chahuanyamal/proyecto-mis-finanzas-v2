"use client";

import { categoriesApi, rulesApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type {
  Category,
  CategoryRule,
  CategoryRulePayload,
  RuleApplyResult,
  RulePreviewResult,
} from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const clpFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatAmount(value: string): string {
  const num = Number(value);
  return Number.isFinite(num) ? clpFormat.format(num) : value;
}

const emptyForm: CategoryRulePayload = {
  target_category_id: "",
  field: "description",
  operator: "contains",
  pattern: "",
  priority: 0,
};

const FIELD_LABELS: Record<string, string> = {
  description: "descripción",
  amount: "monto",
  account_type: "tipo cuenta",
};

const OPERATOR_LABELS: Record<string, string> = {
  contains: "contiene",
  equals: "=",
  starts_with: "empieza con",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function operatorLabel(op: string): string {
  return OPERATOR_LABELS[op] ?? op;
}

export default function RulesPage() {
  const { user } = useAuthStore();
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryRulePayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<RulePreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewSeq = useRef(0);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ id: string; result: RuleApplyResult } | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const [rulesResponse, categoriesResponse] = await Promise.all([rulesApi.list(), categoriesApi.list()]);
      setRules(rulesResponse.data);
      setCategories(categoriesResponse.data);
    } catch {
      setError("No se pudieron cargar las reglas.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user) void loadData();
  }, [user]);

  // Live preview with debounce; ignore stale responses.
  useEffect(() => {
    const pattern = form.pattern.trim();
    if (!pattern) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const seq = ++previewSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await rulesApi.preview({
          field: form.field,
          operator: form.operator,
          pattern,
        });
        if (seq === previewSeq.current) {
          setPreview(data);
          setPreviewLoading(false);
        }
      } catch {
        if (seq === previewSeq.current) {
          setPreview(null);
          setPreviewLoading(false);
        }
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.field, form.operator, form.pattern]);

  async function applyRule(id: string) {
    setApplyingId(id);
    setApplyResult(null);
    try {
      const { data } = await rulesApi.apply(id);
      setApplyResult({ id, result: data });
      await loadData();
    } catch {
      setError("No se pudo aplicar la regla a los históricos.");
    } finally {
      setApplyingId(null);
    }
  }

  function reset() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function edit(rule: CategoryRule) {
    setEditingId(rule.id);
    setForm({
      target_category_id: rule.target_category_id,
      field: rule.field,
      operator: rule.operator,
      pattern: rule.pattern,
      priority: rule.priority,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.target_category_id) {
      setError("Selecciona una categoría.");
      return;
    }
    try {
      if (editingId) await rulesApi.update(editingId, form);
      else await rulesApi.create(form);
      reset();
      await loadData();
    } catch {
      setError("No se pudo guardar la regla.");
    }
  }

  async function remove(id: string) {
    try {
      await rulesApi.remove(id);
      if (editingId === id) reset();
      await loadData();
    } catch {
      setError("No se pudo eliminar la regla.");
    }
  }

  const targetCategory = useMemo(
    () => categories.find((c) => c.id === form.target_category_id) ?? null,
    [categories, form.target_category_id],
  );

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Reglas de <span className="serif">auto-categorización</span>
          </h1>
          <div className="sub">
            {rules.length} reglas · asignan categoría automáticamente a tus movimientos
          </div>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="txt">{error}</div>
          </div>
          <span />
        </div>
      ) : null}

      <section className="strip">
        <div className="kpi on">
          <div className="lbl">
            <span className="sw" />
            Reglas totales
          </div>
          <div className="val num">{rules.length}</div>
          <div className="sub">configuradas</div>
        </div>
        <div className="kpi">
          <div className="lbl">
            <span className="sw" />
            Categorías destino
          </div>
          <div className="val num">{new Set(rules.map((r) => r.target_category_id)).size}</div>
          <div className="sub">cubiertas por reglas</div>
        </div>
        <div className="kpi v">
          <div className="lbl">
            <span className="sw" />
            Campos usados
          </div>
          <div className="val num">{new Set(rules.map((r) => r.field)).size}</div>
          <div className="sub">descripción · monto · ⋯</div>
        </div>
        <div className="kpi g">
          <div className="lbl">
            <span className="sw" />
            Prioridad máx.
          </div>
          <div className="val num">{rules.reduce((m, r) => Math.max(m, r.priority), 0)}</div>
          <div className="sub">orden de evaluación</div>
        </div>
      </section>

      {/* Builder sandbox */}
      <div
        className="rounded-[10px] border border-[color:var(--line)] bg-[color:var(--bg-2)] p-6"
        style={{ marginBottom: 24 }}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-2)]">
            {editingId ? "Editar regla" : "Constructor · arma una regla nueva"}
          </h3>
          {editingId ? (
            <button className="font-mono text-[11px] text-[color:var(--text-3)]" onClick={reset}>
              cancelar edición ✕
            </button>
          ) : (
            <span className="font-mono text-[11px] text-[color:var(--text-3)]">
              previsualiza la expresión en vivo
            </span>
          )}
        </div>

        <form onSubmit={save}>
          {/* Condition row */}
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <span className="min-w-9 font-mono text-[11px] text-[color:var(--text-3)]">SI</span>
            <select
              className="input"
              style={{ width: "auto" }}
              value={form.field}
              onChange={(e) => setForm((v) => ({ ...v, field: e.target.value }))}
            >
              <option value="description">descripción</option>
              <option value="amount">monto</option>
              <option value="account_type">tipo cuenta</option>
            </select>
            <select
              className="input"
              style={{ width: "auto" }}
              value={form.operator}
              onChange={(e) => setForm((v) => ({ ...v, operator: e.target.value }))}
            >
              <option value="contains">contiene</option>
              <option value="equals">es igual a</option>
              <option value="starts_with">empieza con</option>
            </select>
            <input
              className="input"
              style={{ flex: "1 1 200px" }}
              placeholder="patrón… ej. COPEC"
              value={form.pattern}
              onChange={(e) => setForm((v) => ({ ...v, pattern: e.target.value }))}
              required
            />
          </div>

          {/* Target row */}
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <span className="min-w-9 font-mono text-[11px] text-[color:var(--text-3)]">→</span>
            <span className="font-mono text-[12px] text-[color:var(--text-3)]">categoría =</span>
            <select
              className="input"
              style={{ flex: "1 1 200px" }}
              value={form.target_category_id}
              onChange={(e) => setForm((v) => ({ ...v, target_category_id: e.target.value }))}
              required
            >
              <option value="">Categoría destino…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <span className="font-mono text-[12px] text-[color:var(--text-3)]">prioridad</span>
            <input
              className="input"
              style={{ width: 90 }}
              type="number"
              value={form.priority}
              onChange={(e) => setForm((v) => ({ ...v, priority: Number(e.target.value) }))}
            />
          </div>

          {/* Live preview */}
          <div className="mt-4 flex flex-wrap items-center gap-3.5 rounded-[7px] border border-[color:var(--line-2)] bg-[color:var(--bg)] px-4 py-3.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
              Vista previa
            </span>
            <span className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-[color:var(--text-2)]">
              <span className="text-[color:var(--text-3)]">si</span>
              <span className="font-medium text-[color:var(--text)]">{fieldLabel(form.field)}</span>
              <span className="text-[color:var(--text-3)]">{operatorLabel(form.operator)}</span>
              <span
                className="rounded border px-1.5 py-0.5"
                style={{
                  color: "var(--acc)",
                  background: "rgba(94,233,181,0.06)",
                  borderColor: "rgba(94,233,181,0.18)",
                }}
              >
                {form.pattern ? `"${form.pattern}"` : "…"}
              </span>
              <span className="text-[color:var(--text-3)]">→</span>
              <span className="chip g">
                <span className="sw" style={{ background: targetCategory?.color ?? undefined }} />
                {targetCategory?.name ?? "destino"}
              </span>
            </span>
            <div className="ml-auto flex items-center gap-3">
              {form.pattern.trim() ? (
                previewLoading ? (
                  <span className="flex items-center gap-1.5 font-mono text-[12px] text-[color:var(--text-3)]">
                    <Loader2 className="animate-spin" size={13} /> contando…
                  </span>
                ) : preview ? (
                  <span className="font-mono text-[12px]" style={{ color: "var(--acc)" }}>
                    {preview.count} coincidencias
                    <span className="text-[color:var(--text-3)]">
                      {" "}
                      · {preview.uncategorized} sin categoría
                    </span>
                  </span>
                ) : null
              ) : null}
              <button type="submit" className="btn primary">
                {editingId ? "Guardar cambios" : "Guardar regla"}
              </button>
            </div>
          </div>

          {form.pattern.trim() && preview && preview.samples.length > 0 ? (
            <div className="mt-2.5 flex flex-col gap-1 rounded-[7px] border border-[color:var(--line-2)] bg-[color:var(--bg)] px-4 py-3">
              <span className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
                Ejemplos
              </span>
              {preview.samples.slice(0, 3).map((sample) => (
                <div
                  key={sample.id}
                  className="flex items-center justify-between gap-3 font-mono text-[12px] text-[color:var(--text-2)]"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="h-[5px] w-[5px] shrink-0 rounded-full"
                      style={{ background: sample.has_category ? "var(--text-3)" : "var(--gold)" }}
                    />
                    <span className="truncate">{sample.description}</span>
                  </span>
                  <span className="shrink-0 text-[color:var(--text)]">{formatAmount(sample.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </form>
      </div>

      {/* Rules table */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 font-mono text-[13px] text-[color:var(--text-3)]">
          <Loader2 className="animate-spin" size={18} /> Cargando reglas…
        </div>
      ) : rules.length === 0 ? (
        <div className="tbl">
          <div className="empty">
            <div className="empty-mark">∅</div>
            <h4>Aún no hay reglas</h4>
            <p>Arma la primera con el constructor de arriba para auto-categorizar.</p>
          </div>
        </div>
      ) : (
        <div className="tbl">
          <div className="grid grid-cols-[90px_1fr_220px_90px_160px_32px] gap-3.5 px-4 tbl-head">
            <div>Alcance</div>
            <div>Regla</div>
            <div>Destino</div>
            <div className="r">Prioridad</div>
            <div />
            <div />
          </div>
          {rules.map((rule) => {
            const cat = rule.target_category ?? categories.find((c) => c.id === rule.target_category_id) ?? null;
            return (
              <div
                key={rule.id}
                className="grid cursor-pointer grid-cols-[90px_1fr_220px_90px_160px_32px] items-center gap-3.5 border-b border-[color:var(--line-2)] px-4 py-3.5 last:border-0 hover:bg-[color:var(--bg-3)]"
                onClick={() => edit(rule)}
              >
                <div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]"
                    style={{
                      color: "var(--acc)",
                      background: "rgba(94,233,181,0.1)",
                      borderColor: "rgba(94,233,181,0.3)",
                    }}
                  >
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    Tuya
                  </span>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-[color:var(--text)]">
                    {cat?.name ?? "Regla"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-[color:var(--text-2)]">
                    <span className="text-[color:var(--text-3)]">si</span>
                    <span className="font-medium text-[color:var(--text)]">{fieldLabel(rule.field)}</span>
                    <span className="text-[color:var(--text-3)]">{operatorLabel(rule.operator)}</span>
                    <span
                      className="rounded border px-1.5 py-0.5"
                      style={{
                        color: "var(--acc)",
                        background: "rgba(94,233,181,0.06)",
                        borderColor: "rgba(94,233,181,0.18)",
                      }}
                    >
                      &quot;{rule.pattern}&quot;
                    </span>
                  </div>
                </div>
                <div>
                  <span className="chip g">
                    <span className="sw" style={{ background: cat?.color ?? undefined }} />
                    {cat?.name ?? rule.target_category_id}
                  </span>
                </div>
                <div className="r font-mono text-[14px] font-medium text-[color:var(--text-2)]">{rule.priority}</div>
                <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    disabled={applyingId === rule.id}
                    onClick={() => void applyRule(rule.id)}
                  >
                    {applyingId === rule.id ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="animate-spin" size={12} /> aplicando…
                      </span>
                    ) : (
                      "Aplicar a históricos"
                    )}
                  </button>
                  {applyResult && applyResult.id === rule.id ? (
                    <span className="font-mono text-[10px]" style={{ color: "var(--acc)" }}>
                      Actualizados {applyResult.result.updated} de {applyResult.result.matched}
                    </span>
                  ) : null}
                </div>
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <ConfirmButton
                    title="Eliminar regla"
                    description="Los movimientos ya categorizados no cambiarán."
                    confirmLabel="Eliminar"
                    onConfirm={() => remove(rule.id)}
                    className="text-[color:var(--text-3)] hover:text-[color:var(--rust)]"
                  >
                    ✕
                  </ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
