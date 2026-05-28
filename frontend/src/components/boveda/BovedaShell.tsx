"use client";

import { useAuthStore } from "@/stores/auth";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

const nav = [
  ["/dashboard", "Dashboard"],
  ["/accounts", "Cuentas"],
  ["/transactions", "Transacciones"],
  ["/categories", "Categorías"],
  ["/tags", "Tags"],
  ["/rules", "Reglas"],
  ["/presupuestos", "Presupuestos"],
  ["/statements", "Cartolas"],
];

export function BovedaShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-surface-950 text-slate-100 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-r border-slate-800 bg-black/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Mis Finanzas</p>
        <nav className="mt-8 grid gap-2">
          {nav.map(([href, label]) => {
            const active = pathname === href;
            return (
              <button
                key={href}
                type="button"
                onClick={() => router.push(href)}
                className={`rounded px-3 py-2 text-left text-sm transition ${active ? "bg-brand-500 text-black" : "text-slate-300 hover:bg-slate-900 hover:text-brand-300"}`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-slate-800 bg-surface-900/80 px-6 py-4">
          <span className="text-sm text-slate-400">{user?.email ?? "Validando sesión..."}</span>
          <button type="button" onClick={handleLogout} className="rounded border border-slate-700 px-3 py-2 text-sm hover:border-brand-400">
            Salir
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
