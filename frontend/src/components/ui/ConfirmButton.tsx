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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-surface-900 p-5 shadow-2xl">
            <p className="text-lg font-semibold text-slate-100">{title}</p>
            <p className="mt-2 text-sm text-slate-400">{description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-white/5" disabled={isBusy} onClick={() => setIsOpen(false)}>{cancelLabel}</button>
              <button type="button" className="rounded bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-60" disabled={isBusy} onClick={() => void confirm()}>{isBusy ? "Procesando..." : confirmLabel}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
