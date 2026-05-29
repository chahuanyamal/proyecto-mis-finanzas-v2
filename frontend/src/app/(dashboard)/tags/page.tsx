"use client";

import { tagsApi } from "@/lib/api";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import type { Tag, TagPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

const SWATCHES = ["#5EE9B5", "#E6B85C", "#E87A5B", "#B49CFF", "#7AB0FF", "#FF6B9D", "#807A6E"];

const emptyForm: TagPayload = { name: "", color: "#5EE9B5" };

export default function TagsPage() {
  const { user } = useAuthStore();
  const [tags, setTags] = useState<Tag[]>([]);
  const [form, setForm] = useState<TagPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] = useState<"all" | "color" | "nocolor">("all");

  async function loadData() {
    setIsLoading(true);
    try {
      setTags((await tagsApi.list()).data);
    } catch {
      setError("No se pudieron cargar los tags.");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (user) void loadData();
  }, [user]);

  function reset() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingId) await tagsApi.update(editingId, form);
      else await tagsApi.create(form);
      reset();
      await loadData();
    } catch {
      setError("No se pudo guardar el tag.");
    }
  }

  async function remove(id: string) {
    try {
      await tagsApi.remove(id);
      if (editingId === id) reset();
      await loadData();
    } catch {
      setError("No se pudo eliminar el tag.");
    }
  }

  const withColor = useMemo(() => tags.filter((t) => t.color), [tags]);
  const withoutColor = useMemo(() => tags.filter((t) => !t.color), [tags]);

  const tableTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tags.filter((t) => {
      if (colorFilter === "color" && !t.color) return false;
      if (colorFilter === "nocolor" && t.color) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q);
    });
  }, [tags, query, colorFilter]);

  function editTag(tag: Tag) {
    setEditingId(tag.id);
    setForm({ name: tag.name, color: tag.color ?? "#5EE9B5" });
  }

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Tus <span className="serif">etiquetas</span>
          </h1>
          <div className="sub">
            {tags.length} etiquetas · agrupan movimientos transversalmente
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
            Activas · todas
          </div>
          <div className="val num">{tags.length}</div>
          <div className="sub">total configuradas</div>
        </div>
        <div className="kpi">
          <div className="lbl">
            <span className="sw" />
            Con color
          </div>
          <div className="val num">{withColor.length}</div>
          <div className="sub">con swatch asignado</div>
        </div>
        <div className="kpi g">
          <div className="lbl">
            <span className="sw" />
            Sin color
          </div>
          <div className="val num">{withoutColor.length}</div>
          <div className="sub">usan iniciales en gris</div>
        </div>
        <div className="kpi v">
          <div className="lbl">
            <span className="sw" />
            Colores únicos
          </div>
          <div className="val num">{new Set(withColor.map((t) => t.color)).size}</div>
          <div className="sub">distintos en uso</div>
        </div>
      </section>

      {/* Create / edit form — `.create` grid: input · swatch row · button */}
      <form
        onSubmit={save}
        className="grid items-center gap-3 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--bg-2)] px-5 py-[18px]"
        style={{ gridTemplateColumns: "1fr auto auto", marginBottom: 20 }}
      >
        <input
          className="rounded-[7px] border border-[color:var(--line)] bg-[color:var(--bg)] px-3 py-[9px] text-[13px] text-[color:var(--text)] outline-none focus:border-[color:var(--acc)]"
          placeholder={'Nombre de la etiqueta… ej. "viaje a Japón"'}
          value={form.name}
          onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
          required
        />
        <div className="flex items-center gap-2 px-1.5">
          {SWATCHES.map((color) => (
            <button
              type="button"
              key={color}
              onClick={() => setForm((v) => ({ ...v, color }))}
              className="h-[22px] w-[22px] rounded-full transition-transform hover:scale-110"
              style={{
                background: color,
                border: "2px solid var(--bg-2)",
                outline: form.color === color ? "2px solid var(--text)" : "none",
                outlineOffset: 2,
              }}
              aria-label={color}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {editingId ? (
            <button type="button" className="btn ghost" onClick={reset}>
              Cancelar
            </button>
          ) : null}
          <button type="submit" className="btn primary">
            {editingId ? "Guardar cambios" : "+ Crear etiqueta"}
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 font-mono text-[13px] text-[color:var(--text-3)]">
          <Loader2 className="animate-spin" size={18} /> Cargando etiquetas…
        </div>
      ) : tags.length === 0 ? (
        <div className="tbl">
          <div className="empty">
            <div className="empty-mark">∅</div>
            <h4>Aún no hay etiquetas</h4>
            <p>Crea la primera para agrupar movimientos transversalmente.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Tag wall */}
          <div
            className="rounded-[10px] border border-[color:var(--line)] bg-[color:var(--bg-2)] p-6"
            style={{ marginBottom: 24 }}
          >
            {withColor.length > 0 ? (
              <div style={{ marginBottom: withoutColor.length > 0 ? 24 : 0 }}>
                <div className="mb-3 flex items-center gap-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
                  ● Con color · {withColor.length}
                  <span className="h-px flex-1 bg-[color:var(--line-2)]" />
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {withColor.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => editTag(tag)}
                      className="inline-flex items-center gap-2.5 rounded-full border border-[color:var(--line)] bg-[color:var(--bg-3)] px-3.5 py-2 text-[13px] text-[color:var(--text)] transition hover:-translate-y-px"
                    >
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-full"
                        style={{ background: tag.color ?? "var(--text-3)" }}
                      />
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {withoutColor.length > 0 ? (
              <div>
                <div className="mb-3 flex items-center gap-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)]">
                  ○ Sin color · {withoutColor.length}
                  <span className="h-px flex-1 bg-[color:var(--line-2)]" />
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {withoutColor.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => editTag(tag)}
                      className="inline-flex items-center gap-2.5 rounded-full border border-dashed border-[color:var(--line)] bg-transparent px-3.5 py-2 text-[13px] text-[color:var(--text-3)] transition hover:-translate-y-px"
                    >
                      <span className="h-2.5 w-2.5 flex-none rounded-full bg-[color:var(--text-3)]" />
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Filters */}
          <div className="filters" style={{ marginTop: 24 }}>
            <div className="filt-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input placeholder="Buscar por nombre…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="seg" style={{ marginLeft: "auto" }}>
              <button className={colorFilter === "all" ? "on" : ""} onClick={() => setColorFilter("all")}>
                Todas · {tags.length}
              </button>
              <button className={colorFilter === "color" ? "on" : ""} onClick={() => setColorFilter("color")}>
                Con color · {withColor.length}
              </button>
              <button className={colorFilter === "nocolor" ? "on" : ""} onClick={() => setColorFilter("nocolor")}>
                Sin color · {withoutColor.length}
              </button>
            </div>
          </div>

          {/* Table with hex */}
          <div className="tbl">
            <div className="grid grid-cols-[1fr_140px_130px_32px] gap-3.5 px-4 tbl-head">
              <div>Etiqueta</div>
              <div>Color</div>
              <div className="r">ID</div>
              <div />
            </div>
            {tableTags.map((tag) => (
              <div
                key={tag.id}
                className="grid cursor-pointer grid-cols-[1fr_140px_130px_32px] items-center gap-3.5 border-b border-[color:var(--line-2)] px-4 py-3 last:border-0 hover:bg-[color:var(--bg-3)]"
                onClick={() => editTag(tag)}
              >
                <div className="flex items-center gap-2.5 text-[13px] font-medium text-[color:var(--text)]">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: tag.color ?? "var(--text-3)" }}
                  />
                  {tag.name}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-[color:var(--text-3)]">
                  <span
                    className="h-3.5 w-3.5 rounded"
                    style={{ background: tag.color ?? "var(--text-3)", opacity: tag.color ? 1 : 0.4 }}
                  />
                  {tag.color ?? "—"}
                </div>
                <div className="r font-mono text-[11px] text-[color:var(--text-3)]">{tag.id.slice(0, 8)}</div>
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <ConfirmButton
                    title="Eliminar etiqueta"
                    description="Se quitará de todos los movimientos asociados."
                    confirmLabel="Eliminar"
                    onConfirm={() => remove(tag.id)}
                    className="text-[color:var(--text-3)] hover:text-[color:var(--rust)]"
                  >
                    ✕
                  </ConfirmButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
