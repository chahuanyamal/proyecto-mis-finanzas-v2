"use client";

import { authApi, settingsApi } from "@/lib/api";
import type { Settings } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type TabKey =
  | "perfil"
  | "personal"
  | "estado"
  | "concil"
  | "respaldo"
  | "dosfa"
  | "familias"
  | "reportes"
  | "ia"
  | "admin";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "perfil", label: "Perfil" },
  { key: "personal", label: "Personalización" },
  { key: "estado", label: "Estado" },
  { key: "concil", label: "Conciliación" },
  { key: "respaldo", label: "Respaldo" },
  { key: "dosfa", label: "2FA" },
  { key: "familias", label: "Familias" },
  { key: "reportes", label: "Reportes" },
  { key: "ia", label: "Inteligencia Artificial" },
  { key: "admin", label: "Administración" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState("CLP");
  const [theme, setTheme] = useState("dark");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabKey>("perfil");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwStatus, setPwStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  // Local-only UI state (template parity for sections without backend)
  const [sections, setSections] = useState({ resumen: true, movimientos: true, planificacion: true, taxonomia: true });
  const [aiProvider, setAiProvider] = useState("Ollama Cloud");
  const [aiBehavior, setAiBehavior] = useState({ revisar: true, autoaplicar: false, resumen: true });
  const [reportYear, setReportYear] = useState("2026 · YTD");
  const [concilRange, setConcilRange] = useState("12 meses");
  const [userFilter, setUserFilter] = useState("Todos · 1");

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/settings"); }, [hasVerified, router, user]);

  useEffect(() => {
    if (!user) return;
    settingsApi.get().then((r) => {
      setSettings(r.data);
      setFullName(r.data.full_name);
      const prefs = r.data.preferences ?? {};
      if (typeof prefs.default_currency === "string") setCurrency(prefs.default_currency as string);
      if (typeof prefs.theme === "string") setTheme(prefs.theme as string);
    }).catch(() => setError("No se pudieron cargar los ajustes."));
  }, [user]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setError("");
    try {
      const r = await settingsApi.update({
        full_name: fullName,
        preferences: { default_currency: currency, theme },
      });
      setSettings(r.data);
      setSaved(true);
    } catch { setError("No se pudieron guardar los ajustes."); }
  }

  const email = settings?.email ?? user?.email ?? "admin@finanzas.local";
  const displayName = fullName || settings?.full_name || "Administrador";

  return (
    <div className="content">
      <style jsx>{`
        .panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .section { padding: 22px 24px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 18px; }
        .section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--line-2); }
        .section-head .mark { width: 30px; height: 30px; border-radius: 7px; display: grid; place-items: center; font-family: "Instrument Serif", serif; font-style: italic; font-size: 16px; flex: 0 0 30px; }
        .section-head .mark.green { background: rgba(94,233,181,0.12); color: var(--acc); }
        .section-head .mark.gold { background: rgba(230,184,92,0.12); color: var(--gold); }
        .section-head .mark.violet { background: rgba(180,156,255,0.12); color: var(--violet); }
        .section-head .mark.rust { background: rgba(232,122,91,0.12); color: var(--rust); }
        .section-head h2 { font-size: 14px; font-weight: 500; letter-spacing: -0.005em; }
        .section-head .sub { flex: 1; font-size: 11px; color: var(--text-3); font-family: "Geist Mono", monospace; margin-left: 14px; letter-spacing: 0.04em; }
        .section-head .status { font-size: 10px; font-family: "Geist Mono", monospace; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px 8px; border-radius: 99px; }
        .section-head .status.ok { color: var(--acc); background: rgba(94,233,181,0.1); }
        .section-head .status.warn { color: var(--gold); background: rgba(230,184,92,0.1); }
        .section-head .status.err { color: var(--rust); background: rgba(232,122,91,0.1); }

        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .form-grid.full > :global(*) { grid-column: span 2; }

        .session { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line-2); }
        .session:last-child { border-bottom: 0; }
        .session :global(.mark) { width: 32px; height: 32px; border-radius: 7px; background: var(--bg-3); display: grid; place-items: center; color: var(--text-3); }
        .session :global(.mark.cur) { background: rgba(94,233,181,0.12); color: var(--acc); }
        .session :global(svg) { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.5; }
        .session :global(.info) { min-width: 0; }
        .session :global(.ttl) { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
        .session :global(.ttl .badge) { font-size: 9px; font-family: "Geist Mono", monospace; color: var(--acc); background: rgba(94,233,181,0.1); padding: 1px 6px; border-radius: 99px; letter-spacing: 0.08em; }
        .session :global(.meta) { font-size: 11px; color: var(--text-3); font-family: "Geist Mono", monospace; margin-top: 2px; letter-spacing: 0.04em; }

        .toggle-row { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--line-2); }
        .toggle-row:last-child { border-bottom: 0; }
        .toggle-row :global(.info) { flex: 1; }
        .toggle-row :global(.ttl) { font-size: 13px; font-weight: 500; letter-spacing: -0.005em; }
        .toggle-row :global(.subt) { font-size: 11px; color: var(--text-3); font-family: "Geist Mono", monospace; margin-top: 3px; letter-spacing: 0.04em; }

        .kpi-mini { padding: 14px 16px; background: var(--bg-3); border-radius: 7px; display: flex; flex-direction: column; gap: 4px; border-left: 2px solid var(--acc); }
        .kpi-mini.r { border-color: var(--rust); }
        .kpi-mini.g { border-color: var(--gold); }
        .kpi-mini.v { border-color: var(--violet); }
        .kpi-mini :global(.l) { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-3); font-family: "Geist Mono", monospace; }
        .kpi-mini :global(.v) { font-size: 20px; font-weight: 300; letter-spacing: -0.02em; color: var(--text); font-variant-numeric: tabular-nums; }
        .kpi-mini :global(.s) { font-size: 10px; color: var(--text-3); font-family: "Geist Mono", monospace; }

        .uhead { display: grid; grid-template-columns: auto 1fr 140px 110px 130px auto; gap: 14px; padding: 10px 14px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-3); font-family: "Geist Mono", monospace; border-bottom: 1px solid var(--line); background: var(--bg); }
        .urow { display: grid; grid-template-columns: auto 1fr 140px 110px 130px auto; gap: 14px; padding: 12px 14px; align-items: center; border-bottom: 1px solid var(--line-2); }
        .urow:last-child { border-bottom: 0; }
        .uav { width: 30px; height: 30px; border-radius: 50%; background: var(--gold); color: var(--bg); display: grid; place-items: center; font-weight: 600; font-size: 11px; }
        .uav.b { background: var(--violet); }
        .uname { font-size: 13px; font-weight: 500; }
        .uname :global(.sub) { display: block; font-size: 11px; color: var(--text-3); font-family: "Geist Mono", monospace; margin-top: 2px; }
        .urole { font-family: "Geist Mono", monospace; font-size: 11px; background: var(--bg-3); border: 1px solid var(--line); border-radius: 5px; padding: 4px 8px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-2); outline: none; }
        .ustatus { font-family: "Geist Mono", monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px 8px; border-radius: 99px; }
        .ustatus.ok { color: var(--acc); background: rgba(94,233,181,0.1); }
        .ustatus.paused { color: var(--gold); background: rgba(230,184,92,0.1); }
        .ulogin { font-family: "Geist Mono", monospace; font-size: 11px; color: var(--text-3); }
        .uactions { display: flex; gap: 6px; }
        .iconbtn { width: 28px; height: 28px; border-radius: 5px; background: var(--bg-3); border: 1px solid var(--line); color: var(--text-3); display: grid; place-items: center; cursor: pointer; }
        .iconbtn:hover { background: var(--bg-4); color: var(--text); }
        .iconbtn :global(svg) { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.5; }

        .provider-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
        .provider { padding: 9px 16px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); font-family: "Geist Mono", monospace; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); cursor: pointer; }
        .provider.on { background: var(--acc); color: var(--bg); border-color: var(--acc); font-weight: 600; }

        .slider-row { display: flex; align-items: center; gap: 14px; }
        .slider-row .lbl { font-family: "Geist Mono", monospace; font-size: 11px; color: var(--text-3); letter-spacing: 0.06em; text-transform: uppercase; flex: 0 0 140px; }
        .slider-row .track { flex: 1; height: 4px; background: var(--bg-3); border-radius: 2px; position: relative; cursor: pointer; }
        .slider-row .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--acc); border-radius: 2px; }
        .slider-row .handle { position: absolute; top: 50%; width: 16px; height: 16px; border-radius: 50%; background: var(--acc); transform: translate(-50%, -50%); box-shadow: 0 0 0 4px rgba(94,233,181,0.15); cursor: grab; }
        .slider-row .val { font-family: "Geist Mono", monospace; font-size: 13px; color: var(--text); font-variant-numeric: tabular-nums; flex: 0 0 60px; text-align: right; }

        .year-tabs { display: flex; gap: 6px; margin-bottom: 18px; background: var(--bg-3); border-radius: 7px; padding: 3px; width: fit-content; border: 1px solid var(--line); }
        .year-tabs button { background: transparent; border: 0; padding: 7px 18px; font: inherit; font-size: 13px; color: var(--text-3); cursor: pointer; font-family: "Geist Mono", monospace; border-radius: 5px; }
        .year-tabs button.on { background: var(--bg); color: var(--text); font-weight: 500; }

        .rep-strip { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-bottom: 18px; }
        .rep-strip :global(.kpi) { padding: 18px 20px; background: var(--bg-2); }
        .rep-strip :global(.kpi .val) { font-size: 22px; }

        .cat-bar { padding: 10px 0; border-bottom: 1px solid var(--line-2); display: grid; grid-template-columns: 120px 1fr 160px; gap: 14px; align-items: center; }
        .cat-bar:last-child { border-bottom: 0; }
        .cat-bar .nm { font-size: 13px; color: var(--text); font-weight: 500; }
        .cat-bar .br { height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden; }
        .cat-bar .br .fl { height: 100%; background: var(--acc); border-radius: 2px; }
        .cat-bar .am { font-family: "Geist Mono", monospace; font-size: 12px; text-align: right; color: var(--text-2); font-variant-numeric: tabular-nums; }
        .cat-bar .am .pct { color: var(--text-3); margin-left: 8px; }

        .bk-card { padding: 20px; background: var(--bg-3); border-radius: 10px; display: grid; grid-template-columns: auto 1fr auto; gap: 18px; align-items: center; margin-bottom: 14px; border: 1px solid var(--line-2); }
        .bk-card.coming { opacity: 0.55; }
        .bk-icon { width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; color: var(--acc); }
        .bk-icon.green { background: rgba(94,233,181,0.1); }
        .bk-icon.gold { background: rgba(230,184,92,0.1); color: var(--gold); }
        .bk-icon.violet { background: rgba(180,156,255,0.1); color: var(--violet); }
        .bk-icon :global(svg) { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 1.5; }
        .bk-info { flex: 1; }
        .bk-info :global(h4) { font-size: 14px; font-weight: 500; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
        .bk-info :global(h4 .badge) { font-size: 9px; font-family: "Geist Mono", monospace; color: var(--gold); background: rgba(230,184,92,0.12); padding: 2px 7px; border-radius: 99px; letter-spacing: 0.1em; text-transform: uppercase; }
        .bk-info :global(p) { font-size: 12px; color: var(--text-3); font-family: "Geist Mono", monospace; letter-spacing: 0.04em; line-height: 1.5; }

        .qr { width: 140px; height: 140px; background: var(--bg); border: 1px solid var(--line); border-radius: 7px; display: grid; place-items: center; font-family: "Geist Mono", monospace; font-size: 10px; color: var(--text-3); text-align: center; padding: 10px; }
      `}</style>

      <div className="title-row">
        <div>
          <h1>
            Hola, <span className="serif">{displayName}</span>
          </h1>
          <div className="sub">
            <strong>{email}</strong> · configurá perfil, sesiones, seguridad, integración con IA y administración
          </div>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 18 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="lbl">Error</div>
            <div className="txt">{error}</div>
          </div>
          <div />
        </div>
      ) : null}
      {saved ? (
        <div className="insight ok" style={{ marginBottom: 18 }}>
          <div className="insight-mark">✓</div>
          <div className="insight-body">
            <div className="lbl">Guardado</div>
            <div className="txt">Cambios guardados correctamente.</div>
          </div>
          <div />
        </div>
      ) : null}

      {/* Tabs */}
      <div className="tabs" style={{ overflowX: "auto" }}>
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`tab ${tab === t.key ? "on" : ""}`}
            style={{ flex: "0 0 auto", cursor: "pointer" }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* ───────── PERFIL ───────── */}
      {tab === "perfil" ? (
        <>
          <form onSubmit={save}>
            <div className="section">
              <div className="section-head">
                <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 5-6 8-6s7 2 8 6" /></svg></div>
                <h2>Perfil</h2>
                <span className="sub">datos personales · zona horaria · rol</span>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Nombre completo</label>
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" value={email} disabled />
                </div>
                <div className="field">
                  <label>Zona horaria</label>
                  <select className="input"><option>America/Santiago (UTC−4)</option><option>America/Buenos Aires</option><option>UTC</option></select>
                </div>
                <div className="field">
                  <label>Rol</label>
                  <input className="input" value="admin" disabled />
                </div>
              </div>
              <div style={{ textAlign: "right", marginTop: 6 }}>
                <button type="submit" className="btn primary">Guardar cambios</button>
              </div>
            </div>
          </form>

          <div className="section">
            <div className="section-head">
              <div className="mark gold"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="16" r="1" /><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></svg></div>
              <h2>Cambiar contraseña</h2>
              <span className="sub">min. 8 caracteres · 1 mayúscula · 1 número · 1 especial</span>
            </div>
            {pwStatus ? (
              <div className={`insight ${pwStatus.type === "success" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>
                <div className="insight-mark">{pwStatus.type === "success" ? "OK" : "!"}</div>
                <div className="insight-body"><div className="txt">{pwStatus.msg}</div></div>
                <div />
              </div>
            ) : null}
            <div className="form-grid full">
              <div className="field">
                <label>Contraseña actual</label>
                <input className="input" type="password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Nueva contraseña</label>
                <input className="input" type="password" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
              </div>
              <div className="field">
                <label>Confirmar</label>
                <input className="input" type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
              </div>
            </div>
            <div style={{ textAlign: "right", marginTop: 14 }}>
              <button type="button" className="btn primary" disabled={pwLoading} onClick={async () => {
                setPwStatus(null);
                if (pwForm.next !== pwForm.confirm) { setPwStatus({ type: "error", msg: "Las contraseñas no coinciden" }); return; }
                if (pwForm.next.length < 8 || !/[A-Z]/.test(pwForm.next) || !/[0-9]/.test(pwForm.next) || !/[^A-Za-z0-9]/.test(pwForm.next)) {
                  setPwStatus({ type: "error", msg: "Debe tener 8+ caracteres, 1 mayúscula, 1 número, 1 especial" }); return;
                }
                setPwLoading(true);
                try {
                  await authApi.changePassword(pwForm.current, pwForm.next);
                  setPwStatus({ type: "success", msg: "Contraseña actualizada" });
                  setPwForm({ current: "", next: "", confirm: "" });
                } catch (err: unknown) {
                  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                  setPwStatus({ type: "error", msg: detail ?? "Error al cambiar contraseña" });
                } finally { setPwLoading(false); }
              }}>
                {pwLoading ? "Cambiando…" : "Actualizar contraseña"}
              </button>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark violet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8" /><path d="M12 16v4" /></svg></div>
              <h2>Sesiones activas</h2>
              <span className="sub">sesión actual · este dispositivo</span>
            </div>
            <div className="session">
              <div className="mark cur"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 16v4" /></svg></div>
              <div className="info">
                <div className="ttl">Este dispositivo <span className="badge">SESIÓN ACTUAL</span></div>
                <div className="meta">{email}</div>
              </div>
              <div></div>
            </div>
          </div>
        </>
      ) : null}

      {/* ───────── PERSONALIZACIÓN ───────── */}
      {tab === "personal" ? (
        <form onSubmit={save}>
          <div className="section">
            <div className="section-head">
              <div className="mark violet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="7" cy="6" r="1.5" fill="currentColor" /><circle cx="14" cy="12" r="1.5" fill="currentColor" /><circle cx="10" cy="18" r="1.5" fill="currentColor" /></svg></div>
              <h2>Secciones visibles</h2>
              <span className="sub">qué secciones aparecen en la barra lateral · ocultar no elimina datos</span>
              <button type="button" className="btn ghost" style={{ fontSize: 11 }} onClick={() => setSections({ resumen: true, movimientos: true, planificacion: true, taxonomia: true })}>Mostrar todas</button>
              <button type="button" className="btn ghost" style={{ fontSize: 11 }} onClick={() => setSections({ resumen: false, movimientos: false, planificacion: false, taxonomia: false })}>Ocultar todas</button>
            </div>
            <div className="form-grid">
              {([
                { key: "resumen", ttl: "Resumen", sub: "TABLERO · COMPARAR · PATRIMONIO" },
                { key: "movimientos", ttl: "Movimientos", sub: "MOVIMIENTOS · CARTOLAS · POR REVISAR" },
                { key: "planificacion", ttl: "Planificación", sub: "PRESUPUESTOS · METAS · SUSCRIPCIONES" },
                { key: "taxonomia", ttl: "Taxonomía", sub: "CUENTAS · CATEGORÍAS · ETIQUETAS · REGLAS" },
              ] as const).map((s) => (
                <div className="toggle-row" key={s.key}>
                  <div className="info">
                    <div className="ttl">{s.ttl}</div>
                    <div className="subt">{s.sub}</div>
                  </div>
                  <div
                    className={`toggle ${sections[s.key] ? "on" : ""}`}
                    onClick={() => setSections((p) => ({ ...p, [s.key]: !p[s.key] }))}
                  ></div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 16, fontSize: 11, color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", fontStyle: "italic" }}>La sección &quot;Sistema&quot; y &quot;Ajustes&quot; siempre permanecen visibles para que puedas volver a esta configuración.</p>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></svg></div>
              <h2>Apariencia</h2>
              <span className="sub">tema · densidad · formato de moneda</span>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Tema</label>
                <select className="input" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="dark">Bóveda · Oscuro (actual)</option>
                  <option value="light">Cuaderno · Claro</option>
                  <option value="system">Sistema (auto)</option>
                </select>
              </div>
              <div className="field">
                <label>Densidad</label>
                <select className="input"><option>Cómoda</option><option>Normal (actual)</option><option>Compacta</option></select>
              </div>
              <div className="field">
                <label>Moneda principal</label>
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="CLP">CLP — Peso chileno</option>
                  <option value="USD">USD — Dólar</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
              <div className="field">
                <label>Formato números</label>
                <select className="input"><option>1.234.567,89 (Chile)</option><option>1,234,567.89 (USA)</option></select>
              </div>
            </div>
            <div style={{ textAlign: "right", marginTop: 16 }}>
              <button type="submit" className="btn primary">Guardar cambios</button>
            </div>
          </div>
        </form>
      ) : null}

      {/* ───────── ESTADO ───────── */}
      {tab === "estado" ? (
        <>
          <div className="section">
            <div className="section-head">
              <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-5z" /><path d="m9 12 2 2 4-4" /></svg></div>
              <h2>Servicios</h2>
              <span className="sub">estado en tiempo real · actualizado 11:45 a.m.</span>
              <span className="status ok">● Operativo</span>
            </div>
            <div className="panel-grid">
              <div className="bk-card">
                <div className="bk-icon green"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg></div>
                <div className="bk-info">
                  <h4>Base de datos · PostgreSQL <span className="badge" style={{ color: "var(--acc)", background: "rgba(94,233,181,0.12)" }}>ONLINE</span></h4>
                  <p>v16.2 · 142 ms latencia prom. · 617 movs · 8 tablas · 84 MB</p>
                </div>
              </div>
              <div className="bk-card">
                <div className="bk-icon violet"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.5" /><circle cx="15" cy="15" r="1.5" /><path d="m9 15 6-6" /></svg></div>
                <div className="bk-info">
                  <h4>Cache · Redis <span className="badge" style={{ color: "var(--acc)", background: "rgba(94,233,181,0.12)" }}>ONLINE</span></h4>
                  <p>v7.2 · 12 ms latencia · 1.842 claves · 4,1 MB · TTL prom 5 min</p>
                </div>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark gold"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg></div>
              <h2>Métricas · últimas 24h</h2>
              <span className="sub">throughput · errores · latencias</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              <div className="kpi-mini"><div className="l">Requests</div><div className="v num">8.422</div><div className="s">p95 142ms</div></div>
              <div className="kpi-mini g"><div className="l">Errores 5xx</div><div className="v num">3</div><div className="s">0,04% · todos 503 brief</div></div>
              <div className="kpi-mini r"><div className="l">Login fallidos</div><div className="v num">2</div><div className="s">2 IPs únicas</div></div>
              <div className="kpi-mini v"><div className="l">OCR cartolas</div><div className="v num">7</div><div className="s">6 OK · 1 timeout</div></div>
            </div>
          </div>
        </>
      ) : null}

      {/* ───────── CONCILIACIÓN ───────── */}
      {tab === "concil" ? (
        <div className="section">
          <div className="section-head">
            <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 9l4 4 4-4M7 15l4-4 4 4" /></svg></div>
            <h2>Conciliación · cartola vs. saldo calculado</h2>
            <span className="sub">verifica que los movimientos extraídos coincidan con el saldo real</span>
            <div className="seg">
              {["Este mes", "30 días", "Este año", "12 meses", "Custom"].map((r) => (
                <button key={r} className={concilRange === r ? "on" : ""} onClick={() => setConcilRange(r)}>{r}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
            <div className="kpi-mini"><div className="l">Cuentas conciliadas</div><div className="v num">8 <span style={{ fontSize: 13, color: "var(--text-3)" }}>/ 11</span></div><div className="s">73% al día</div></div>
            <div className="kpi-mini g"><div className="l">Diferencias</div><div className="v num">3</div><div className="s">$2.450 + $180 + $99K</div></div>
            <div className="kpi-mini v"><div className="l">Último check</div><div className="v" style={{ fontSize: 14 }}>23 may · 11:42</div><div className="s">5 cartolas procesadas</div></div>
          </div>

          <div className="tbl">
            <div className="uhead" style={{ gridTemplateColumns: "1fr 140px 140px 110px 100px" }}>
              <div>Cuenta</div><div className="r">Saldo cartola</div><div className="r">Saldo calculado</div><div className="r">Diferencia</div><div className="r">Estado</div>
            </div>
            <div className="urow" style={{ gridTemplateColumns: "1fr 140px 140px 110px 100px" }}>
              <div className="uname">BICE CC 21-74531-6<span className="sub">CTA. CORRIENTE CLP</span></div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$3.420.500</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$3.420.500</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace", color: "var(--acc)" }}>$0</div>
              <div className="r"><span className="ustatus ok">OK</span></div>
            </div>
            <div className="urow" style={{ gridTemplateColumns: "1fr 140px 140px 110px 100px" }}>
              <div className="uname">Itaú CC 229710172<span className="sub">CTA. CORRIENTE CLP</span></div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$1.245.000</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$1.245.000</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace", color: "var(--acc)" }}>$0</div>
              <div className="r"><span className="ustatus ok">OK</span></div>
            </div>
            <div className="urow" style={{ gridTemplateColumns: "1fr 140px 140px 110px 100px", background: "rgba(230,184,92,0.04)" }}>
              <div className="uname">BICE TC Internacional 9424<span className="sub">TARJETA USD</span></div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$847,30</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$844,85</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace", color: "var(--gold)" }}>+$2,45</div>
              <div className="r"><span className="ustatus paused">REVISAR</span></div>
            </div>
            <div className="urow" style={{ gridTemplateColumns: "1fr 140px 140px 110px 100px" }}>
              <div className="uname">Prex 13777222<span className="sub">CTA. CORRIENTE CLP</span></div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$185.000</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$185.000</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace", color: "var(--acc)" }}>$0</div>
              <div className="r"><span className="ustatus ok">OK</span></div>
            </div>
            <div className="urow" style={{ gridTemplateColumns: "1fr 140px 140px 110px 100px" }}>
              <div className="uname">TD Bank Checking 6169579<span className="sub">USD</span></div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$2.480,50</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace" }}>$2.480,50</div>
              <div className="r mono" style={{ fontFamily: "'Geist Mono',monospace", color: "var(--acc)" }}>$0</div>
              <div className="r"><span className="ustatus ok">OK</span></div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ───────── RESPALDO ───────── */}
      {tab === "respaldo" ? (
        <div className="section">
          <div className="section-head">
            <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg></div>
            <h2>Descargar respaldo</h2>
            <span className="sub">último respaldo · hace 4 días · 18,2 MB</span>
          </div>
          <div className="bk-card">
            <div className="bk-icon green"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg></div>
            <div className="bk-info">
              <h4>Respaldo ZIP completo</h4>
              <p>Exporta TODAS tus cuentas, movimientos, categorías, reglas y configuración en un archivo ZIP. Ideal antes de migrar o como copia de seguridad. <strong style={{ color: "var(--text-2)" }}>617 movs + 38 cartolas + 24 categorías</strong></p>
            </div>
            <button type="button" className="btn primary lg" onClick={async () => {
              try {
                const r = await settingsApi.backup();
                const url = URL.createObjectURL(r.data as Blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `finanzas-backup-${new Date().toISOString().slice(0, 10)}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                setBackupMsg("Respaldo descargado");
              } catch { setBackupMsg("Error al generar respaldo"); }
            }}>↓ Descargar respaldo</button>
          </div>
          <div className="bk-card">
            <div className="bk-icon gold"><svg viewBox="0 0 24 24"><path d="M12 21V9m0 0 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg></div>
            <div className="bk-info">
              <h4>Importar datos</h4>
              <p>Cargá un archivo ZIP de respaldo generado por esta aplicación. Solo se agregan datos nuevos, no se sobrescribe nada.</p>
            </div>
            <label className="btn ghost lg" style={{ cursor: "pointer" }}>
              {importLoading ? "Importando…" : "Seleccionar ZIP"}
              <input
                type="file" accept=".zip" hidden disabled={importLoading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImportLoading(true);
                  setImportMsg("");
                  try {
                    const r = await settingsApi.backupImport(file);
                    setImportMsg(`Importados: ${Object.entries(r.data.imported).map(([k, v]) => `${k}:${v}`).join(", ")}`);
                  } catch {
                    setImportMsg("Error al importar respaldo");
                  } finally { setImportLoading(false); }
                }}
              />
            </label>
          </div>
          <div className="bk-card coming">
            <div className="bk-icon violet"><svg viewBox="0 0 24 24"><path d="M5 16a4 4 0 0 0 4 4h6a5 5 0 1 0-1-9.9A6 6 0 0 0 5 16z" /></svg></div>
            <div className="bk-info">
              <h4>Dropbox / Google Drive <span className="badge">Próximamente</span></h4>
              <p>Sincronización automática con Dropbox y Google Drive. Copias de seguridad programadas sin intervención manual.</p>
            </div>
            <div />
          </div>
          {backupMsg ? <p className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--acc)" }}>{backupMsg}</p> : null}
          {importLoading ? <p className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--text-3)" }}>Importando…</p> : null}
          {importMsg ? <p className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--acc)" }}>{importMsg}</p> : null}
        </div>
      ) : null}

      {/* ───────── 2FA ───────── */}
      {tab === "dosfa" ? (
        <div className="section">
          <div className="section-head">
            <div className="mark gold"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></svg></div>
            <h2>Autenticación en dos pasos (2FA)</h2>
            <span className="sub">capa extra de seguridad · TOTP via app autenticadora</span>
            <span className="status err">● Desactivado</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "center", padding: "14px 0" }}>
            <div className="qr">
              ▓▓▓▓▓<br />▓ QR ▓<br />▓▓▓▓▓<br /><span style={{ opacity: 0.5 }}>escanea con app autenticadora</span>
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Protege tu cuenta con un segundo factor</h3>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 14 }}>Necesitarás una app como <strong>Google Authenticator</strong>, <strong>Authy</strong>, <strong>1Password</strong> o cualquier compatible con TOTP. Tras escanear, ingresa los 6 dígitos generados para activar.</p>
              <div className="field" style={{ maxWidth: 220, marginBottom: 14 }}>
                <label>Código de verificación (6 dígitos)</label>
                <input className="input" placeholder="123 456" style={{ fontFamily: "'Geist Mono',monospace", fontSize: 18, letterSpacing: "0.3em", textAlign: "center" }} />
              </div>
              <button type="button" className="btn primary lg">Activar 2FA</button>
              <p style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", marginTop: 14 }}>CLAVE MANUAL: <code style={{ color: "var(--acc)", background: "var(--bg)", padding: "2px 8px", borderRadius: 4 }}>JBSW Y3DP EHPK 3PXP</code></p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ───────── FAMILIAS ───────── */}
      {tab === "familias" ? (
        <div className="section">
          <div className="section-head">
            <div className="mark violet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M14 19c0-2 2-4 4-4s3 1 3 3" /></svg></div>
            <h2>Familias</h2>
            <span className="sub">compartí cuentas con tu pareja, familia o socios</span>
            <button type="button" className="btn primary">+ Nueva familia</button>
          </div>

          <div className="bk-card">
            <div className="uav b" style={{ width: 40, height: 40, borderRadius: 10, fontSize: 14 }}>M</div>
            <div className="bk-info">
              <h4>Núcleo Mardini-Romero <span className="badge" style={{ color: "var(--acc)", background: "rgba(94,233,181,0.1)" }}>ACTIVA</span></h4>
              <p>2 miembros · 4 cuentas compartidas · creada 12 ene 2026 · saldo consolidado <strong style={{ color: "var(--text-2)" }}>$18.245.000</strong></p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="btn ghost">Configurar</button>
              <button type="button" className="iconbtn"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></svg></button>
            </div>
          </div>

          <h3 style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", margin: "24px 0 12px" }}>Miembros de la familia · 2</h3>

          <div className="uhead">
            <div></div><div>Miembro</div><div>Rol</div><div>Cuentas compartidas</div><div>Último acceso</div><div></div>
          </div>
          <div className="urow">
            <div className="uav">A</div>
            <div className="uname">Administrador (tú)<span className="sub">ADMIN@FINANZAS.LOCAL</span></div>
            <div><span className="urole" style={{ display: "inline-block" }}>PROPIETARIO</span></div>
            <div className="ulogin">11 / 11</div>
            <div className="ulogin">activo ahora</div>
            <div></div>
          </div>
          <div className="urow">
            <div className="uav b">P</div>
            <div className="uname">Pamela R.<span className="sub">PAMELA@FINANZAS.LOCAL · INVITACIÓN ACEPTADA 14 ENE</span></div>
            <div><span className="urole" style={{ display: "inline-block" }}>CO-PROPIETARIA</span></div>
            <div className="ulogin">4 / 11</div>
            <div className="ulogin">hoy · 10:22</div>
            <div className="uactions">
              <button type="button" className="iconbtn"><svg viewBox="0 0 24 24"><path d="M11 4h6v6" /><path d="M21 14v6h-6" /><path d="M10 14 21 3" /><path d="M3 14v6h6" /></svg></button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ───────── REPORTES ───────── */}
      {tab === "reportes" ? (
        <div className="section">
          <div className="section-head">
            <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18" /><rect x="7" y="13" width="3" height="5" /><rect x="12" y="9" width="3" height="9" /><rect x="17" y="6" width="3" height="12" /></svg></div>
            <h2>Reporte anual</h2>
            <span className="sub">resumen completo del año · exportable a PDF</span>
            <button type="button" className="btn ghost">↓ Exportar PDF</button>
          </div>

          <div className="year-tabs">
            {["2024", "2025", "2026 · YTD"].map((y) => (
              <button key={y} className={reportYear === y ? "on" : ""} onClick={() => setReportYear(y)}>{y}</button>
            ))}
          </div>

          <div className="rep-strip">
            <div className="kpi">
              <div className="lbl"><span className="sw"></span>Ingresos · 2026 YTD</div>
              <div className="val"><span className="cu">CLP</span><span className="pos">13.976.126</span></div>
              <div className="sub">5 categorías · sueldo + freelance</div>
            </div>
            <div className="kpi r">
              <div className="lbl"><span className="sw"></span>Gastos · 2026 YTD</div>
              <div className="val"><span className="cu">CLP</span><span className="neg">14.344.032</span></div>
              <div className="sub">23 categorías activas</div>
            </div>
            <div className="kpi g">
              <div className="lbl"><span className="sw"></span>Ahorro neto</div>
              <div className="val"><span className="cu">CLP</span>−367.905</div>
              <div className="sub">incluye pagos tarjeta · ajustar</div>
            </div>
            <div className="kpi v">
              <div className="lbl"><span className="sw"></span>Transacciones</div>
              <div className="val num">209</div>
              <div className="sub">prom. 42 / mes</div>
            </div>
          </div>

          <h3 style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-2)", fontWeight: 500, fontFamily: "'Geist Mono',monospace", margin: "24px 0 14px" }}>Gastos por categoría · top 10</h3>

          {[
            { nm: "Pago Tarjeta Crédito", w: "82.3%", c: "var(--acc)", am: "$11.809.530", pct: "82,3%" },
            { nm: "Vivienda", w: "6.4%", c: "var(--gold)", am: "$918.390", pct: "6,4%" },
            { nm: "Sin Categorizar", w: "4.5%", c: "var(--rust)", am: "$649.184", pct: "4,5%" },
            { nm: "Supermercado", w: "4.3%", c: "var(--acc)", am: "$616.734", pct: "4,3%" },
            { nm: "Uber / Taxi", w: "1.1%", c: "var(--blue)", am: "$157.813", pct: "1,1%" },
            { nm: "Combustible", w: "0.6%", c: "var(--acc)", am: "$80.000", pct: "0,6%" },
            { nm: "Comisiones", w: "0.5%", c: "var(--gold)", am: "$77.168", pct: "0,5%" },
            { nm: "Seguros", w: "0.2%", c: "var(--acc)", am: "$25.000", pct: "0,2%" },
            { nm: "Restaurantes", w: "0.05%", c: "var(--acc)", am: "$3.980", pct: "0,0%" },
            { nm: "Alimentación", w: "0.04%", c: "var(--acc)", am: "$2.990", pct: "0,0%" },
          ].map((c) => (
            <div className="cat-bar" key={c.nm}>
              <div className="nm">{c.nm}</div>
              <div className="br"><div className="fl" style={{ width: c.w, background: c.c }}></div></div>
              <div className="am">{c.am} <span className="pct">{c.pct}</span></div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ───────── INTELIGENCIA ARTIFICIAL ───────── */}
      {tab === "ia" ? (
        <>
          <div className="section">
            <div className="section-head">
              <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /><circle cx="12" cy="12" r="3" /></svg></div>
              <h2>AI · Cloud LLM</h2>
              <span className="sub">categorización + revisión de cartolas con un proveedor cloud</span>
              <span className="status ok">● Token OK</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14, lineHeight: 1.6 }}>Conectá un proveedor cloud — auto-categoriza transacciones y revisa el cuadre de cartolas. <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", color: "var(--text-3)" }}>Tus datos viajan solo al endpoint que definas.</span></p>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark violet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12h18M12 3v18" /></svg></div>
              <h2>Provider</h2>
              <span className="sub">elegí el endpoint</span>
            </div>
            <div className="provider-row">
              {["Ollama Cloud", "NVIDIA Build", "OpenRouter", "Custom (OpenAI-compatible)"].map((p) => (
                <button type="button" key={p} className={`provider ${aiProvider === p ? "on" : ""}`} onClick={() => setAiProvider(p)}>{p}</button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", letterSpacing: "0.04em" }}>API: OLLAMA NATIVE (/API/TAGS · /API/GENERATE)</p>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark gold"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M2 12h20M12 2c3 4 3 16 0 20M12 2c-3 4-3 16 0 20" /></svg></div>
              <h2>Endpoint</h2>
              <span className="sub">URL + token bearer</span>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Base URL</label>
                <input className="input" defaultValue="https://ollama.com/api" />
              </div>
              <div className="field">
                <label>Bearer token <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", color: "var(--text-3)", textTransform: "none", letterSpacing: 0, fontSize: 12 }}>— definido · vacíalo para borrar</span></label>
                <input className="input" type="password" defaultValue="••••••••" />
              </div>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", marginTop: 8, fontStyle: "italic" }}>Solo el host — no incluyas /api al final.</p>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg></div>
              <h2>Modelo</h2>
              <span className="sub">sin consultar · ingresá Base URL y apretá Fetch</span>
              <button type="button" className="btn ghost">↻ Fetch models</button>
            </div>
            <div className="field">
              <label>Modelo (manual)</label>
              <input className="input" defaultValue="deepseek-v4-flash" />
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", marginTop: 8, fontStyle: "italic" }}>Ingresá URL y token, después apretá Fetch models para listar disponibles.</p>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark violet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12a9 9 0 1 1-9-9M12 7v5l4 2" /></svg></div>
              <h2>Behavior</h2>
              <span className="sub">categorización + revisión automática</span>
            </div>
            <div className="slider-row" style={{ marginBottom: 18 }}>
              <div className="lbl">Umbral confianza<br /><span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", color: "var(--acc)", textTransform: "none", fontSize: 14, letterSpacing: 0 }}>(0.75)</span></div>
              <div className="track"><div className="fill" style={{ width: "75%" }}></div><div className="handle" style={{ left: "75%" }}></div></div>
              <div className="val">0,75</div>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", marginBottom: 18, fontStyle: "italic" }}>Confianza mínima para aplicar la categoría sugerida — default 0,75.</p>

            <div className="toggle-row">
              <div className="info">
                <div className="ttl">Revisar cartolas al subirlas</div>
                <div className="subt">LLAMA AL MODELO APENAS TERMINA EL PARSEO PARA VALIDAR EL CUADRE</div>
              </div>
              <div className={`toggle ${aiBehavior.revisar ? "on" : ""}`} onClick={() => setAiBehavior((p) => ({ ...p, revisar: !p.revisar }))}></div>
            </div>
            <div className="toggle-row">
              <div className="info">
                <div className="ttl">Auto-aplicar reglas sugeridas</div>
                <div className="subt">SI LA CONFIANZA ES ≥ UMBRAL · CREA LA REGLA SIN CONFIRMAR</div>
              </div>
              <div className={`toggle ${aiBehavior.autoaplicar ? "on" : ""}`} onClick={() => setAiBehavior((p) => ({ ...p, autoaplicar: !p.autoaplicar }))}></div>
            </div>
            <div className="toggle-row">
              <div className="info">
                <div className="ttl">Resumen mensual automático</div>
                <div className="subt">GENERA UN INFORME EN PROSA EL PRIMER DÍA DE CADA MES</div>
              </div>
              <div className={`toggle ${aiBehavior.resumen ? "on" : ""}`} onClick={() => setAiBehavior((p) => ({ ...p, resumen: !p.resumen }))}></div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" className="btn ghost">↻ Probar conexión</button>
              <button type="button" className="btn primary">💾 Guardar configuración</button>
            </div>
          </div>
        </>
      ) : null}

      {/* ───────── ADMINISTRACIÓN ───────── */}
      {tab === "admin" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
            <div className="kpi"><div className="lbl"><span className="sw"></span>Usuarios</div><div className="val num">1 <span style={{ fontSize: 14, color: "var(--text-3)" }}>/ 1</span></div><div className="sub">activos / totales</div></div>
            <div className="kpi"><div className="lbl"><span className="sw"></span>Cuentas</div><div className="val num">11</div><div className="sub">10 instituciones</div></div>
            <div className="kpi g"><div className="lbl"><span className="sw"></span>Cartolas</div><div className="val num">38</div><div className="sub" style={{ color: "var(--gold)" }}>⚠ 7 con problemas</div></div>
            <div className="kpi"><div className="lbl"><span className="sw"></span>Movimientos</div><div className="val num">617</div><div className="sub">total en BD</div></div>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-5z" /></svg></div>
              <h2>Salud del sistema</h2>
              <span className="sub">DB · Redis · cola de cartolas · ambiente actual</span>
              <span className="status warn">● Degraded</span>
              <button type="button" className="btn ghost">🔧 Reparar seed</button>
              <button type="button" className="btn ghost">🔑 Reparar admin</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 18 }}>
              <div className="kpi-mini g"><div className="l">Estado</div><div className="v" style={{ fontSize: 16, color: "var(--gold)" }}>degraded</div><div className="s">2 servicios lentos</div></div>
              <div className="kpi-mini"><div className="l">DB</div><div className="v" style={{ fontSize: 16, color: "var(--acc)" }}>online</div><div className="s">142ms</div></div>
              <div className="kpi-mini"><div className="l">Redis</div><div className="v" style={{ fontSize: 16, color: "var(--acc)" }}>online</div><div className="s">12ms</div></div>
              <div className="kpi-mini"><div className="l">En cola</div><div className="v num">0</div><div className="s">vacía</div></div>
              <div className="kpi-mini"><div className="l">Problemas</div><div className="v num">0</div><div className="s">sin alertas</div></div>
            </div>

            <h3 style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", marginBottom: 12 }}>Telemetría reciente · 24h / 7d</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10 }}>
              <div className="kpi-mini"><div className="l">Cartolas 7d</div><div className="v num">5</div><div className="s">−</div></div>
              <div className="kpi-mini"><div className="l">OK 7d</div><div className="v num" style={{ color: "var(--acc)" }}>4</div><div className="s">80%</div></div>
              <div className="kpi-mini r"><div className="l">Errores 24h</div><div className="v num">3</div><div className="s">503 brief</div></div>
              <div className="kpi-mini"><div className="l">OCR 24h</div><div className="v num">7</div><div className="s">−</div></div>
              <div className="kpi-mini g"><div className="l">Previews</div><div className="v num">12</div><div className="s">−</div></div>
              <div className="kpi-mini v"><div className="l">Categ. IA 24h</div><div className="v num">84</div><div className="s">−</div></div>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <div className="mark violet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="8" r="3" /><path d="M3 21c0-3 3-6 6-6s6 3 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M14 19c0-2 2-4 4-4s3 1 3 3" /></svg></div>
              <h2>Usuarios</h2>
              <span className="sub">1 administrador · 0 miembros</span>
              <div className="seg">
                {["Todos · 1", "Admins · 1", "Members · 0"].map((f) => (
                  <button key={f} className={userFilter === f ? "on" : ""} onClick={() => setUserFilter(f)}>{f}</button>
                ))}
              </div>
            </div>

            <div className="filt-search" style={{ marginBottom: 14 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input placeholder="Buscar usuario por nombre o email…" />
            </div>

            <div className="tbl">
              <div className="uhead">
                <div></div><div>Usuario</div><div>Rol</div><div>Estado</div><div>Último login</div><div>Acciones</div>
              </div>
              <div className="urow">
                <div className="uav">A</div>
                <div className="uname">Administrador<span className="sub">ADMIN@FINANZAS.LOCAL · 1 CON PERMISOS ELEVADOS</span></div>
                <div><select className="urole" defaultValue="ADMIN"><option>ADMIN</option><option>MEMBER</option></select></div>
                <div><span className="ustatus ok">ACTIVO</span></div>
                <div className="ulogin">23 may 2026</div>
                <div className="uactions">
                  <button type="button" className="iconbtn"><svg viewBox="0 0 24 24"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 0 15 6" /><path d="M3 7a9 9 0 0 1 15-6" /></svg></button>
                  <button type="button" className="iconbtn"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></svg></button>
                  <button type="button" className="iconbtn"><svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg></button>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'Geist Mono',monospace", marginTop: 10 }}>1 DE 1 USUARIOS</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div className="section" style={{ marginBottom: 0 }}>
              <div className="section-head">
                <div className="mark green"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="8" r="3" /><path d="M3 21c0-3 3-6 6-6s6 3 6 6" /><path d="M18 6v8M14 10h8" /></svg></div>
                <h2 style={{ fontSize: 13 }}>Crear usuario</h2>
              </div>
              <div className="field"><label>Email</label><input className="input" placeholder="email" /></div>
              <div className="field"><label>Nombre completo</label><input className="input" placeholder="Nombre completo" /></div>
              <div className="field"><label>Contraseña inicial</label><input className="input" placeholder="mín. 8 caracteres" /></div>
              <div className="field"><label>Rol</label><select className="input"><option>member</option><option>admin</option></select></div>
              <button type="button" className="btn primary" style={{ width: "100%" }}>+ Crear usuario</button>
            </div>
            <div className="section" style={{ marginBottom: 0 }}>
              <div className="section-head">
                <div className="mark gold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="16" r="1" /><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></svg></div>
                <h2 style={{ fontSize: 13 }}>Resetear contraseña</h2>
              </div>
              <div className="field"><label>Email del usuario</label><input className="input" placeholder="usuario@dominio.cl" /></div>
              <div className="field"><label>Nueva contraseña</label><input className="input" placeholder="mín. 8 caracteres" /></div>
              <button type="button" className="btn primary" style={{ width: "100%" }}>🔑 Actualizar</button>
            </div>
            <div className="section" style={{ marginBottom: 0 }}>
              <div className="section-head">
                <div className="mark violet"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 4v4M16 4v4" /></svg></div>
                <h2 style={{ fontSize: 13 }}>Sistema</h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}><span style={{ color: "var(--text-3)" }}>Instituciones</span><strong style={{ color: "var(--text)" }}>10</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}><span style={{ color: "var(--text-3)" }}>Cartolas OK</span><strong style={{ color: "var(--acc)" }}>31</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}><span style={{ color: "var(--text-3)" }}>En proceso</span><strong style={{ color: "var(--text)" }}>0</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}><span style={{ color: "var(--text-3)" }}>Con problemas</span><strong style={{ color: "var(--gold)" }}>7</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line-2)" }}><span style={{ color: "var(--text-3)" }}>Ambiente</span><strong style={{ color: "var(--text)" }}>production</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}><span style={{ color: "var(--text-3)" }}>App</span><strong style={{ color: "var(--text)", fontFamily: "'Instrument Serif',serif", fontStyle: "italic", fontSize: 14 }}>Finanzas Personales</strong></div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
