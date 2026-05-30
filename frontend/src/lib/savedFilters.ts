// Vistas guardadas / filtros inteligentes para el Libro mayor.
// Persistencia ligera en localStorage (sin backend).

const STORAGE_KEY = "boveda-saved-filters";

export type SavedView<F> = { id: string; name: string; filters: F };

/** Lee las vistas guardadas por el usuario desde localStorage. */
export function loadSavedViews<F>(): SavedView<F>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView<F> =>
        v && typeof v === "object" && typeof v.id === "string" && typeof v.name === "string" && typeof v.filters === "object",
    );
  } catch {
    return [];
  }
}

/** Persiste las vistas guardadas del usuario en localStorage. */
export function persistSavedViews<F>(views: SavedView<F>[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // localStorage no disponible (modo privado, cuota llena): se ignora.
  }
}

/** Genera un id único para una vista nueva. */
export function newViewId(): string {
  return `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
