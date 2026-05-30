"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Estado global de tema (sistema de diseño Bóveda).
 *
 * "Bóveda · Oscuro" (default) y "Cuaderno · Claro". El valor se refleja en el
 * atributo `data-theme` de `<html>` (ver ThemeApplier + script inline en
 * layout.tsx) y persiste en localStorage para sobrevivir a la navegación y a
 * los recargos sin flash de tema incorrecto.
 *
 * Mismo patrón que `stores/period.ts` (zustand + persist).
 */
export type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    { name: "boveda-theme" },
  ),
);
