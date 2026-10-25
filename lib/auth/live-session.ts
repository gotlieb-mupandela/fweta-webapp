import { AsyncLocalStorage } from "node:async_hooks";

import { SignJWT, jwtVerify } from "jose";

import type { Profile } from "@/lib/db/types";
import type { UserRole } from "@/types/enums";

import { sessionGate } from "./session-gate";

export const SESSION_COOKIE_NAME = "fweta_session";

const USER_ROLES: readonly UserRole[] = ["brand", "influencer", "clipper", "admin"];

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  primaryRole: UserRole;
  credentialVersion: number;
};

export type SessionClaims = {
  id: string;
  credentialVersion: number;
};

export type SessionAccess =
  | { status: "ok"; session: SessionUser }
  | { status: "anonymous" }
  | { status: "suspended" }
  | { status: "expired" }
  | { status: "unavailable" };

type CookieBox = { token: string | undefined };

const sessionCookieBox = new AsyncLocalStorage<CookieBox>();

/** Test seam. Production requests never enter this store. */
export function withSessionCookie<T>(token: string | undefined, run: () => Promise<T>): Promise<T> {
  return sessionCookieBox.run({ token }, run);
}

export function currentSessionCookie(): CookieBox | undefined {
  return sessionCookieBox.getStore();
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function normalizeRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  const roles: UserRole[] = [];
  for (const item of value) {
    if (isUserRole(item) && !roles.includes(item)) roles.push(item);
  }
  return roles;
}

export function sameRoles(left: readonly UserRole[], right: readonly UserRole[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((role, index) => role === b[index]);
}

export function bumpCredentialVersion(profile: { credentialVersion?: number }): void {
  profile.credentialVersion = (profile.credentialVersion ?? 0) + 1;
}

export function sessionFromProfile(profile: Profile): SessionUser {
  const roles = normalizeRoles(profile.roles);
  const primaryRole =
    isUserRole(profile.primaryRole) && roles.includes(profile.primaryRole)
      ? profile.primaryRole
      : roles[0] ?? "clipper";
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    roles,
    primaryRole,
    credentialVersion: profile.credentialVersion ?? 0,
  };
}

/**
 * Roles, primary role, and suspension come from the stored profile.
 * Cookie role claims are ignored. A missing profile does not grant the cookie's roles.
 */
export function resolveSessionAccess(claims: SessionClaims, profile: Profile | null): SessionAccess {
  if (!profile || profile.id !== claims.id) return { status: "unavailable" };
  const gate = sessionGate({ credentialVersion: claims.credentialVersion }, profile);
  if (gate === "suspended") return { status: "suspended" };
  if (gate === "expired") return { status: "expired" };
  if (gate !== "ok") return { status: "unavailable" };
  return { status: "ok", session: sessionFromProfile(profile) };
}

export async function signSessionToken(user: SessionUser, key: Uint8Array): Promise<string> {
  return new SignJWT({
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    primaryRole: user.primaryRole,
    cv: user.credentialVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(key);
}

export async function readSessionClaims(token: string, key: Uint8Array): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      id: payload.sub,
      credentialVersion: typeof payload.cv === "number" ? payload.cv : 0,
    };
  } catch {
    return null;
  }
}

/** True when this dashboard path requires a role the profile does not have. */
export function dashboardRoleDenied(pathname: string, roles: readonly UserRole[]): boolean {
  if (pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/")) {
    return !roles.includes("admin");
  }
  if (pathname === "/dashboard/brand" || pathname.startsWith("/dashboard/brand/")) {
    return !roles.includes("brand") && !roles.includes("admin");
  }
  if (pathname === "/dashboard/clipper" || pathname.startsWith("/dashboard/clipper/")) {
    return !roles.includes("clipper") && !roles.includes("influencer") && !roles.includes("admin");
  }
  if (pathname === "/dashboard/influencer" || pathname.startsWith("/dashboard/influencer/")) {
    return !roles.includes("influencer") && !roles.includes("admin");
  }
  if (pathname === "/dashboard/ugc" || pathname.startsWith("/dashboard/ugc/")) {
    return !roles.includes("clipper") && !roles.includes("influencer") && !roles.includes("admin");
  }
  return false;
}
