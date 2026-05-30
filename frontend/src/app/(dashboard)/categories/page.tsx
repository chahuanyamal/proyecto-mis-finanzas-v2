"use client";

import { categoriesApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { Category, CategoryPayload } from "@/lib/api-types";
import { initials } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const emptyForm: CategoryPayload = { name: "", parent_id: null, color: "#5EE9B5", icon: "tag" };

const SWATCHES = ["#5EE9B5", "#E6B85C", "#E87A5B", "#B49CFF", "#7AB0FF", "#FF6B9D", "#807A6E"];

export default function CategoriesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CategoryPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine" | "system">("all");

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await categoriesApi.list()).data,
    enabled: Boolean(user),
  });
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const isLoading = categoriesQuery.isPending;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["nav-count", "categories"] });
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function newCategory() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function edit(category: Category) {
    setEditingId(category.id);
    setForm({ name: category.name, parent_id: category.parent_id, color: category.color, icon: category.icon });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: (payload: CategoryPayload) =>
      editingId ? categoriesApi.update(editingId, payload) : categoriesApi.create(payload),
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => invalidate(),
  });

  const error = saveMutation.isError
    ? "No se pudo guardar la categoría."
    : removeMutation.isError
      ? "No se pudo eliminar. Puede estar en uso por transacciones o reglas."
      : categoriesQuery.isError
        ? "No se pudieron cargar las categorías."
        : "";

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...form, parent_id: form.parent_id || null, color: form.color || null, icon: form.icon || null };
    saveMutation.mutate(payload);
  }

  function remove(id: string) {
    removeMutation.mutate(id);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.filter((c) => {
      if (scopeFilter === "mine" && c.user_id === null) return false;
      if (scopeFilter === "system" && c.user_id !== null) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    });
  }, [categories, query, scopeFilter]);

  const mineCount = useMemo(() => categories.filter((c) => c.user_id !== null).length, [categories]);
  const systemCount = useMemo(() => categories.filter((c) => c.user_id === null).length, [categories]);

  const parents = useMemo(() => visible.filter((c) => !c.parent_id), [visible]);
  const orphans = useMemo(() => visible.filter((c) => c.parent_id), [visible]);
  const subCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of categories) {
      if (c.parent_id) map.set(c.parent_id, (map.get(c.parent_id) ?? 0) + 1);
    }
    return map;
  }, [categories]);

  const withColor = categories.filter((c) => c.color).length;

  // Matches the design's 6-column categories grid.
  const GRID = {
    display: "grid",
    gridTemplateColumns: "36px 1fr 280px 160px 90px 32px",
    gap: 14,
    alignItems: "center",
  } as const;

  function Row({ category }: { category: Category }) {
    const isSystem = category.user_id === null;
    const parent = categories.find((item) => item.id === category.parent_id);
    const subs = subCount.get(category.id) ?? 0;
    const childNames = categories
      .filter((c) => c.parent_id === category.id)
      .map((c) => c.name.toLowerCase());
    const subText = childNames.length > 0
      ? childNames.slice(0, 3).join(" · ")
      : parent
        ? `en ${parent.name.toLowerCase()}`
        : isSystem
          ? "categoría de sistema"
          : "categoría raíz";
    const tagLabel = subs > 0 ? `${subs} sub` : isSystem ? "interna" : "sin sub";
    return (
      <div
        className="cursor-pointer border-b border-[color:var(--line-2)] px-4 py-[13px] last:border-0 hover:bg-[color:var(--bg-3)]"
        style={GRID}
        onClick={() => (isSystem ? undefined : edit(category))}
      >
        <div
          className="grid h-7 w-7 place-items-center rounded-[7px] font-mono text-[13px] font-semibold text-white"
          style={{ background: category.color ?? "var(--bg-3)" }}
        >
          {initials(category.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-[color:var(--text)]">{category.name}</div>
          <div className="mt-[3px] flex items-center gap-2.5 font-mono text-[11px] text-[color:var(--text-3)]">
            <span className="rounded-full bg-[color:var(--bg-3)] px-1.5 py-px text-[10px] uppercase">
              {tagLabel}
            </span>
            <span className="truncate">{subText}</span>
          </div>
        </div>
        {/* Budget · uso — no budget data from API; show jerarquía descriptor in its place */}
        <div className="font-serif text-[13px] italic text-[color:var(--text-3)]">
          {parent ? `subcategoría · ${parent.name}` : "— sin presupuesto"}
        </div>
        {/* Movimiento mes — not provided by API */}
        <div className="text-right font-mono text-[15px] font-medium tabular-nums text-[color:var(--text-3)]">
          —
        </div>
        {/* % gasto — not provided by API */}
        <div className="text-right font-mono text-[13px] font-medium text-[color:var(--text-3)]">
          —
        </div>
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {isSystem ? (
            <span className="text-[color:var(--text-3)]" title="Solo lectura">
              🔒
            </span>
          ) : (
            <ConfirmButton
              title="Eliminar categoría"
              description="No se podrá eliminar si está en uso por transacciones o reglas."
              confirmLabel="Eliminar"
              onConfirm={() => remove(category.id)}
              className="text-[color:var(--text-3)] hover:text-[color:var(--rust)]"
            >
              ⋯
            </ConfirmButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Tus <span className="serif">categorías</span>
          </h1>
          <div className="sub">
            {categories.length} categorías · {parents.length} raíz · {orphans.length} subcategorías
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={newCategory}>
            + Nueva categoría
          </button>
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
            Total
          </div>
          <div className="val num">{categories.length}</div>
          <div className="sub">categorías configuradas</div>
        </div>
        <div className="kpi">
          <div className="lbl">
            <span className="sw" />
            Raíz
          </div>
          <div className="val num">{parents.length}</div>
          <div className="sub">categorías principales</div>
        </div>
        <div className="kpi v">
          <div className="lbl">
            <span className="sw" />
            Subcategorías
          </div>
          <div className="val num">{orphans.length}</div>
          <div className="sub">anidadas en una raíz</div>
        </div>
        <div className="kpi g">
          <div className="lbl">
            <span className="sw" />
            Con color
          </div>
          <div className="val num">{withColor}</div>
          <div className="sub">de {categories.length} con swatch</div>
        </div>
      </section>

      {showForm ? (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <h3>{editingId ? "Editar categoría" : "Nueva categoría"}</h3>
            <button className="meta" style={{ cursor: "pointer" }} onClick={resetForm}>
              cerrar ✕
            </button>
          </div>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input
                className="input"
                placeholder="ej. Supermercado"
                value={form.name}
                onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Categoría padre</label>
              <select
                className="input"
                value={form.parent_id ?? ""}
                onChange={(e) => setForm((v) => ({ ...v, parent_id: e.target.value || null }))}
              >
                <option value="">Sin padre</option>
                {categories
                  .filter((category) => category.id !== editingId)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Icono</label>
              <input
                className="input"
                placeholder="tag"
                value={form.icon ?? ""}
                onChange={(e) => setForm((v) => ({ ...v, icon: e.target.value }))}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Color</label>
              <div className="flex items-center gap-2">
                {SWATCHES.map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => setForm((v) => ({ ...v, color }))}
                    className="h-[22px] w-[22px] rounded-full"
                    style={{
                      background: color,
                      outline: form.color === color ? "2px solid var(--text)" : "none",
                      outlineOffset: 2,
                    }}
                    aria-label={color}
                  />
                ))}
                <input
                  className="input"
                  style={{ width: 110 }}
                  value={form.color ?? ""}
                  onChange={(e) => setForm((v) => ({ ...v, color: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn primary">
                {editingId ? "Guardar cambios" : "Crear categoría"}
              </button>
              <button type="button" className="btn ghost" onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {!isLoading && categories.length > 0 ? (
        <div className="filters">
          <div className="filt-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              placeholder="Buscar categoría por nombre…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="seg" style={{ marginLeft: "auto" }}>
            <button className={scopeFilter === "all" ? "on" : ""} onClick={() => setScopeFilter("all")}>
              Todas · {categories.length}
            </button>
            <button className={scopeFilter === "mine" ? "on" : ""} onClick={() => setScopeFilter("mine")}>
              Personales · {mineCount}
            </button>
            <button className={scopeFilter === "system" ? "on" : ""} onClick={() => setScopeFilter("system")}>
              Sistema · {systemCount}
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 font-mono text-[13px] text-[color:var(--text-3)]">
          <Loader2 className="animate-spin" size={18} /> Cargando categorías…
        </div>
      ) : categories.length === 0 ? (
        <div className="tbl">
          <div className="empty">
            <div className="empty-mark">∅</div>
            <h4>Aún no hay categorías</h4>
            <p>Crea la primera para clasificar tus movimientos.</p>
            <button className="btn primary" onClick={newCategory}>
              + Nueva categoría
            </button>
          </div>
        </div>
      ) : (
        <div className="tbl">
          <div className="tbl-head font-mono" style={{ ...GRID, padding: "11px 16px" }}>
            <div />
            <div>Categoría</div>
            <div>Presupuesto · uso</div>
            <div className="r">Movimiento mes</div>
            <div className="r">% gasto</div>
            <div />
          </div>

          {parents.length > 0 ? (
            <>
              <div className="bg-[color:var(--bg)] px-4 pb-2 pt-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
                ● Categorías raíz · {parents.length}
              </div>
              {parents.map((category) => (
                <Row key={category.id} category={category} />
              ))}
            </>
          ) : null}

          {orphans.length > 0 ? (
            <>
              <div className="bg-[color:var(--bg)] px-4 pb-2 pt-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
                ● Subcategorías · {orphans.length}
              </div>
              {orphans.map((category) => (
                <Row key={category.id} category={category} />
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
