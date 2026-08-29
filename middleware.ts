import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "fweta_session";
const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "fweta-local-dev-secret-change-me",
);

const protectedPrefixes = ["/dashboard"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Product app entry — no marketing landing here (lives on fweta.com)
  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const url = request.nextUrl.clone();
    if (token) {
      try {
        await jwtVerify(token, AUTH_SECRET);
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      } catch {
        // fall through to login
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

  try {
    await jwtVerify(token, AUTH_SECRET);
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
