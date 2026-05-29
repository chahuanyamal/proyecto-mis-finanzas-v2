"use client";

import { adminApi } from "@/lib/api";
import type { AdminUser, AdminUserCreatePayload } from "@/lib/api-types";
import { FormEvent, useEffect, useState } from "react";

const emptyForm: AdminUserCreatePayload = { email: "", password: "", full_name: "", is_active: true, is_admin: false };

export default function AdminPage() {
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
    const user = users.find((u) => u.id === id);
    if (!user) return;
    try {
      await adminApi.updateUser(id, { [field]: !user[field] });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: !u[field] } : u)));
    } catch {
      setError("No se pudo actualizar el usuario.");
    }
  }

  return (
    <div className="page page-max-lg">
      <div className="page-h">
        <div>
          <h1>Administración</h1>
          <p className="page-desc">{users.length} usuarios registrados</p>
        </div>
        <button type="button" className="btn" onClick={() => setShowForm(true)}>
          Nuevo usuario
        </button>
      </div>

      {error ? <div className="empty"><p>{error}</p></div> : null}

      {showForm ? (
        <form onSubmit={save} className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <h3>Crear usuario</h3>
          <div className="field">
            <label>Nombre</label>
            <input
              className="inp"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              className="inp"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input
              type="password"
              className="inp"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
          </div>
          <label className="flex items-center gap-2 mono text-xs" style={{ color: "var(--text-3)" }}>
            <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
            Administrador
          </label>
          <label className="flex items-center gap-2 mono text-xs" style={{ color: "var(--text-3)" }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Activo
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn primary">Crear</button>
            <button type="button" className="btn" onClick={reset}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <div className="stack">
        {users.map((u) => (
          <div key={u.id} className="card" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{u.full_name}</strong>
                <span className="mono text-xs ml-2" style={{ color: "var(--text-3)" }}>{u.email}</span>
              </div>
              <div className="flex gap-2" style={{ alignItems: "center" }}>
                <span className="badge" style={u.is_admin ? { color: "var(--acc)", borderColor: "rgba(94,233,181,0.25)", background: "rgba(94,233,181,0.08)" } : {}}>
                  {u.is_admin ? "Admin" : "User"}
                </span>
                <span className="badge" style={u.is_active ? { color: "var(--acc)", borderColor: "rgba(94,233,181,0.25)", background: "rgba(94,233,181,0.08)" } : { color: "var(--rust)", borderColor: "rgba(232,122,91,0.25)", background: "rgba(232,122,91,0.08)" }}>
                  {u.is_active ? "Activo" : "Inactivo"}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => toggleField(u.id, "is_admin")}
                >
                  {u.is_admin ? "Quitar admin" : "Hacer admin"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => toggleField(u.id, "is_active")}
                >
                  {u.is_active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
