"use client";

import { categoriesApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { Category, CategoryPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

const emptyForm: CategoryPayload = { name: "", parent_id: null, color: "#5EE9B5", icon: "tag" };

const SWATCHES = ["#5EE9B5", "#E6B85C", "#E87A5B", "#B49CFF", "#7AB0FF", "#FF6B9D", "#807A6E"];

function initials(name: string): string {
  const cleaned = name.trim();
  return cleaned ? cleaned[0].toUpperCase() : "·";
}

export default function CategoriesPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!hasVerified) void fetchMe();
  }, [fetchMe, hasVerified]);

  useEffect(() => {
    if (hasVerified && !user) router.replace("/login?next=/categories");
  }, [hasVerified, router, user]);

  async function loadData() {
    setIsLoading(true);
    setError("");
    try {
      const response = await categoriesApi.list();
      setCategories(response.data);
    } catch {
      setError("No se pudieron cargar las categorías.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (user) void loadData();
  }, [user]);

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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...form, parent_id: form.parent_id || null, color: form.color || null, icon: form.icon || null };
    try {
      if (editingId) await categoriesApi.update(editingId, payload);
      else await categoriesApi.create(payload);
      resetForm();
      await loadData();
    } catch {
      setError("No se pudo guardar la categoría.");
    }
  }

  async function remove(id: string) {
    try {
      await categoriesApi.remove(id);
      await loadData();
    } catch {
      setError("No se pudo eliminar. Puede estar en uso por transacciones o reglas.");
    }
  }

  const parents = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const orphans = useMemo(() => categories.filter((c) => c.parent_id), [categories]);
  const subCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of categories) {
      if (c.parent_id) map.set(c.parent_id, (map.get(c.parent_id) ?? 0) + 1);
    }
    return map;
  }, [categories]);

  const withColor = categories.filter((c) => c.color).length;

  const GRID = "grid grid-cols-[36px_1fr_280px_90px_32px] gap-3.5 items-center";

  function Row({ category }: { category: Category }) {
    const isSystem = category.user_id === null;
    const parent = categories.find((item) => item.id === category.parent_id);
    const subs = subCount.get(category.id) ?? 0;
    return (
      <div
        className={`${GRID} cursor-pointer border-b border-[color:var(--line-2)] px-4 py-3 last:border-0 hover:bg-[color:var(--bg-3)]`}
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
              {subs > 0 ? `${subs} sub` : isSystem ? "sistema" : "sin sub"}
            </span>
            {parent ? <span className="truncate">en {parent.name}</span> : null}
          </div>
        </div>
        <div className="font-mono text-[11px] text-[color:var(--text-3)]">
          {parent ? `subcategoría · ${parent.name}` : "categoría raíz"}
        </div>
        <div className="text-right font-mono text-[12px] text-[color:var(--text-3)]">
          {category.icon ?? "—"}
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
              ✕
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
          <div className={`${GRID} tbl-head`}>
            <div />
            <div>Categoría</div>
            <div>Jerarquía</div>
            <div className="r">Icono</div>
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
