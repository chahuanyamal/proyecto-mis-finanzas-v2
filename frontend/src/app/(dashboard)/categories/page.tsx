"use client";

import { categoriesApi } from "@/lib/api";
import type { Category, CategoryPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const emptyForm: CategoryPayload = { name: "", parent_id: null, color: "#f59e0b", icon: "tag" };

export default function CategoriesPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
  }

  function edit(category: Category) {
    setEditingId(category.id);
    setForm({ name: category.name, parent_id: category.parent_id, color: category.color, icon: category.icon });
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
    if (!confirm("¿Eliminar esta categoría?")) return;
    try {
      await categoriesApi.remove(id);
      await loadData();
    } catch {
      setError("No se pudo eliminar. Puede estar en uso por transacciones o reglas.");
    }
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Categorías</p>
          <h1 className="mt-2 text-3xl font-bold">Catálogo</h1>
          {error ? <p className="mt-5 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          {isLoading ? <p className="mt-8 flex gap-2 text-slate-400"><Loader2 className="animate-spin" /> Cargando...</p> : (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {categories.map((category) => {
                const isSystem = category.user_id === null;
                return (
                <div key={category.id} className="rounded border border-slate-800 bg-black/30 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {category.icon ? `${category.icon} ` : ""}{category.name}
                        {isSystem ? <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">Sistema</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">Padre: {categories.find((item) => item.id === category.parent_id)?.name ?? "-"}</p>
                    </div>
                    {isSystem ? (
                      <span className="text-xs text-slate-500">Solo lectura</span>
                    ) : (
                      <div className="flex gap-3">
                        <button type="button" onClick={() => edit(category)} className="text-brand-300">Editar</button>
                        <button type="button" onClick={() => void remove(category.id)} className="text-red-300"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>
        <aside className="rounded-lg border border-slate-800 bg-surface-900 p-6">
          <h2 className="text-lg font-semibold">{editingId ? "Editar" : "Nueva"} categoría</h2>
          <form onSubmit={save} className="mt-5 space-y-4">
            <input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Nombre" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required />
            <select className="w-full rounded border border-slate-700 bg-black px-3 py-2" value={form.parent_id ?? ""} onChange={(e) => setForm((v) => ({ ...v, parent_id: e.target.value || null }))}>
              <option value="">Sin padre</option>
              {categories.filter((category) => category.id !== editingId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Color" value={form.color ?? ""} onChange={(e) => setForm((v) => ({ ...v, color: e.target.value }))} />
            <input className="w-full rounded border border-slate-700 bg-black px-3 py-2" placeholder="Icono" value={form.icon ?? ""} onChange={(e) => setForm((v) => ({ ...v, icon: e.target.value }))} />
            <button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>
            {editingId ? <button type="button" onClick={resetForm} className="w-full rounded border border-slate-700 px-4 py-2">Cancelar</button> : null}
          </form>
        </aside>
      </div>
    </main>
  );
}
