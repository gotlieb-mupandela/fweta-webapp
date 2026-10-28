import "./env";

import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, describe, test } from "node:test";

import { NextRequest } from "next/server";

import { adminAssignRole, adminSetUserSuspended, getPlatformStats } from "../../app/actions/settings";
import { getAuthSecretKey } from "../../lib/auth/secret";
import {
  dashboardRoleDenied,
  readSessionClaims,
  resolveSessionAccess,
  SESSION_COOKIE_NAME,
  sessionFromProfile,
  signSessionToken,
  withSessionCookie,
  type SessionUser,
} from "../../lib/auth/live-session";
import { readStore, updateStore } from "../../lib/db/store";
import type { Profile } from "../../lib/db/types";
import { proxy } from "../../proxy";
import type { UserRole } from "../../types/enums";
import { authDataDir, restoreAuthEnv } from "./env";

const adminId = "11111111-1111-4111-8111-111111111111";
const clipperId = "22222222-2222-4222-8222-222222222222";

function profile(partial: Partial<Profile> & Pick<Profile, "id" | "email" | "roles" | "primaryRole">): Profile {
  return {
    passwordHash: "hash",
    displayName: partial.displayName ?? "User",
    bio: "",
    avatarUrl: null,
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspended: false,
    credentialVersion: 0,
    onboardingCompletedAt: "seeded",
    ...partial,
  };
}

async function inAction<T>(token: string | undefined, run: () => Promise<T>): Promise<T> {
  const mod = (await import("next/dist/server/app-render/work-async-storage.external.js")) as {
    workAsyncStorage: {
      run<TResult>(
        store: { incrementalCache: object; cacheLifeProfiles?: Record<string, unknown> },
        callback: () => TResult,
      ): TResult;
    };
  };
  return mod.workAsyncStorage.run({ incrementalCache: {}, cacheLifeProfiles: {} }, () =>
    withSessionCookie(token, run),
  );
}

async function tokenFor(user: SessionUser, roles: UserRole[] = user.roles): Promise<string> {
  return signSessionToken({ ...user, roles }, getAuthSecretKey());
}

async function reset(profiles: Profile[]) {
  globalThis.__fwetaStore = undefined;
  await updateStore((store) => {
    store.profiles = profiles;
  });
}

function requestFor(pathname: string, token: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe("stored role sessions", { concurrency: false }, () => {
  after(async () => {
    globalThis.__fwetaStore = undefined;
    restoreAuthEnv();
    await rm(authDataDir, { recursive: true, force: true });
  });

  test("cookie role claims are ignored when the stored profile differs", async () => {
    const stored = profile({
      id: adminId,
      email: "admin@example.com",
      roles: ["clipper"],
      primaryRole: "clipper",
      credentialVersion: 0,
    });
    const token = await tokenFor(
      {
        id: stored.id,
        email: stored.email,
        displayName: stored.displayName,
        roles: ["admin"],
        primaryRole: "admin",
        credentialVersion: 0,
      },
      ["admin"],
    );
    const claims = await readSessionClaims(token, getAuthSecretKey());
    assert.ok(claims);
    const access = resolveSessionAccess(claims, stored);
    assert.equal(access.status, "ok");
    if (access.status !== "ok") return;
    assert.deepEqual(access.session.roles, ["clipper"]);
    assert.equal(access.session.roles.includes("admin"), false);
  });

  test("dashboard paths follow stored roles", () => {
    assert.equal(dashboardRoleDenied("/dashboard/admin/users", ["clipper"]), true);
    assert.equal(dashboardRoleDenied("/dashboard/admin/users", ["admin"]), false);
    assert.equal(dashboardRoleDenied("/dashboard/brand", ["clipper"]), true);
    assert.equal(dashboardRoleDenied("/dashboard/brand", ["brand"]), false);
    assert.equal(dashboardRoleDenied("/dashboard/clipper", ["influencer"]), false);
    assert.equal(dashboardRoleDenied("/dashboard/influencer", ["clipper"]), true);
    assert.equal(dashboardRoleDenied("/dashboard/settings", ["clipper"]), false);
  });

  test("demote an admin then reject an admin action that still presents the old cookie", async () => {
    const admin = profile({
      id: adminId,
      email: "admin@example.com",
      displayName: "Admin",
      roles: ["admin"],
      primaryRole: "admin",
    });
    await reset([admin]);
    const oldCookie = await tokenFor(sessionFromProfile(admin));

    const demoted = await inAction(oldCookie, () => adminAssignRole(adminId, "admin", false));
    assert.equal(demoted.ok, true);

    const stored = (await readStore()).profiles.find((item) => item.id === adminId);
    assert.ok(stored);
    assert.equal(stored.roles.includes("admin"), false);
    assert.equal(stored.credentialVersion, 1);

    await assert.rejects(
      () => inAction(oldCookie, () => getPlatformStats()),
      { message: "Unauthorized" },
    );

    const response = await proxy(requestFor("/dashboard/admin/users", oldCookie));
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", /\/api\/auth\/end-session\?reason=expired/);
  });

  test("suspend a user and reject the old session", async () => {
    const admin = profile({
      id: adminId,
      email: "admin@example.com",
      displayName: "Admin",
      roles: ["admin"],
      primaryRole: "admin",
    });
    const clipper = profile({
      id: clipperId,
      email: "clipper@example.com",
      displayName: "Clipper",
      roles: ["clipper"],
      primaryRole: "clipper",
    });
    await reset([admin, clipper]);
    const adminCookie = await tokenFor(sessionFromProfile(admin));
    const oldCookie = await tokenFor(sessionFromProfile(clipper));

    const suspended = await inAction(adminCookie, () => adminSetUserSuspended(clipperId, true));
    assert.equal(suspended.ok, true);

    const stored = (await readStore()).profiles.find((item) => item.id === clipperId);
    assert.ok(stored);
    assert.equal(stored.suspended, true);
    assert.equal(stored.credentialVersion, 1);

    await assert.rejects(
      () => inAction(oldCookie, () => getPlatformStats()),
      { message: "Unauthorized" },
    );

    const rotated = await tokenFor({
      ...sessionFromProfile(stored),
      credentialVersion: stored.credentialVersion ?? 0,
    });
    await assert.rejects(
      () => inAction(rotated, () => getPlatformStats()),
      { message: "Unauthorized" },
    );

    const response = await proxy(requestFor("/dashboard/clipper", oldCookie));
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", /reason=suspended|reason=expired/);
  });

  test("promote path still works for a session that matches the stored credential version", async () => {
    const admin = profile({
      id: adminId,
      email: "admin@example.com",
      displayName: "Admin",
      roles: ["admin"],
      primaryRole: "admin",
    });
    const clipper = profile({
      id: clipperId,
      email: "clipper@example.com",
      displayName: "Clipper",
      roles: ["clipper"],
      primaryRole: "clipper",
    });
    await reset([admin, clipper]);
    const adminCookie = await tokenFor(sessionFromProfile(admin));
    const oldCookie = await tokenFor(sessionFromProfile(clipper));

    const promoted = await inAction(adminCookie, () => adminAssignRole(clipperId, "admin", true));
    assert.equal(promoted.ok, true);

    const stored = (await readStore()).profiles.find((item) => item.id === clipperId);
    assert.ok(stored);
    assert.equal(stored.roles.includes("admin"), true);
    assert.equal(stored.credentialVersion, 1);

    await assert.rejects(
      () => inAction(oldCookie, () => getPlatformStats()),
      { message: "Unauthorized" },
    );

    const fresh = await tokenFor(
      {
        id: stored.id,
        email: stored.email,
        displayName: stored.displayName,
        roles: ["clipper"],
        primaryRole: "clipper",
        credentialVersion: stored.credentialVersion ?? 0,
      },
      ["clipper"],
    );
    const stats = await inAction(fresh, () => getPlatformStats());
    assert.ok(stats);
    assert.equal(stats.users, 2);

    const stillAdmin = await inAction(adminCookie, () => getPlatformStats());
    assert.ok(stillAdmin);

    const response = await proxy(requestFor("/dashboard/admin", fresh));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });
});
