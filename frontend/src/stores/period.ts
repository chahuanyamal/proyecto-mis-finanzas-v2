"use client";

import type { DashboardPeriod } from "@/lib/api-types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Estado global de período y moneda (sistema de diseño Bóveda).
 *
 * El handoff lo define así: "Selected period (mes/año actual) — global o context.
 * Controla Tablero, Comparar, Movimientos, Patrimonio, Presupuestos, Reportes."
 *
 * Se expone desde el header del shell y persiste en localStorage para que la
 * selección sobreviva a la navegación entre páginas.
 */
export type Currency = "CLP" | "USD";

interface PeriodState {
  period: DashboardPeriod;
  currency: Currency;
  setPeriod: (period: DashboardPeriod) => void;
  setCurrency: (currency: Currency) => void;
  toggleCurrency: () => void;
}

export const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "mtd", label: "Mes" },
  { value: "30d", label: "30d" },
  { value: "ytd", label: "Año" },
  { value: "12m", label: "12m" },
];

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set) => ({
      period: "mtd",
      currency: "CLP",
      setPeriod: (period) => set({ period }),
      setCurrency: (currency) => set({ currency }),
      toggleCurrency: () => set((s) => ({ currency: s.currency === "CLP" ? "USD" : "CLP" })),
    }),
    { name: "boveda-period" },
  ),
);
