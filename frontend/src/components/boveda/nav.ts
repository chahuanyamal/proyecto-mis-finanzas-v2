// Navegación del shell Boveda. Una sola fuente de verdad usada por la barra
// lateral y por el command palette (⌘K). Solo rutas que existen en la v2.

export type BovedaNavItem = { href: string; label: string; alert?: boolean };
export type BovedaNavGroup = { section: string; items: BovedaNavItem[] };

export const BOVEDA_NAV: BovedaNavGroup[] = [
  {
    section: "Resumen",
    items: [
      { href: "/dashboard", label: "Tablero" },
      { href: "/comparar", label: "Comparar" },
      { href: "/patrimonio", label: "Patrimonio" },
    ],
  },
  {
    section: "Movimientos",
    items: [
      { href: "/transactions", label: "Movimientos" },
      { href: "/statements", label: "Cartolas" },
      { href: "/review", label: "Por revisar", alert: true },
    ],
  },
  {
    section: "Planificación",
    items: [
      { href: "/presupuestos", label: "Presupuestos" },
      { href: "/goals", label: "Metas" },
      { href: "/recurring", label: "Suscripciones" },
    ],
  },
  {
    section: "Taxonomía",
    items: [
      { href: "/accounts", label: "Cuentas" },
      { href: "/categories", label: "Categorías" },
      { href: "/tags", label: "Etiquetas" },
      { href: "/rules", label: "Reglas" },
    ],
  },
  {
    section: "Análisis",
    items: [
      { href: "/insights", label: "Insights" },
      { href: "/reports", label: "Reportes" },
      { href: "/ai", label: "Asistente IA" },
    ],
  },
  {
    section: "Sistema",
    items: [
      { href: "/settings", label: "Ajustes" },
      { href: "/audit", label: "Auditoría" },
      { href: "/reconciliation", label: "Reconciliación" },
      { href: "/admin", label: "Admin" },
      { href: "/status", label: "Estado" },
    ],
  },
];

export const BOVEDA_NAV_FLAT: BovedaNavItem[] = BOVEDA_NAV.flatMap((g) => g.items);

// Evento que dispara la apertura del command palette desde cualquier botón.
export const OPEN_COMMAND_PALETTE = "boveda:open-command-palette";

export function openCommandPalette(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE));
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
