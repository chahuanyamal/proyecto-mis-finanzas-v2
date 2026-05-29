"use client";

import { useAuthStore } from "@/stores/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { BOVEDA_NAV, BOVEDA_NAV_FLAT, isActive, openCommandPalette } from "./nav";

const MONTH_LABEL = new Intl.DateTimeFormat("es-CL", { month: "short", year: "2-digit" })
  .format(new Date())
  .replace(".", "")
  .replace(" ", " · ");

export function BovedaShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const name = user?.full_name || user?.email?.split("@")[0] || "Usuario";
  const initial = name.charAt(0).toUpperCase();
  const current = BOVEDA_NAV_FLAT.find((i) => isActive(pathname, i.href));
  const currentGroup = BOVEDA_NAV.find((g) => g.items.some((i) => isActive(pathname, i.href)));

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="nav-aside sticky top-0 hidden h-screen flex-shrink-0 lg:flex">
        <div className="flex h-full w-full flex-col overflow-y-auto">
          <Link href="/dashboard" className="brand">
            <div className="brand-mark">M</div>
            <div>
              <div className="brand-name">Mis Finanzas</div>
              <div className="brand-sub">{MONTH_LABEL}</div>
            </div>
          </Link>

          <div className="nav-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <button type="button" onClick={openCommandPalette} aria-label="Buscar (⌘K)">
              <span>Buscar…</span>
              <span className="kbd">⌘K</span>
            </button>
          </div>

          <nav aria-label="Navegación principal" className="flex-1">
            {BOVEDA_NAV.map((group) => (
              <div key={group.section} className="nav-group">
                <h6>{group.section}</h6>
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-item ${active ? "active" : ""} ${item.alert ? "alert" : ""}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="me">
            <div className="me-av">{initial}</div>
            <div className="min-w-0">
              <div className="me-name truncate">{name}</div>
              <div className="me-mail truncate">{user?.email ?? "admin@finanzas.local"}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="head">
          <div className="crumbs">
            <span>finanzas</span>
            {currentGroup ? (
              <>
                <span className="sep">/</span>
                <span>{currentGroup.section.toLowerCase()}</span>
              </>
            ) : null}
            <span className="sep">/</span>
            <span className="here">{current?.label ?? "Tablero"}</span>
          </div>
          <div className="head-r">
            <span className="pill">
              <span className="live" />
              Datos al día
            </span>
            <button type="button" onClick={handleLogout} className="btn ghost">
              Salir
            </button>
          </div>
        </header>
        <div id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </div>
      </main>

      <CommandPalette />
    </div>
  );
}
