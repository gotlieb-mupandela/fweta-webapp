import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

/**
 * Starts Supabase Google sign-in. The Google provider itself is configured
 * in the Supabase dashboard (Authentication → Providers → Google) — no
 * Google client secret is needed in this app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL("/login?error=google-not-configured", request.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${url.origin}/api/auth/callback?next=${encodeURIComponent(safeNext(url.searchParams.get("next")))}`,
    },
  });

  if (error || !data.url) {
    console.warn("[fweta] Supabase Google sign-in failed:", error?.message);
    return NextResponse.redirect(new URL("/login?error=google-failed", request.url));
  }
  return NextResponse.redirect(data.url);
}
