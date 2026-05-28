import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { LoginResponse, User } from "@/lib/api-types";

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

export default api;
