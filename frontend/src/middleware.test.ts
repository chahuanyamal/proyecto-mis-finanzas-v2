import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function makeRequest(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  const req = new NextRequest(url);
  for (const [key, value] of Object.entries(cookies)) {
    req.cookies.set(key, value);
  }
  return req;
}

describe("middleware", () => {
  it("lets unauthenticated users access /login", () => {
    const res = middleware(makeRequest("/login"));
    expect(res.status).toBe(200);
  });

  it("redirects unauthenticated users from /dashboard to /login", () => {
    const res = middleware(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects unauthenticated users from /settings to /login", () => {
    const res = middleware(makeRequest("/settings"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects unauthenticated users from /notifications to /login", () => {
    const res = middleware(makeRequest("/notifications"));
    expect(res.status).toBe(307);
  });

  it("redirects unauthenticated users from /admin to /login", () => {
    const res = middleware(makeRequest("/admin"));
    expect(res.status).toBe(307);
  });

  it("allows authenticated users to access /dashboard", () => {
    const res = middleware(makeRequest("/dashboard", { access_token: "tok" }));
    expect(res.status).toBe(200);
  });

  it("allows authenticated users with only refresh_token", () => {
    const res = middleware(makeRequest("/dashboard", { refresh_token: "tok" }));
    expect(res.status).toBe(200);
  });

  it("lets public pages through without auth", () => {
    const res = middleware(makeRequest("/"));
    expect(res.status).toBe(200);
  });

  it("preserves next param on redirect", () => {
    const res = middleware(makeRequest("/reports"));
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("next=%2Freports");
  });
});
