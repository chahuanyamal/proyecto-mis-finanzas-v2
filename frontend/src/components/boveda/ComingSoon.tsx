// Placeholder consistente para páginas que existían en la versión anterior
// pero cuyo backend aún no se reconstruyó en la v2. No rompen la navegación.
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="content">
      <div className="empty mx-auto max-w-xl">
        <div className="empty-mark">¶</div>
        <h4>{title}</h4>
        <p>{description}</p>
        <p className="mt-2 font-mono text-[11px] text-[color:var(--text-4)]">
          Esta sección existía en la versión anterior · backend en reconstrucción.
        </p>
      </div>
    </div>
  );
}
