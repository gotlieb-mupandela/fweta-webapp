import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseConfig } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";

const COOKIE_NAME = "fweta_session";
const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "fweta-local-dev-secret-change-me",
);

const protectedPrefixes = ["/dashboard"];

function applySupabaseCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

export async function middleware(request: NextRequest) {
  const supabaseResponse = hasSupabaseConfig()
    ? await updateSession(request)
    : NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // Product app entry — no marketing landing here (lives on fweta.com)
  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const url = request.nextUrl.clone();
    if (token) {
      try {
        await jwtVerify(token, AUTH_SECRET);
        url.pathname = "/dashboard";
        return applySupabaseCookies(NextResponse.redirect(url), supabaseResponse);
      } catch {
        // fall through to login
      }
    }
    url.pathname = "/login";
    return applySupabaseCookies(NextResponse.redirect(url), supabaseResponse);
  }

  const needsAuth = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!needsAuth) {
    return supabaseResponse;
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return applySupabaseCookies(NextResponse.redirect(url), supabaseResponse);
  }

  try {
    await jwtVerify(token, AUTH_SECRET);
    return supabaseResponse;
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    res.cookies.delete(COOKIE_NAME);
    return applySupabaseCookies(res, supabaseResponse);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
