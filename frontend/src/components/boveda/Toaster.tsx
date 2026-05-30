"use client";

import { useToastStore, type ToastType } from "@/stores/toast";
import { useEffect, useState } from "react";

const BORDER_BY_TYPE: Record<ToastType, string> = {
  success: "var(--acc)",
  error: "var(--rust)",
  info: "var(--line-3)",
};

const DOT_BY_TYPE: Record<ToastType, string> = {
  success: "var(--acc)",
  error: "var(--rust)",
  info: "var(--text-3)",
};

const ICON_BY_TYPE: Record<ToastType, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

/**
 * Contenedor global de toasts (diseño Bóveda). Se monta una sola vez en el
 * shell y renderiza la cola del store en la esquina inferior derecha.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  // Respeta prefers-reduced-motion: sin animación de entrada si el usuario
  // lo solicita.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: "min(92vw, 360px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastCard
            type={t.type}
            message={t.message}
            reduceMotion={reduceMotion}
            onClose={() => dismiss(t.id)}
          />
        </div>
      ))}
    </div>
  );
}

function ToastCard({
  type,
  message,
  reduceMotion,
  onClose,
}: {
  type: ToastType;
  message: string;
  reduceMotion: boolean;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(reduceMotion);
  useEffect(() => {
    if (reduceMotion) {
      setEntered(true);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "var(--bg-2)",
        border: `1px solid ${BORDER_BY_TYPE[type]}`,
        borderLeft: `3px solid ${BORDER_BY_TYPE[type]}`,
        borderRadius: 10,
        padding: "11px 12px",
        color: "var(--text)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
        fontSize: 13,
        lineHeight: 1.4,
        transform: entered ? "translateY(0)" : "translateY(12px)",
        opacity: entered ? 1 : 0,
        transition: reduceMotion ? "none" : "transform 180ms ease, opacity 180ms ease",
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: DOT_BY_TYPE[type],
          color: "var(--bg)",
          fontSize: 12,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        {ICON_BY_TYPE[type]}
      </span>
      <span style={{ flex: 1, minWidth: 0, color: "var(--text)" }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar notificación"
        style={{
          flexShrink: 0,
          background: "transparent",
          border: "none",
          color: "var(--text-3)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
