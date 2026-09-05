import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { readStore, updateStore, newId, nowIso } from "@/lib/db/store";
import type { Profile, Wallet } from "@/lib/db/types";
import { refreshSessionFromProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

function loginRedirect(request: Request, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, request.url));
}

/**
 * Supabase Auth callback. Exchanges the OAuth code for a Supabase session,
 * then bridges to the local fweta session by finding or creating a profile
 * for the Google email — dashboards keep working unchanged.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  if (params.get("error") === "access_denied") {
    return loginRedirect(request, "google-cancelled");
  }
  if (params.get("error")) {
    return loginRedirect(request, "google-failed");
  }

  const code = params.get("code");
  if (!code) return loginRedirect(request, "google-failed");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return loginRedirect(request, "google-not-configured");
  }

  try {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.warn("[fweta] Supabase code exchange failed:", exchangeError.message);
      return loginRedirect(request, "google-failed");
    }

    const { data, error: userError } = await supabase.auth.getUser();
    const email = data.user?.email?.trim().toLowerCase();
    if (userError || !email) {
      console.warn("[fweta] Supabase getUser failed:", userError?.message);
      return loginRedirect(request, "google-failed");
    }

    const existing = (await readStore()).profiles.find((p) => p.email === email) ?? null;
    if (existing?.suspended) {
      return loginRedirect(request, "google-suspended");
    }

    let profile = existing;
    if (!profile) {
      // First Google sign-in: create a clipper account. Extra roles
      // (brand/influencer) are self-service under Settings → Roles.
      const now = nowIso();
      const meta = data.user?.user_metadata ?? {};
      const created: Profile = {
        id: newId(),
        email,
        // Random unusable password — this account signs in via Google.
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
        displayName:
          String(meta.full_name || meta.name || "").trim().slice(0, 80) || email.split("@")[0],
        bio: "",
        avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
        roles: ["clipper"],
        primaryRole: "clipper",
        notifyEmail: true,
        notifyWithdrawals: true,
        notifyBookings: true,
        createdAt: now,
        updatedAt: now,
        suspended: false,
      };
      // Atomic duplicate check + insert, mirroring email signup.
      await updateStore((s) => {
        if (s.profiles.some((p) => p.email === email)) {
          throw new Error("An account with this email already exists.");
        }
        s.profiles.push(created);
        let wallet = s.wallets.find((w: Wallet) => w.userId === created.id);
        if (!wallet) {
          wallet = { userId: created.id, availableCents: 0, pendingCents: 0, updatedAt: now };
          s.wallets.push(wallet);
        }
      });
      profile = (await readStore()).profiles.find((p) => p.email === email) ?? created;
    }

    await refreshSessionFromProfile(profile);
    return NextResponse.redirect(new URL(safeNext(params.get("next")), request.url));
  } catch (err) {
    console.warn("[fweta] Supabase auth callback failed:", err);
    return loginRedirect(request, "google-failed");
  }
}
