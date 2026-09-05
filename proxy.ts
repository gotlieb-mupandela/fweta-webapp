import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { getAuthSecretKey } from "@/lib/auth/secret";

const COOKIE_NAME = "fweta_session";

const protectedPrefixes = ["/dashboard"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Product app entry — no marketing landing here (lives on fweta.com)
  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const url = request.nextUrl.clone();
    if (token) {
      try {
        await jwtVerify(token, getAuthSecretKey());
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      } catch {
        // fall through to login (covers invalid token AND missing prod secret)
      }
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

  // Resolved outside try: a missing prod secret must throw loudly (500),
  // never masquerade as "not logged in" via the redirect below.
  const key = getAuthSecretKey();
  try {
    await jwtVerify(token, key);
    return NextResponse.next();
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
