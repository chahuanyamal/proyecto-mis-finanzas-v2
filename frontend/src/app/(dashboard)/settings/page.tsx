"use client";

import { settingsApi } from "@/lib/api";
import type { Settings } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState("CLP");
  const [theme, setTheme] = useState("dark");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/settings"); }, [hasVerified, router, user]);

  useEffect(() => {
    if (!user) return;
    settingsApi.get().then((r) => {
      setSettings(r.data);
      setFullName(r.data.full_name);
      const prefs = r.data.preferences ?? {};
      if (typeof prefs.default_currency === "string") setCurrency(prefs.default_currency);
      if (typeof prefs.theme === "string") setTheme(prefs.theme);
    }).catch(() => setError("No se pudieron cargar los ajustes."));
  }, [user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    try {
      const r = await settingsApi.update({
        full_name: fullName,
        preferences: { default_currency: currency, theme },
      });
      setSettings(r.data);
      setSaved(true);
    } catch { setError("No se pudieron guardar los ajustes."); }
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Ajustes</p>
          <h1 className="mt-2 text-3xl font-bold">Preferencias</h1>
        </header>
        {error ? <p className="rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        {saved ? <p className="rounded bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">Cambios guardados.</p> : null}

        <form onSubmit={save} className="rounded-lg border border-slate-800 bg-surface-900 p-6 space-y-5">
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500">Correo</label>
            <p className="mt-1 font-mono text-slate-300">{settings?.email ?? "—"}</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500">Nombre</label>
            <input className="mt-1 w-full rounded border border-slate-700 bg-black px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500">Moneda por defecto</label>
            <select className="mt-1 w-full rounded border border-slate-700 bg-black px-3 py-2" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500">Tema</label>
            <select className="mt-1 w-full rounded border border-slate-700 bg-black px-3 py-2" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
            </select>
          </div>
          <button className="flex w-full justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black"><Save size={18} /> Guardar</button>
        </form>
      </div>
    </main>
  );
}
