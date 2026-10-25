import { NextResponse, type NextRequest } from "next/server";

import { accessFromToken } from "@/lib/auth/request-access";
import { dashboardRoleDenied, SESSION_COOKIE_NAME } from "@/lib/auth/live-session";

const protectedPrefixes = ["/dashboard", "/onboarding"];

function loginRedirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return url;
}

function endSession(request: NextRequest, reason: "suspended" | "expired") {
  const url = request.nextUrl.clone();
  url.pathname = "/api/auth/end-session";
  url.search = "";
  url.searchParams.set("reason", reason);
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Product app entry. Marketing lives on fweta.com.
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.search = "";
    if (!token) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    const access = await accessFromToken(token);
    if (access.status === "ok") {
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    if (access.status === "suspended" || access.status === "expired") {
      return endSession(request, access.status);
    }
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const needsAuth = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!needsAuth) return NextResponse.next();

  if (!token) {
    const res = NextResponse.redirect(loginRedirect(request, pathname));
    return res;
  }

  const access = await accessFromToken(token);
  if (access.status === "ok") {
    if (dashboardRoleDenied(pathname, access.session.roles)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  if (access.status === "suspended" || access.status === "expired") {
    return endSession(request, access.status);
  }
  // Profile could not be loaded. Keep the cookie and let the page fail closed.
  if (access.status === "unavailable") return NextResponse.next();

  const res = NextResponse.redirect(loginRedirect(request, pathname));
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/onboarding", "/onboarding/:path*"],
};
