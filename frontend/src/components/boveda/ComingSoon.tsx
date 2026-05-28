// Placeholder consistente para páginas que existían en la versión anterior
// pero cuyo backend aún no se reconstruyó en la v2. No rompen la navegación.
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-8">
      <div className="card-elevated mx-auto max-w-xl p-8 text-center">
        <p className="text-[10px] uppercase tracking-[0.3em] text-brand-500">Próximamente</p>
        <h1 className="mt-3 text-xl font-bold text-slate-100">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{description}</p>
        <p className="mt-6 text-xs text-slate-600">
          Esta sección existía en la versión anterior. Su backend aún no se ha reconstruido en la v2.
        </p>
      </div>
    </div>
  );
}
