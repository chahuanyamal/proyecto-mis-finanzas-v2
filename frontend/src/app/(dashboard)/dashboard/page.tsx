"use client";

import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const router = useRouter();
  const { user, hasVerified, fetchMe, logout } = useAuthStore();

  useEffect(() => {
    if (!hasVerified) {
      void fetchMe();
    }
  }, [fetchMe, hasVerified]);

  useEffect(() => {
    if (hasVerified && !user) {
      router.replace("/login");
    }
  }, [hasVerified, router, user]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-surface-950 p-8 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-lg border border-slate-800 bg-surface-900 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Dashboard</p>
        <h1 className="mt-3 text-3xl font-bold">Autenticación activa</h1>
        {user ? (
          <div className="mt-6 space-y-2 text-slate-300">
            <p>Email: {user.email}</p>
            <p>Nombre: {user.full_name}</p>
            <p>Admin: {user.is_admin ? "sí" : "no"}</p>
          </div>
        ) : (
          <p className="mt-6 text-slate-400">Validando sesión...</p>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-8 rounded border border-slate-700 px-4 py-2 text-sm font-semibold hover:border-brand-400 hover:text-brand-300"
        >
          Cerrar sesión
        </button>
        <button
          type="button"
          onClick={() => router.push("/accounts")}
          className="ml-3 mt-8 rounded bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400"
        >
          Ir a cuentas
        </button>
      </div>
    </main>
  );
}
