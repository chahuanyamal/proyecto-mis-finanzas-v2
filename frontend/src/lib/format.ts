export function asNumber(value: string | null | undefined): number {
  return Number(value ?? 0);
}

export function formatMoney(value: string | number, currency = "CLP"): string {
  const n = typeof value === "number" ? value : asNumber(value);
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(n);
}

export function plain(value: string | number, currency = "CLP"): string {
  return formatMoney(value, currency).replace(/[^\d.,\-]/g, "");
}

export function formatPercent(value: string | null): string {
  if (value === null) return "sin base";
  const number = asNumber(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function monthLabel(iso: string): { name: string; year: string } {
  const [y, m] = iso.split("-").map(Number);
  return { name: MONTH_NAMES[m - 1] ?? iso, year: String(y) };
}

export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function monthShortUpper(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "short" }).replace(".", "").toUpperCase();
}

export function monthDayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const mon = new Date(y, m - 1, d).toLocaleDateString("es-CL", { month: "short" }).replace(".", "");
  return `${d} ${mon}`;
}

const CAT_SW = ["var(--acc)", "var(--rust)", "var(--gold)", "var(--blue)", "var(--violet)", "var(--acc)"];

export function catColor(index: number): string {
  return CAT_SW[index % CAT_SW.length];
}

const CHIP_PALETTE = ["var(--acc)", "var(--gold)", "var(--rust)", "var(--violet)", "var(--blue)", "var(--text-2)"];

export function chipColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHIP_PALETTE[h % CHIP_PALETTE.length];
}

export function initials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "··";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.toISOString().slice(0, 7);
}