import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type {
  Account,
  AccountPayload,
  Category,
  CategoryPayload,
  CategoryRule,
  CategoryRulePayload,
  Budget,
  BudgetPayload,
  CategoryAggregate,
  Goal,
  GoalPayload,
  MonthAggregate,
  RangeFilters,
  Institution,
  LoginResponse,
  MonthlyDashboard,
  NetWorth,
  PreviewRow,
  Recurring,
  RecurringPayload,
  Settings,
  SettingsPayload,
  SplitPayload,
  StatementUpload,
  StatementDetail,
  StatementPreview,
  StatementUploadResponse,
  Tag,
  TagPayload,
  Transaction,
  TransactionFilters,
  TransactionPayload,
  TransactionSummary,
  User,
} from "@/lib/api-types";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? "";

    if (
      status !== 401 ||
      !original ||
      original._retried ||
      url.includes("/v1/auth/login") ||
      url.includes("/v1/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    original._retried = true;
    try {
      await api.post("/v1/auth/refresh");
      return api(original);
    } catch (refreshError) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    }
  },
);

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>("/v1/auth/login", { username, password }),
  logout: () => api.post<{ message: string }>("/v1/auth/logout"),
  refresh: () => api.post<{ ok: boolean }>("/v1/auth/refresh"),
  me: () => api.get<User>("/v1/auth/me"),
};

export const accountsApi = {
  list: () => api.get<Account[]>("/v1/accounts"),
  create: (payload: AccountPayload) => api.post<Account>("/v1/accounts", payload),
  update: (id: string, payload: Partial<AccountPayload>) => api.patch<Account>(`/v1/accounts/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/accounts/${id}`),
  institutions: () => api.get<Institution[]>("/v1/institutions"),
};

export const categoriesApi = {
  list: () => api.get<Category[]>("/v1/categories"),
  create: (payload: CategoryPayload) => api.post<Category>("/v1/categories", payload),
  update: (id: string, payload: Partial<CategoryPayload>) => api.patch<Category>(`/v1/categories/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/categories/${id}`),
};

export const tagsApi = {
  list: () => api.get<Tag[]>("/v1/tags"),
  create: (payload: TagPayload) => api.post<Tag>("/v1/tags", payload),
  update: (id: string, payload: Partial<TagPayload>) => api.patch<Tag>(`/v1/tags/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/tags/${id}`),
};

export const rulesApi = {
  list: () => api.get<CategoryRule[]>("/v1/category-rules"),
  create: (payload: CategoryRulePayload) => api.post<CategoryRule>("/v1/category-rules", payload),
  update: (id: string, payload: Partial<CategoryRulePayload>) => api.patch<CategoryRule>(`/v1/category-rules/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/category-rules/${id}`),
};

export const transactionsApi = {
  list: (filters?: TransactionFilters) =>
    api.get<Transaction[]>("/v1/transactions", { params: filters }),
  summary: (filters?: TransactionFilters) =>
    api.get<TransactionSummary>("/v1/transactions/summary", { params: filters }),
  create: (payload: TransactionPayload) => api.post<Transaction>("/v1/transactions", payload),
  update: (id: string, payload: Partial<TransactionPayload> & { is_internal_transfer?: boolean; is_duplicate?: boolean }) =>
    api.patch<Transaction>(`/v1/transactions/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/transactions/${id}`),
  autoCategorize: () => api.post<{ updated: number }>("/v1/transactions/auto-categorize"),
  setNotes: (id: string, notes: string | null) => api.patch<Transaction>(`/v1/transactions/${id}/notes`, { notes }),
  setFlag: (id: string, is_flagged: boolean, reason?: string | null) =>
    api.patch<Transaction>(`/v1/transactions/${id}/flag`, { is_flagged, reason }),
  setTags: (id: string, tag_ids: string[]) => api.patch<Transaction>(`/v1/transactions/${id}/tags`, { tag_ids }),
  setSplits: (id: string, splits: SplitPayload[]) => api.post<Transaction>(`/v1/transactions/${id}/split`, splits),
  clearSplits: (id: string) => api.delete<Transaction>(`/v1/transactions/${id}/splits`),
  bulkCategory: (transaction_ids: string[], category_id: string | null) =>
    api.patch<{ updated: number }>("/v1/transactions/bulk/category", { transaction_ids, category_id }),
  bulkTags: (transaction_ids: string[], tag_ids: string[]) =>
    api.patch<{ updated: number }>("/v1/transactions/bulk/tags", { transaction_ids, tag_ids }),
  bulkDelete: (transaction_ids: string[]) =>
    api.delete<{ deleted: number }>("/v1/transactions/bulk", { data: { transaction_ids } }),
  byCategory: (filters?: RangeFilters) =>
    api.get<CategoryAggregate[]>("/v1/transactions/by-category", { params: filters }),
  byMonth: (params?: { months?: number; account_id?: string; currency?: string }) =>
    api.get<MonthAggregate[]>("/v1/transactions/by-month", { params }),
  exportExcelUrl: () => "/api/v1/transactions/export/excel",
  exportCsvUrl: () => "/api/v1/transactions/export/csv",
};

export const budgetsApi = {
  list: (month?: string) => api.get<Budget[]>("/v1/budgets", { params: month ? { month } : undefined }),
  create: (payload: BudgetPayload) => api.post<Budget>("/v1/budgets", payload),
  update: (id: string, payload: Partial<Pick<BudgetPayload, "amount" | "alert_at_percent">>) =>
    api.patch<Budget>(`/v1/budgets/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/budgets/${id}`),
};

export const dashboardApi = {
  monthly: (month: string) => api.get<MonthlyDashboard>("/v1/dashboard/monthly", { params: { month } }),
};

export const goalsApi = {
  list: () => api.get<Goal[]>("/v1/goals"),
  create: (payload: GoalPayload) => api.post<Goal>("/v1/goals", payload),
  update: (id: string, payload: Partial<GoalPayload>) => api.patch<Goal>(`/v1/goals/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/goals/${id}`),
};

export const recurringApi = {
  list: () => api.get<Recurring[]>("/v1/recurring"),
  create: (payload: RecurringPayload) => api.post<Recurring>("/v1/recurring", payload),
  update: (id: string, payload: Partial<RecurringPayload>) => api.patch<Recurring>(`/v1/recurring/${id}`, payload),
  remove: (id: string) => api.delete(`/v1/recurring/${id}`),
};

export const patrimonioApi = {
  get: () => api.get<NetWorth>("/v1/patrimonio"),
};

export const settingsApi = {
  get: () => api.get<Settings>("/v1/settings"),
  update: (payload: SettingsPayload) => api.patch<Settings>("/v1/settings", payload),
};

export const statementsApi = {
  list: () => api.get<StatementUpload[]>("/v1/statements"),
  previews: () => api.get<StatementPreview[]>("/v1/statements/previews"),
  preview: (accountId: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return api.post<StatementPreview>("/v1/statements/preview", data, {
      params: { account_id: accountId },
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getPreview: (previewId: string) => api.get<StatementPreview>(`/v1/statements/previews/${previewId}`),
  updateRows: (previewId: string, rows: PreviewRow[]) =>
    api.patch<StatementPreview>(`/v1/statements/previews/${previewId}/rows`, { rows }),
  deleteRow: (previewId: string, idx: number) =>
    api.delete<StatementPreview>(`/v1/statements/previews/${previewId}/rows/${idx}`),
  checkDuplicates: (previewId: string) =>
    api.get<{ duplicates: string[] }>(`/v1/statements/previews/${previewId}/duplicates`),
  confirm: (previewId: string) => api.post<StatementUploadResponse>(`/v1/statements/previews/${previewId}/confirm`),
  cancel: (previewId: string) => api.post<{ ok: boolean }>(`/v1/statements/previews/${previewId}/cancel`),
  detail: (uploadedFileId: string) => api.get<StatementDetail>(`/v1/statements/history/${uploadedFileId}`),
  reprocess: (uploadedFileId: string) => api.post<StatementUploadResponse>(`/v1/statements/history/${uploadedFileId}/reprocess`),
  upload: (accountId: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return api.post<StatementUploadResponse>("/v1/statements/upload", data, {
      params: { account_id: accountId },
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export default api;
