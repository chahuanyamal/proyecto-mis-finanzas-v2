import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";

vi.mock("@/lib/api", () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    refresh: vi.fn(),
  },
}));

import { authApi } from "@/lib/api";

const mockLogin = vi.mocked(authApi.login);
const mockLogout = vi.mocked(authApi.logout);
const mockMe = vi.mocked(authApi.me);

const fakeUser = {
  id: "u1",
  email: "test@test.com",
  full_name: "Test",
  is_active: true,
  is_admin: false,
  preferences: null,
};

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: false, hasVerified: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets user on successful login", async () => {
    mockLogin.mockResolvedValueOnce({ data: { user: fakeUser } } as never);
    await useAuthStore.getState().login("test@test.com", "pass");
    expect(useAuthStore.getState().user).toEqual(fakeUser);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().hasVerified).toBe(true);
  });

  it("clears loading on failed login and throws", async () => {
    mockLogin.mockRejectedValueOnce(new Error("bad creds"));
    await expect(useAuthStore.getState().login("x", "y")).rejects.toThrow("bad creds");
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("clears user on logout", async () => {
    useAuthStore.setState({ user: fakeUser, hasVerified: true });
    mockLogout.mockResolvedValueOnce({ data: { message: "ok" } } as never);
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("fetches user profile with fetchMe", async () => {
    mockMe.mockResolvedValueOnce({ data: fakeUser } as never);
    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user).toEqual(fakeUser);
    expect(useAuthStore.getState().hasVerified).toBe(true);
  });

  it("sets user to null when fetchMe fails", async () => {
    mockMe.mockRejectedValueOnce(new Error("unauthorized"));
    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().hasVerified).toBe(true);
  });
});
