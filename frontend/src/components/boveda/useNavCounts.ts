"use client";

import {
  accountsApi,
  categoriesApi,
  notificationsApi,
  recurringApi,
  rulesApi,
  statementsApi,
  tagsApi,
  transactionsApi,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

/**
 * Contadores reales para los `nav-item` del sidebar Bóveda.
 * El diseño muestra contadores en Movimientos, Cartolas, Por revisar, Cuentas,
 * Categorías, Etiquetas, Reglas y Suscripciones. Se obtienen con React Query
 * (cacheado) y se mapean por `href`.
 */
export type NavCounts = Record<string, number | undefined>;

const STALE = 60_000;

export function useNavCounts(enabled: boolean): NavCounts {
  const summary = useQuery({
    queryKey: ["nav-count", "tx-summary"],
    queryFn: async () => (await transactionsApi.summary()).data,
    staleTime: STALE,
    enabled,
  });
  const statements = useQuery({
    queryKey: ["nav-count", "statements"],
    queryFn: async () => (await statementsApi.list()).data.length,
    staleTime: STALE,
    enabled,
  });
  const accounts = useQuery({
    queryKey: ["nav-count", "accounts"],
    queryFn: async () => (await accountsApi.list()).data.length,
    staleTime: STALE,
    enabled,
  });
  const categories = useQuery({
    queryKey: ["nav-count", "categories"],
    queryFn: async () => (await categoriesApi.list()).data.length,
    staleTime: STALE,
    enabled,
  });
  const tags = useQuery({
    queryKey: ["nav-count", "tags"],
    queryFn: async () => (await tagsApi.list()).data.length,
    staleTime: STALE,
    enabled,
  });
  const rules = useQuery({
    queryKey: ["nav-count", "rules"],
    queryFn: async () => (await rulesApi.list()).data.length,
    staleTime: STALE,
    enabled,
  });
  const notifs = useQuery({
    queryKey: ["nav-count", "notifications"],
    queryFn: async () => (await notificationsApi.count()).data,
    staleTime: STALE,
    enabled,
  });

  const recurring = useQuery({
    queryKey: ["nav-count", "recurring"],
    queryFn: async () => (await recurringApi.list()).data.length,
    staleTime: STALE,
    enabled,
  });

  return {
    "/transactions": summary.data?.total_count,
    "/statements": statements.data,
    "/review": summary.data?.uncategorized_count,
    "/accounts": accounts.data,
    "/categories": categories.data,
    "/tags": tags.data,
    "/rules": rules.data,
    "/recurring": recurring.data,
    "/notifications": notifs.data?.unread,
  };
}
