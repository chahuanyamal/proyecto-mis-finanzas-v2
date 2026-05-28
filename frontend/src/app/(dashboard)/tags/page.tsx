"use client";

import { tagsApi } from "@/lib/api";
import type { Tag, TagPayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function TagsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [tags, setTags] = useState<Tag[]>([]);
  const [form, setForm] = useState<TagPayload>({ name: "", color: "#f59e0b" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/tags"); }, [hasVerified, router, user]);

  async function loadData() {
    try { setTags((await tagsApi.list()).data); } catch { setError("No se pudieron cargar los tags."); }
  }
  useEffect(() => { if (user) void loadData(); }, [user]);
  function reset() { setForm({ name: "", color: "#f59e0b" }); setEditingId(null); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingId) await tagsApi.update(editingId, form); else await tagsApi.create(form);
      reset(); await loadData();
    } catch { setError("No se pudo guardar el tag."); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar este tag?")) return;
    try { await tagsApi.remove(id); await loadData(); } catch { setError("No se pudo eliminar el tag."); }
  }

  return <main className="min-h-screen bg-surface-950 p-8 text-slate-100"><div className="mx-auto max-w-4xl rounded-lg border border-slate-800 bg-surface-900 p-6"><p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Tags</p><h1 className="mt-2 text-3xl font-bold">Etiquetas</h1>{error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}<form onSubmit={save} className="mt-6 grid gap-3 md:grid-cols-[1fr_160px_140px]"><input className="rounded border border-slate-700 bg-black px-3 py-2" placeholder="Nombre" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required /><input className="rounded border border-slate-700 bg-black px-3 py-2" value={form.color ?? ""} onChange={(e) => setForm((v) => ({ ...v, color: e.target.value }))} /><button className="flex items-center justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button></form><div className="mt-6 grid gap-3 md:grid-cols-2">{tags.map((tag) => <div key={tag.id} className="flex items-center justify-between rounded border border-slate-800 bg-black/30 p-4"><span><span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: tag.color ?? "#f59e0b" }} />{tag.name}</span><span className="flex gap-3"><button onClick={() => { setEditingId(tag.id); setForm({ name: tag.name, color: tag.color }); }} className="text-brand-300">Editar</button><button onClick={() => void remove(tag.id)} className="text-red-300"><Trash2 size={16} /></button></span></div>)}</div>{editingId ? <button onClick={reset} className="mt-4 rounded border border-slate-700 px-4 py-2">Cancelar edición</button> : null}</div></main>;
}
