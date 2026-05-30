"use client";

import { create } from "zustand";

/**
 * Sistema de toasts unificado (notificaciones efímeras) del diseño Bóveda.
 *
 * - El store mantiene una cola de toasts visibles.
 * - `push` genera un id, agrega el toast y lo auto-remueve a los ~4s.
 * - `dismiss` lo quita manualmente (botón cerrar o al expirar).
 *
 * El helper `toast` permite disparar notificaciones desde cualquier parte
 * (incluso fuera de componentes React) llamando directamente al store.
 */
export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: { type: ToastType; message: string }) => string;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 4000;

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ type, message }) => {
    const id = genId();
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    if (typeof window !== "undefined") {
      window.setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Helper imperativo para disparar toasts desde fuera de componentes.
 * Ej: `toast.success("Listo")`, `toast.error("Falló")`.
 */
export const toast = {
  success: (message: string) => useToastStore.getState().push({ type: "success", message }),
  error: (message: string) => useToastStore.getState().push({ type: "error", message }),
  info: (message: string) => useToastStore.getState().push({ type: "info", message }),
};
