import { authApi } from "@/lib/api";
import type { User } from "@/lib/api-types";
import { create } from "zustand";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  hasVerified: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isLoading: false,
  hasVerified: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(username, password);
      set({ user: response.data.user, isLoading: false, hasVerified: true });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null, isLoading: false, hasVerified: true });
    }
  },

  fetchMe: async () => {
    try {
      const response = await authApi.me();
      set({ user: response.data, hasVerified: true });
    } catch {
      set({ user: null, hasVerified: true });
    }
  },
}));
