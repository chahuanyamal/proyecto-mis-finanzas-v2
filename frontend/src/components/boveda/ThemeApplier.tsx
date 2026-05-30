"use client";

import { useThemeStore } from "@/stores/theme";
import { useEffect } from "react";

/**
 * Refleja el tema del store en `document.documentElement.dataset.theme`.
 *
 * El script inline de `layout.tsx` ya setea `data-theme` antes de la hidratación
 * (anti-flash); este componente lo mantiene sincronizado cuando el usuario lo
 * cambia desde Ajustes durante la sesión.
 */
export function ThemeApplier() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return null;
}
