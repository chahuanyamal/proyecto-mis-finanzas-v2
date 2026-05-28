// Navegación del shell Boveda. Una sola fuente de verdad usada por la barra
// lateral y por el command palette (⌘K). Solo rutas que existen en la v2.

export type BovedaNavItem = { href: string; label: string };
export type BovedaNavGroup = { section: string; items: BovedaNavItem[] };

export const BOVEDA_NAV: BovedaNavGroup[] = [
  { section: "Resumen", items: [{ href: "/dashboard", label: "Tablero" }] },
  {
    section: "Movimientos",
    items: [
      { href: "/transactions", label: "Movimientos" },
      { href: "/statements", label: "Cartolas" },
    ],
  },
  { section: "Planificación", items: [{ href: "/presupuestos", label: "Presupuestos" }] },
  {
    section: "Taxonomía",
    items: [
      { href: "/accounts", label: "Cuentas" },
      { href: "/categories", label: "Categorías" },
      { href: "/tags", label: "Etiquetas" },
      { href: "/rules", label: "Reglas" },
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
