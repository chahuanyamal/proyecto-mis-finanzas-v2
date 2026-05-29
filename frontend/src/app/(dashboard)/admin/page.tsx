"use client";

import { adminApi } from "@/lib/api";
import type { AdminUser, AdminUserCreatePayload } from "@/lib/api-types";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

const emptyForm: AdminUserCreatePayload = { email: "", password: "", full_name: "", is_active: true, is_admin: false };

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user && !user.is_admin) router.replace("/dashboard");
  }, [user, router]);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const res = await adminApi.listUsers();
      setUsers(res.data);
    } catch {
      setError("No se pudieron cargar usuarios.");
    }
  }

  useEffect(() => { void load(); }, []);

  function reset() { setForm(emptyForm); setShowForm(false); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await adminApi.createUser(form);
      reset();
      await load();
    } catch {
      setError("No se pudo crear el usuario.");
    }
  }

  async function toggleField(id: string, field: "is_active" | "is_admin") {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    try {
      await adminApi.updateUser(id, { [field]: !target[field] });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: !u[field] } : u)));
    } catch {
      setError("No se pudo actualizar el usuario.");
    }
  }

  const activeCount = useMemo(() => users.filter((u) => u.is_active).length, [users]);
  const adminCount = useMemo(() => users.filter((u) => u.is_admin).length, [users]);

  const GRID = {
    display: "grid",
    gridTemplateColumns: "1fr 180px 80px 80px 140px",
    gap: 14,
    alignItems: "center",
  } as const;

  if (!user || !user.is_admin) return null;

  return (
    <div className="content">
      <div className="title-row">
        <div>
          <h1>
            Administración <span className="serif">usuarios</span>
          </h1>
          <div className="sub">
            {users.length} usuarios registrados
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setShowForm(true)}>
            + Nuevo usuario
          </button>
        </div>
      </div>

      {error ? (
        <div className="insight err" style={{ marginBottom: 20 }}>
          <div className="insight-mark">!</div>
          <div className="insight-body">
            <div className="txt">{error}</div>
          </div>
          <span />
        </div>
      ) : null}

      <section className="strip">
        <div className="kpi on">
          <div className="lbl">
            <span className="sw" />
            Total
          </div>
          <div className="val num">{users.length}</div>
          <div className="sub">usuarios registrados</div>
        </div>
        <div className="kpi v">
          <div className="lbl">
            <span className="sw" />
            Activos
          </div>
          <div className="val num">{activeCount}</div>
          <div className="sub">de {users.length} totales</div>
        </div>
        <div className="kpi g">
          <div className="lbl">
            <span className="sw" />
            Admins
          </div>
          <div className="val num">{adminCount}</div>
          <div className="sub">con privilegios</div>
        </div>
        <div className="kpi r">
          <div className="lbl">
            <span className="sw" />
            Inactivos
          </div>
          <div className="val num">{users.length - activeCount}</div>
          <div className="sub">sin acceso</div>
        </div>
      </section>

      {showForm ? (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <h3>Nuevo usuario</h3>
            <button className="meta" style={{ cursor: "pointer" }} onClick={reset}>
              cerrar ✕
            </button>
          </div>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input
                className="input"
                placeholder="Nombre completo"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input
                type="email"
                className="input"
                placeholder="correo@ejemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="Mínimo 8 caracteres"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Permisos</label>
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={`toggle${form.is_admin ? " on" : ""}`}
                    onClick={() => setForm({ ...form, is_admin: !form.is_admin })}
                  />
                  <span className="font-mono text-[11px] text-[color:var(--text-3)] uppercase tracking-[0.1em]">Admin</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={`toggle${form.is_active ? " on" : ""}`}
                    onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  />
                  <span className="font-mono text-[11px] text-[color:var(--text-3)] uppercase tracking-[0.1em]">Activo</span>
                </div>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn primary">Crear</button>
              <button type="button" className="btn ghost" onClick={reset}>Cancelar</button>
            </div>
          </form>
        </div>
      ) : null}

      {users.length === 0 ? (
        <div className="tbl">
          <div className="empty">
            <div className="empty-mark">∅</div>
            <h4>No hay usuarios</h4>
            <p>Crea el primer usuario para comenzar.</p>
          </div>
        </div>
      ) : (
        <div className="tbl">
          <div className="tbl-head font-mono" style={{ ...GRID, padding: "11px 16px" }}>
            <div>Usuario</div>
            <div>Email</div>
            <div className="r">Estado</div>
            <div className="r">Rol</div>
            <div className="r">Acciones</div>
          </div>
          {users.map((u) => (
            <div key={u.id} className="tbl-row font-mono" style={{ ...GRID, padding: "12px 16px" }}>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[color:var(--text)]" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>{u.full_name}</div>
              </div>
              <div className="truncate text-[12px] text-[color:var(--text-3)]">{u.email}</div>
              <div className="r">
                <span className={`chip ${u.is_active ? "ok" : "err"}`}>
                  <span className="sw" />
                  {u.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="r">
                <span className={`chip ${u.is_admin ? "ok" : "k"}`}>
                  <span className="sw" />
                  {u.is_admin ? "Admin" : "User"}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className={`toggle${u.is_admin ? " on" : ""}`}
                  title={u.is_admin ? "Quitar admin" : "Hacer admin"}
                  onClick={() => toggleField(u.id, "is_admin")}
                />
                <button
                  type="button"
                  className={`toggle${u.is_active ? " on" : ""}`}
                  title={u.is_active ? "Desactivar" : "Activar"}
                  onClick={() => toggleField(u.id, "is_active")}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}