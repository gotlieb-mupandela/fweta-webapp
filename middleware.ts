import { type NextRequest } from "next/server";

import { createMiddlewareClient } from "@/lib/supabase/middleware";

/**
 * Refreshes Supabase auth session cookies.
 * Add route protection matchers when auth is implemented.
 */
export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
