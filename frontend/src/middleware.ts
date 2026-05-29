import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/accounts", "/transactions", "/categories", "/tags", "/rules", "/presupuestos", "/statements"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API rewrite: proxy /api/* requests to backend at runtime
  if (pathname.startsWith("/api/")) {
    const backendUrl = process.env.INTERNAL_API_URL || "http://backend:8000";
    const url = new URL(pathname + request.nextUrl.search, backendUrl);
    return NextResponse.rewrite(url);
  }

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const hasAccess = request.cookies.has("access_token");
  const hasRefresh = request.cookies.has("refresh_token");
  if (hasAccess || hasRefresh) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
