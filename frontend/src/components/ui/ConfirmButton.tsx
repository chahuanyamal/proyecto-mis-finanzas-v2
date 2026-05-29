"use client";

import { useState, type ReactNode } from "react";

export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  className,
  disabled,
  onConfirm,
}: {
  children: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function confirm() {
    setIsBusy(true);
    try {
      await onConfirm();
      setIsOpen(false);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setIsOpen(true)}>
        {children}
      </button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div
            className="w-full max-w-sm p-5 shadow-2xl"
            style={{
              borderRadius: 10,
              border: `1px solid var(--line)`,
              background: "var(--bg)",
              fontFamily: "inherit",
              fontSize: "13px",
            }}
          >
            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>{title}</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-3)" }}>{description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded px-3 py-2 text-sm"
                disabled={isBusy}
                onClick={() => setIsOpen(false)}
                style={{
                  border: `1px solid var(--line)`,
                  color: "var(--text-2)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className="rounded px-3 py-2 text-sm font-semibold disabled:opacity-60"
                disabled={isBusy}
                onClick={() => void confirm()}
                style={{
                  background: "var(--rust)",
                  color: "var(--text)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--acc-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--rust)"; }}
              >
                {isBusy ? "Procesando..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}