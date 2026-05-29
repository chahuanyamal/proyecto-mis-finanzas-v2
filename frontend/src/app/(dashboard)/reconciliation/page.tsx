"use client";

import { reconciliationApi } from "@/lib/api";
import type { ReconciliationSummary } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { usePeriodStore } from "@/stores/period";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function money(value: string, currency: string) {
  const n = Number(value);
  return Number.isNaN(n) ? value : new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(n);
}

export default function ReconciliationPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const currency = usePeriodStore((s) => s.currency);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tolerance, setTolerance] = useState("1");
  const [data, setData] = useState<ReconciliationSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/reconciliation"); }, [hasVerified, router, user]);
  useEffect(() => {
    if (user) {
      reconciliationApi.summary({ currency, tolerance, start_date: startDate || undefined, end_date: endDate || undefined })
        .then((r) => setData(r.data))
        .catch(() => setError("No se pudo cargar reconciliación."));
    }
  }, [currency, endDate, startDate, tolerance, user]);

  const cols = "1fr 150px 150px 130px 130px 90px";

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Reconciliaci<span className="serif">ón</span>
          </h1>
          <div className="sub">
            <strong>control</strong> · cartola vs. saldo calculado — usa saldos de cartola cuando existen
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label>Desde</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label>Hasta</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 140 }}>
          <label>Tolerancia</label>
          <input inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="Tolerancia" />
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="lbl">Error</div>
            <div className="txt">{error}</div>
          </div>
          <div />
        </div>
      ) : null}

      <div className="strip" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="kpi">
          <div className="lbl"><span className="sw" />Conciliadas</div>
          <div className="val num">{data?.ok_count ?? 0}</div>
          <div className="sub">sin diferencia relevante</div>
        </div>
        <div className="kpi g">
          <div className="lbl"><span className="sw" />Con alertas</div>
          <div className="val num">{data?.warning_count ?? 0}</div>
          <div className="sub">requieren revisión</div>
        </div>
      </div>

      <div className="tbl">
        <div className="tbl-head" style={{ display: "grid", gridTemplateColumns: cols, gap: 14 }}>
          <div>Cuenta</div>
          <div className="r">Saldo cuenta</div>
          <div className="r">Movimientos</div>
          <div className="r">Diferencia</div>
          <div>Base</div>
          <div className="r">Estado</div>
        </div>
        {(data?.accounts ?? []).map((a) => (
          <div key={a.account_id} className="tbl-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{a.account_name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{a.transaction_count} mov.</div>
            </div>
            <div className="r mono" style={{ fontSize: 12 }}>{money(a.account_balance, a.currency)}</div>
            <div className="r mono" style={{ fontSize: 12 }}>{money(a.movement_balance, a.currency)}</div>
            <div className="r mono" style={{ fontSize: 12, color: a.status === "ok" ? "var(--acc)" : "var(--gold)" }}>{money(a.difference, a.currency)}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
              {a.reconciliation_basis === "statement" ? `${a.statement_count} cartola(s)` : "saldo cuenta"}
            </div>
            <div className="r">
              <span className={`chip ${a.status === "ok" ? "ok" : "warn"}`}>
                <span className="sw" />{a.status === "ok" ? "OK" : "REVISAR"}
              </span>
            </div>
          </div>
        ))}
        {data?.accounts.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">∅</div>
            <h4>Sin cuentas en {currency}</h4>
            <p>No hay cuentas con movimientos en esta moneda para el rango seleccionado.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
