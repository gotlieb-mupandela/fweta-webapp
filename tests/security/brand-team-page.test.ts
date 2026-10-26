import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { SignJWT } from "jose";

import { getAuthSecretKey } from "../../lib/auth/secret";
import { readStore } from "../../lib/db/store";
import type { DatabaseStore, Profile, Workspace } from "../../lib/db/types";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

function resetStoreCache() {
  (globalThis as { __fwetaStore?: unknown }).__fwetaStore = undefined;
}

function brandProfile(id: string): Profile {
  return {
    id,
    email: `${id}@example.com`,
    passwordHash: "hash",
    displayName: "North Brand",
    bio: "A brand account.",
    avatarUrl: null,
    roles: ["brand"],
    primaryRole: "brand",
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspended: false,
    onboardingCompletedAt: "2026-01-02T00:00:00.000Z",
  };
}

function workspace(ownerUserId: string): Workspace {
  return {
    id: "ws-existing",
    name: "Existing",
    ownerUserId,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

async function sessionToken(id: string, email: string) {
  return new SignJWT({
    email,
    displayName: "North Brand",
    roles: ["brand"],
    primaryRole: "brand",
    cv: 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getAuthSecretKey());
}

function renderTeam(dir: string, token: string, expectUnchanged: boolean) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FWETA_DATA_DIR: dir,
    NODE_ENV: "test",
    FWETA_SESSION: token,
    EXPECT_UNCHANGED: expectUnchanged ? "1" : "0",
  };
  delete env.VERCEL;
  delete env.VERCEL_ENV;
  return spawnSync(
    "npx",
    [
      "tsx",
      "--require",
      "./tests/security/stub-server-only.cjs",
      "--require",
      "./tests/security/stub-next-headers.cjs",
      "./tests/security/render-brand-team.ts",
    ],
    { cwd: root, env, encoding: "utf8" },
  );
}

test("brand team GET writes only when the brand has no workspace", async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const previous = process.env.FWETA_DATA_DIR;
  const dir = mkdtempSync(path.join(tmpdir(), "fweta-team-"));
  const file = path.join(dir, "store.json");
  const owned = brandProfile("brand-owned");
  const fresh = brandProfile("brand-new");
  const body = {
    profiles: [owned, fresh],
    workspaces: [workspace(owned.id)],
  } satisfies Partial<DatabaseStore>;
  writeFileSync(file, JSON.stringify(body, null, 2));
  process.env.FWETA_DATA_DIR = dir;
  resetStoreCache();

  try {
    const before = readFileSync(file);
    const ownedRender = renderTeam(dir, await sessionToken(owned.id, owned.email), true);
    assert.equal(ownedRender.status, 0, ownedRender.stderr || ownedRender.stdout || "owned brand render failed");
    assert.equal(readFileSync(file).equals(before), true);

    const freshRender = renderTeam(dir, await sessionToken(fresh.id, fresh.email), false);
    assert.equal(freshRender.status, 0, freshRender.stderr || freshRender.stdout || "new brand render failed");
    resetStoreCache();
    const store = await readStore();
    const ownedRows = store.workspaces.filter((item) => item.ownerUserId === owned.id);
    const freshRows = store.workspaces.filter((item) => item.ownerUserId === fresh.id);
    assert.equal(ownedRows.length, 1);
    assert.equal(freshRows.length, 1);
    assert.equal(store.workspaces.length, 2);
  } finally {
    resetStoreCache();
    if (previous === undefined) delete process.env.FWETA_DATA_DIR;
    else process.env.FWETA_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
