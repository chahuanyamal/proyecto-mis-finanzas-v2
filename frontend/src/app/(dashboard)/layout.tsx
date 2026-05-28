"use client";

import { BovedaShell } from "@/components/boveda/BovedaShell";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, hasVerified, fetchMe } = useAuthStore();

  useEffect(() => { if (!hasVerified) void fetchMe(); }, [fetchMe, hasVerified]);
  useEffect(() => { if (hasVerified && !user) router.replace("/login"); }, [hasVerified, router, user]);

  return <BovedaShell>{children}</BovedaShell>;
}
