import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { readAuthSecretKey } from "@/lib/auth/secret";

const COOKIE_NAME = "fweta_session";

const protectedPrefixes = ["/dashboard", "/onboarding"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Product app entry, no marketing landing here (lives on fweta.com)
  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const url = request.nextUrl.clone();
    if (token && (await sessionCookieValid(token))) {
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const needsAuth = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!needsAuth) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (await sessionCookieValid(token)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE_NAME);
  return res;
}

async function sessionCookieValid(token: string): Promise<boolean> {
  const key = readAuthSecretKey();
  if (!key) return false;
  try {
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/onboarding", "/onboarding/:path*"],
};
