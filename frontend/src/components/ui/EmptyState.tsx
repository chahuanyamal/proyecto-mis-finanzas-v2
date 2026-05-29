import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center border border-slate-700 text-brand-300">∅</div>
      <p className="font-semibold text-slate-200">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
