"use client";

import { settingsApi } from "@/lib/api";
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

function ComingSoonPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <div className="empty-mark">⌁</div>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  );
}

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

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login?next=/settings"); }, [hasVerified, router, user]);

  useEffect(() => {
    if (!user) return;
    settingsApi.get().then((r) => {
      setSettings(r.data);
      setFullName(r.data.full_name);
      const prefs = r.data.preferences ?? {};
      if (typeof prefs.default_currency === "string") setCurrency(prefs.default_currency);
      if (typeof prefs.theme === "string") setTheme(prefs.theme);
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

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Ajus<span className="serif">tes</span>
          </h1>
          <div className="sub">
            <strong>{settings?.email ?? user?.email ?? "—"}</strong> · perfil, personalización y administración
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
        <form onSubmit={save}>
          <div className="panel">
            <div className="panel-head">
              <h3>Perfil</h3>
              <span className="meta">datos personales · preferencias</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label>Nombre completo</label>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="field">
                <label>Email</label>
                <input className="input" value={settings?.email ?? ""} disabled />
              </div>
              <div className="field">
                <label>Moneda principal</label>
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="CLP">CLP — Peso chileno</option>
                  <option value="USD">USD — Dólar</option>
                </select>
              </div>
              <div className="field">
                <label>Tema</label>
                <select className="input" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="dark">Bóveda · Oscuro</option>
                  <option value="light">Cuaderno · Claro</option>
                </select>
              </div>
            </div>
            <div style={{ textAlign: "right", marginTop: 16 }}>
              <button type="submit" className="btn primary">Guardar cambios</button>
            </div>
          </div>
        </form>
      ) : null}

      {/* ───────── PERSONALIZACIÓN ───────── */}
      {tab === "personal" ? (
        <form onSubmit={save}>
          <div className="panel">
            <div className="panel-head">
              <h3>Apariencia</h3>
              <span className="meta">tema · moneda</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label>Tema</label>
                <select className="input" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="dark">Bóveda · Oscuro</option>
                  <option value="light">Cuaderno · Claro</option>
                </select>
              </div>
              <div className="field">
                <label>Moneda principal</label>
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="CLP">CLP — Peso chileno</option>
                  <option value="USD">USD — Dólar</option>
                </select>
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
        <div className="panel">
          <div className="panel-head">
            <h3>Estado del sistema</h3>
            <span className="meta">servicios · métricas</span>
          </div>
          <ComingSoonPanel
            title="Telemetría en construcción"
            description="El monitoreo de servicios y métricas aún no está disponible en esta versión."
          />
        </div>
      ) : null}

      {/* ───────── CONCILIACIÓN ───────── */}
      {tab === "concil" ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Conciliación</h3>
            <span className="meta">cartola vs. saldo calculado</span>
          </div>
          <div className="empty">
            <div className="empty-mark">⇄</div>
            <h4>Disponible en su propia sección</h4>
            <p>
              La conciliación tiene una vista dedicada con filtros y detalle por cuenta.
            </p>
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => router.push("/reconciliation")}>
              Ir a Reconciliación
            </button>
          </div>
        </div>
      ) : null}

      {/* ───────── RESPALDO ───────── */}
      {tab === "respaldo" ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Respaldo</h3>
            <span className="meta">exportar · importar</span>
          </div>
          <ComingSoonPanel
            title="Respaldo en construcción"
            description="La exportación e importación de respaldos ZIP aún no está disponible en esta versión."
          />
        </div>
      ) : null}

      {/* ───────── 2FA ───────── */}
      {tab === "dosfa" ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Autenticación en dos pasos</h3>
            <span className="meta">TOTP · seguridad</span>
          </div>
          <ComingSoonPanel
            title="2FA en construcción"
            description="La autenticación en dos pasos vía app autenticadora aún no está disponible en esta versión."
          />
        </div>
      ) : null}

      {/* ───────── FAMILIAS ───────── */}
      {tab === "familias" ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Familias</h3>
            <span className="meta">cuentas compartidas</span>
          </div>
          <ComingSoonPanel
            title="Familias en construcción"
            description="Compartir cuentas con tu pareja, familia o socios aún no está disponible en esta versión."
          />
        </div>
      ) : null}

      {/* ───────── REPORTES ───────── */}
      {tab === "reportes" ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Reportes</h3>
            <span className="meta">resumen anual</span>
          </div>
          <div className="empty">
            <div className="empty-mark">▤</div>
            <h4>Disponible en su propia sección</h4>
            <p>Los reportes anuales con KPIs y categorías tienen una vista dedicada.</p>
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => router.push("/reports")}>
              Ir a Reportes
            </button>
          </div>
        </div>
      ) : null}

      {/* ───────── INTELIGENCIA ARTIFICIAL ───────── */}
      {tab === "ia" ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Inteligencia Artificial</h3>
            <span className="meta">proveedor cloud · categorización</span>
          </div>
          <ComingSoonPanel
            title="Integración IA en construcción"
            description="La configuración del proveedor cloud para categorización y revisión de cartolas aún no está disponible en esta versión."
          />
        </div>
      ) : null}

      {/* ───────── ADMINISTRACIÓN ───────── */}
      {tab === "admin" ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Administración</h3>
            <span className="meta">usuarios · salud del sistema</span>
          </div>
          <ComingSoonPanel
            title="Administración en construcción"
            description="La gestión de usuarios y la salud del sistema aún no están disponibles en esta versión."
          />
        </div>
      ) : null}
    </div>
  );
}
