"use client";

import { useAuthStore } from "@/stores/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function getSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) {
    return "/dashboard";
  }
  return next;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState("admin@finanzas.local");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.replace(getSafeNext(searchParams.get("next")));
    } catch {
      setError("Credenciales incorrectas o backend no disponible.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-950 px-6 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-slate-800 bg-surface-900/80 p-8 shadow-2xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-400">Mis Finanzas V2</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-50">Ingresar</h1>
        <p className="mt-2 text-sm text-slate-400">Usa el admin inicial para validar la nueva autenticación.</p>

        <label className="mt-8 block text-sm font-medium text-slate-200">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded border border-slate-700 bg-black px-3 py-2 text-slate-50 outline-none focus:border-brand-400"
            autoComplete="email"
            required
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-200">
          Contraseña
          <span className="mt-2 flex rounded border border-slate-700 bg-black focus-within:border-brand-400">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full bg-transparent px-3 py-2 text-slate-50 outline-none"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="px-3 text-slate-400 hover:text-slate-100"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>

        {error ? <p className="mt-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        <button
          type="submit"
          disabled={isLoading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded bg-brand-500 px-4 py-2 font-semibold text-black hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : null}
          {isLoading ? "Ingresando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-surface-950 text-slate-100">Cargando...</main>}>
      <LoginForm />
    </Suspense>
  );
}
