"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div className="empty">
        <div className="insight err" style={{ marginBottom: 20, width: "100%", maxWidth: 480 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="lbl">Error</div>
            <div className="txt">{error.message || "Ocurrió un error inesperado."}</div>
          </div>
          <div />
        </div>
        <button className="btn primary" onClick={reset}>
          Reintentar
        </button>
      </div>
    </div>
  );
}