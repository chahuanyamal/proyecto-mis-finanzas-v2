"use client";

import { useAuthStore } from "@/stores/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { ThemeApplier } from "./ThemeApplier";
import { BOVEDA_NAV, BOVEDA_NAV_FLAT, isActive, openCommandPalette } from "./nav";
import { useNavCounts } from "./useNavCounts";
import { PERIOD_OPTIONS, usePeriodStore } from "@/stores/period";

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
  const counts = useNavCounts(Boolean(user));
  const { period, currency, setPeriod, toggleCurrency } = usePeriodStore();
  const [navOpen, setNavOpen] = useState(false);
  const fmtCount = (n: number | undefined) =>
    n === undefined ? null : n > 999 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

  // Cierra el drawer móvil al navegar.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* Backdrop del drawer móvil */}
      {navOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          aria-hidden
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        className={`nav-aside fixed inset-y-0 left-0 z-50 h-screen flex-shrink-0 transform transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
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
                  const count = fmtCount(counts[item.href]);
                  const isAlert = item.alert && (counts[item.href] ?? 0) > 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-item ${active ? "active" : ""} ${isAlert ? "alert" : ""}`}
                    >
                      {item.label}
                      {count !== null ? <span className="count">{count}</span> : null}
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
          <button
            type="button"
            className="btn ghost lg:hidden"
            style={{ padding: "6px 9px" }}
            aria-label="Abrir menú"
            onClick={() => setNavOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div className="crumbs">
            <span className="hidden sm:inline">finanzas</span>
            {currentGroup ? (
              <>
                <span className="sep hidden sm:inline">/</span>
                <span className="hidden sm:inline">{currentGroup.section.toLowerCase()}</span>
              </>
            ) : null}
            <span className="sep hidden sm:inline">/</span>
            <span className="here">{current?.label ?? "Tablero"}</span>
          </div>
          <div className="head-r">
            <span className="pill hidden md:inline-flex">
              <span className="live" />
              Datos al día
            </span>
            <div className="seg hidden sm:inline-flex" aria-label="Período">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={period === p.value ? "on" : ""}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="pill" onClick={toggleCurrency} aria-label="Moneda">
              {currency} ▾
            </button>
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
      <ThemeApplier />
    </div>
  );
}
