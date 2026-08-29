import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseConfig } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";

const protectedPrefixes = ["/dashboard"];

export async function middleware(request: NextRequest) {
  const { response, userId } = hasSupabaseConfig()
    ? await updateSession(request)
    : { response: NextResponse.next({ request }), userId: null as string | null };

  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = userId ? "/dashboard" : "/login";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  const needsAuth = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!needsAuth) {
    return response;
  }

  if (!userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
