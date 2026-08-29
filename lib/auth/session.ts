"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/db/types";
import { mapProfile, type ProfileRow } from "@/lib/db/mappers";
import type { UserRole } from "@/types/enums";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  primaryRole: UserRole;
};

async function profileToSession(profile: Profile): Promise<SessionUser> {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    roles: profile.roles,
    primaryRole: profile.primaryRole,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;

  const profile = await getProfileById(sub);
  if (!profile || profile.suspended) return null;
  return profileToSession(profile);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfile(data as ProfileRow);
}

export async function signup(input: {
  email: string;
  password: string;
  displayName: string;
  roles: UserRole[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || input.password.length < 8) {
    return { ok: false, error: "Valid email and password (8+ chars) required." };
  }
  if (!input.roles.length) {
    return { ok: false, error: "Select at least one role." };
  }
  if (input.roles.includes("admin")) {
    return { ok: false, error: "Admin role cannot be self-assigned." };
  }

  const supabase = await createClient();
  const displayName = input.displayName.trim() || email.split("@")[0];
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: { display_name: displayName } },
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  const userId = data.user?.id;
  if (!userId || !data.session) {
    return { ok: false, error: "Check your email to confirm the account." };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: row } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (row) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      roles: input.roles,
      primary_role: input.roles[0],
    })
    .eq("id", userId);
  if (profileError) {
    return { ok: false, error: profileError.message };
  }
  return { ok: true };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (error || !data.user) {
    return { ok: false, error: "Invalid email or password." };
  }

  const profile = await getProfileById(data.user.id);
  if (profile?.suspended) {
    await supabase.auth.signOut();
    return { ok: false, error: "Account suspended." };
  }
  return { ok: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function refreshSessionFromProfile(_profile: Profile) {
  // Session is derived from the profiles row on each request.
}

const DEMO_PASSWORD = "password123";

const DEMO_ACCOUNTS: Array<{
  email: string;
  displayName: string;
  bio: string;
  roles: UserRole[];
  primaryRole: UserRole;
}> = [
  {
    email: "brand@fweta.test",
    displayName: "Desert Brands",
    bio: "Namibian DTC brand running creator campaigns.",
    roles: ["brand"],
    primaryRole: "brand",
  },
  {
    email: "creator@fweta.test",
    displayName: "Amara Nangolo",
    bio: "Windhoek creator · lifestyle & short-form.",
    roles: ["clipper", "influencer"],
    primaryRole: "influencer",
  },
  {
    email: "clipper@fweta.test",
    displayName: "Kai Clips",
    bio: "Clipping specialist across TikTok & Reels.",
    roles: ["clipper"],
    primaryRole: "clipper",
  },
  {
    email: "admin@fweta.test",
    displayName: "Fweta Admin",
    bio: "Platform operations",
    roles: ["admin"],
    primaryRole: "admin",
  },
];

/** Idempotent. Safe to call from login; do not call during `next build`. */
export async function seedDemoAccounts() {
  try {
    const admin = createAdminClient();
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
    const byEmail = new Map(
      (listed?.users ?? []).map((u) => [u.email?.toLowerCase() ?? "", u]),
    );

    for (const account of DEMO_ACCOUNTS) {
      let user = byEmail.get(account.email.toLowerCase());
      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({
          email: account.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { display_name: account.displayName },
        });
        if (error && !/already|registered/i.test(error.message)) {
          console.warn("[fweta] seed user failed:", account.email, error.message);
        }
        user = data?.user;
        if (!user) {
          const { data: retry } = await admin.auth.admin.listUsers({ perPage: 200 });
          user = retry?.users.find(
            (u) => u.email?.toLowerCase() === account.email.toLowerCase(),
          );
        }
      }
      if (!user) continue;

      await admin.from("profiles").upsert({
        id: user.id,
        email: account.email,
        display_name: account.displayName,
        bio: account.bio,
        roles: account.roles,
        primary_role: account.primaryRole,
      });
    }
    return { seeded: true };
  } catch {
    return { seeded: false };
  }
}
