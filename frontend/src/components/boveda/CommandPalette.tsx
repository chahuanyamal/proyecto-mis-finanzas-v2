"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchApi } from "@/lib/api";
import type { SearchHit } from "@/lib/api-types";
import { BOVEDA_NAV_FLAT, OPEN_COMMAND_PALETTE } from "./nav";

type PaletteItem = {
  key: string;
  label: string;
  href: string;
  group: string;
  subtitle?: string | null;
};

const ENTITY_LABELS: Record<SearchHit["entity"], string> = {
  transaction: "Movimiento",
  account: "Cuenta",
  category: "Categoria",
  tag: "Etiqueta",
  rule: "Regla",
  statement: "Cartola",
};

function hitToItem(hit: SearchHit): PaletteItem {
  return {
    key: `${hit.entity}:${hit.id}`,
    label: hit.title,
    href: hit.href,
    group: ENTITY_LABELS[hit.entity],
    subtitle: hit.subtitle,
  };
}

// Command palette (⌘K / Ctrl+K). Mezcla navegación local con búsqueda real
// del backend cuando hay texto suficiente para consultar datos del usuario.
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const navResults = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const source = q ? BOVEDA_NAV_FLAT.filter(
      (item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q),
    ) : BOVEDA_NAV_FLAT;
    return source.map((item) => ({ key: `nav:${item.href}`, label: item.label, href: item.href, group: "Ir a" }));
  }, [query]);

  const results = useMemo<PaletteItem[]>(() => {
    const dataResults = searchHits.map(hitToItem);
    return query.trim().length >= 2 ? [...navResults, ...dataResults] : navResults;
  }, [navResults, query, searchHits]);

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

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setSearchHits([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      searchApi.global(q, 12)
        .then((response) => {
          if (!cancelled) setSearchHits(response.data.hits);
        })
        .catch(() => {
          if (!cancelled) setSearchHits([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, query]);

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
            placeholder="Ir a o buscar movimientos, cuentas, reglas…"
            className="input border-0 bg-transparent px-0 focus:shadow-none"
            aria-label="Buscar sección"
          />
          <span className="border border-navy-600 px-1 text-[10px] text-slate-500">ESC</span>
        </div>
        {isSearching ? <div className="border-b border-navy-600 px-3 py-1 text-[11px] text-slate-500">Buscando datos...</div> : null}
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-slate-500">Sin resultados</li>
          ) : (
            results.map((item, i) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => go(item.href)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition-colors ${
                    i === cursor ? "bg-brand-500/10 text-brand-400" : "text-slate-300 hover:bg-navy-850"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    {item.subtitle ? <span className="block truncate text-[10px] text-slate-500">{item.subtitle}</span> : null}
                  </span>
                  <span className="ml-3 shrink-0 text-[10px] uppercase tracking-wider text-slate-600">{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
