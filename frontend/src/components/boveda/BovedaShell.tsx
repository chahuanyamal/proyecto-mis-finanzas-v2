"use client";

import { useAuthStore } from "@/stores/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { BOVEDA_NAV, BOVEDA_NAV_FLAT, isActive, openCommandPalette } from "./nav";

const MONTH_LABEL = new Intl.DateTimeFormat("es-CL", { month: "short", year: "2-digit" })
  .format(new Date())
  .replace(".", "");

export function BovedaShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const name = user?.full_name || user?.email?.split("@")[0] || "Usuario";
  const initial = name.charAt(0).toUpperCase();
  const current = BOVEDA_NAV_FLAT.find((i) => isActive(pathname, i.href));

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="navy-sidebar flex flex-col gap-1 p-3">
        <Link href="/dashboard" className="mb-2 flex items-center gap-2 px-1 py-1">
          <span className="flex h-7 w-7 items-center justify-center bg-brand-500 text-sm font-bold text-black">M</span>
          <span>
            <span className="block text-[12px] font-bold tracking-wide text-slate-100">Mis Finanzas</span>
            <span className="block text-[9px] uppercase tracking-[0.25em] text-slate-500">{MONTH_LABEL}</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={openCommandPalette}
          className="mb-2 flex items-center gap-2 border border-navy-600 px-2 py-1.5 text-[11px] text-slate-500 transition-colors hover:border-brand-500 hover:text-brand-400"
          aria-label="Buscar (atajo Command/Control + K)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 text-left">Buscar…</span>
          <span className="border border-navy-600 px-1 text-[9px]">⌘K</span>
        </button>

        <nav aria-label="Navegación principal">
          {BOVEDA_NAV.map((group) => (
            <div key={group.section}>
              <h6 className="sidebar-section">{group.section}</h6>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive(pathname, item.href) ? "active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2 border-t border-navy-600 pt-3">
          <span className="flex h-7 w-7 items-center justify-center border border-navy-500 text-[11px] font-bold text-brand-400">
            {initial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] text-slate-200">{name}</span>
            <span className="block truncate text-[10px] text-slate-500">{user?.email ?? "admin@finanzas.local"}</span>
          </span>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="strip">
          <div className="strip-title">
            <span className="dot" />
            <span className="strip-code">{current?.label ?? "Mis Finanzas"}</span>
          </div>
          <button type="button" onClick={handleLogout} className="btn-ghost">
            Salir
          </button>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
