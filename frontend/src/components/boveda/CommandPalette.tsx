"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BOVEDA_NAV_FLAT, OPEN_COMMAND_PALETTE } from "./nav";

// Command palette ligero (⌘K / Ctrl+K). Navegación client-side por las
// secciones de la app — sin llamadas al backend. Filtra por etiqueta y ruta.
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BOVEDA_NAV_FLAT;
    return BOVEDA_NAV_FLAT.filter(
      (item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeydown);
    window.addEventListener(OPEN_COMMAND_PALETTE, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener(OPEN_COMMAND_PALETTE, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Enfocar el input al abrir.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onListKeydown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[cursor];
      if (target) go(target.href);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="card-elevated w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
      >
        <div className="flex items-center gap-2 border-b border-navy-600 px-3 py-2">
          <span className="text-brand-500">›</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKeydown}
            placeholder="Ir a…"
            className="input border-0 bg-transparent px-0 focus:shadow-none"
            aria-label="Buscar sección"
          />
          <span className="border border-navy-600 px-1 text-[10px] text-slate-500">ESC</span>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-slate-500">Sin resultados</li>
          ) : (
            results.map((item, i) => (
              <li key={item.href}>
                <button
                  type="button"
                  onClick={() => go(item.href)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition-colors ${
                    i === cursor ? "bg-brand-500/10 text-brand-400" : "text-slate-300 hover:bg-navy-850"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">{item.href}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
