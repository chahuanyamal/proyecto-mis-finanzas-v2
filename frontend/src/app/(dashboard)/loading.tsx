export default function DashboardLoading() {
  return (
    <div className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div className="empty" style={{ padding: "60px 30px" }}>
        <div className="empty-mark" style={{ animation: "spin 1s linear infinite" }}>
          <svg
            className="animate-spin"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <h4 style={{ fontSize: 18, fontWeight: 400, color: "var(--text)", marginBottom: 6, letterSpacing: "-0.01em", textTransform: "none", fontFamily: "var(--font-geist-sans), sans-serif" }}>
          Cargando<span className="serif" style={{ color: "var(--acc)" }}>…</span>
        </h4>
        <p style={{ fontSize: 13, color: "var(--text-3)", fontFamily: "var(--font-geist-mono), monospace" }}>
          Preparando tus datos
        </p>
      </div>
    </div>
  );
}