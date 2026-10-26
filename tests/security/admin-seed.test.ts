import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import bcrypt from "bcryptjs";

import { ensureAdminAccount } from "../../lib/auth/session";
import type { DatabaseStore, Profile, Wallet } from "../../lib/db/types";
import { runHousekeepingJob } from "../../lib/jobs/housekeeping";
import type { UserRole } from "../../types/enums";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

function resetStoreCache() {
  (globalThis as { __fwetaStore?: unknown }).__fwetaStore = undefined;
}

function profile(
  partial: Partial<Profile> & { id: string; email: string; roles: UserRole[]; primaryRole: UserRole },
): Profile {
  return {
    passwordHash: "hash",
    displayName: partial.id,
    bio: "Account",
    avatarUrl: null,
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspended: false,
    onboardingCompletedAt: null,
    ...partial,
  };
}

function wallet(userId: string): Wallet {
  return {
    userId,
    availableCents: 2500,
    pendingCents: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function writeStore(dir: string, profiles: Profile[], wallets: Wallet[] = []) {
  const file = path.join(dir, "store.json");
  writeFileSync(file, JSON.stringify({ profiles, wallets } satisfies Partial<DatabaseStore>, null, 2));
  return file;
}

function childEnv(dir: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FWETA_DATA_DIR: dir,
    NODE_ENV: "test",
    ...extra,
  };
  delete env.VERCEL;
  delete env.VERCEL_ENV;
  return env;
}

function renderLogin(dir: string) {
  return spawnSync(
    "npx",
    ["tsx", "--require", "./tests/security/stub-server-only.cjs", "./tests/security/render-signed-out-login.ts"],
    { cwd: root, env: childEnv(dir), encoding: "utf8" },
  );
}

function runLogin(dir: string, email: string, password: string) {
  return spawnSync(
    "npx",
    [
      "tsx",
      "--require",
      "./tests/security/stub-server-only.cjs",
      "--require",
      "./tests/security/stub-next-headers.cjs",
      "./tests/security/login-check.ts",
    ],
    {
      cwd: root,
      env: childEnv(dir, { LOGIN_EMAIL: email, LOGIN_PASSWORD: password }),
      encoding: "utf8",
    },
  );
}

function useDataDir(dir: string) {
  const previous = process.env.FWETA_DATA_DIR;
  process.env.FWETA_DATA_DIR = dir;
  resetStoreCache();
  return () => {
    resetStoreCache();
    if (previous === undefined) delete process.env.FWETA_DATA_DIR;
    else process.env.FWETA_DATA_DIR = previous;
  };
}

function useAdminEnv(email: string, password: string) {
  const previousEmail = process.env.ADMIN_EMAIL;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_EMAIL = email;
  process.env.ADMIN_PASSWORD = password;
  return () => {
    if (previousEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  };
}

describe("ensureAdminAccount", { concurrency: false }, () => {
  test("a signed-out GET of /login leaves store.json byte for byte unchanged", () => {
    assert.notEqual(process.env.NODE_ENV, "production");
    const dir = mkdtempSync(path.join(tmpdir(), "fweta-login-"));
    const restoreAdmin = useAdminEnv("ops@fweta.com", "env-password-99");
    const file = writeStore(dir, [
      profile({
        id: "ops",
        email: "ops@fweta.com",
        passwordHash: "changed-in-app",
        roles: ["clipper"],
        primaryRole: "clipper",
      }),
      profile({
        id: "dup-a",
        email: "dup@fweta.com",
        passwordHash: "hash-a",
        roles: ["brand"],
        primaryRole: "brand",
      }),
      profile({
        id: "dup-b",
        email: "Dup@fweta.com",
        passwordHash: "hash-b",
        roles: ["brand"],
        primaryRole: "brand",
      }),
    ]);
    const before = readFileSync(file);
    try {
      const rendered = renderLogin(dir);
      assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout || "login page render failed");
      assert.equal(readFileSync(file).equals(before), true);
    } finally {
      restoreAdmin();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an existing ADMIN_EMAIL account keeps its password hash and role", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fweta-admin-keep-"));
    const appPassword = "app-password-99";
    const envPassword = "env-password-99";
    const appHash = await bcrypt.hash(appPassword, 10);
    const restoreData = useDataDir(dir);
    const restoreAdmin = useAdminEnv("ops@fweta.com", envPassword);
    const kept = profile({
      id: "ops",
      email: "ops@fweta.com",
      passwordHash: appHash,
      roles: ["clipper"],
      primaryRole: "clipper",
    });
    const legacy = profile({
      id: "legacy",
      email: "admin@fweta.test",
      passwordHash: "legacy-hash",
      roles: ["admin"],
      primaryRole: "admin",
    });
    const file = writeStore(dir, [kept, legacy], [wallet(kept.id), wallet(legacy.id)]);
    const before = readFileSync(file);
    try {
      const rendered = renderLogin(dir);
      assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout || "login page render failed");
      assert.equal(readFileSync(file).equals(before), true);

      const report = await ensureAdminAccount();
      assert.equal(report.seeded, false);
      assert.equal(readFileSync(file).equals(before), true);

      const house = await runHousekeepingJob(new Date("2026-04-01T00:00:00.000Z"));
      assert.equal(house.adminSeeded, false);
      const { readStore } = await import("../../lib/db/store");
      const store = await readStore();
      assert.equal(store.profiles.length, 2);
      const ops = store.profiles.find((item) => item.id === "ops");
      const oldAdmin = store.profiles.find((item) => item.id === "legacy");
      assert.equal(ops?.passwordHash, appHash);
      assert.deepEqual(ops?.roles, ["clipper"]);
      assert.equal(ops?.primaryRole, "clipper");
      assert.equal(ops?.email, "ops@fweta.com");
      assert.equal(oldAdmin?.passwordHash, "legacy-hash");
      assert.equal(oldAdmin?.email, "admin@fweta.test");
      assert.deepEqual(oldAdmin?.roles, ["admin"]);
      assert.equal(oldAdmin?.primaryRole, "admin");

      const appLogin = runLogin(dir, "ops@fweta.com", appPassword);
      assert.equal(appLogin.status, 0, appLogin.stderr || appLogin.stdout || "changed password rejected");
      const envLogin = runLogin(dir, "ops@fweta.com", envPassword);
      assert.notEqual(envLogin.status, 0);
      assert.match(envLogin.stderr, /Invalid email or password/);
    } finally {
      restoreAdmin();
      restoreData();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("duplicate profiles are reported and not deleted", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fweta-admin-dup-"));
    const restoreData = useDataDir(dir);
    const restoreAdmin = useAdminEnv("dup@fweta.com", "env-password-99");
    const first = profile({
      id: "dup-a",
      email: "dup@fweta.com",
      passwordHash: "hash-a",
      roles: ["brand"],
      primaryRole: "brand",
    });
    const second = profile({
      id: "dup-b",
      email: "Dup@fweta.com",
      passwordHash: "hash-b",
      roles: ["clipper"],
      primaryRole: "clipper",
    });
    const file = writeStore(dir, [first, second], [wallet(first.id), wallet(second.id)]);
    const before = readFileSync(file);
    try {
      const report = await ensureAdminAccount();
      assert.equal(report.seeded, false);
      assert.deepEqual(report.duplicateEmails, ["dup@fweta.com"]);
      assert.equal(readFileSync(file).equals(before), true);

      const house = await runHousekeepingJob(new Date("2026-04-01T00:00:00.000Z"));
      assert.equal(house.adminSeeded, false);
      assert.deepEqual(house.duplicateProfileEmails, ["dup@fweta.com"]);
      const { readStore } = await import("../../lib/db/store");
      const store = await readStore();
      const ids = store.profiles.map((item) => item.id).sort();
      assert.deepEqual(ids, ["dup-a", "dup-b"]);
      assert.equal(store.profiles.find((item) => item.id === "dup-a")?.passwordHash, "hash-a");
      assert.equal(store.profiles.find((item) => item.id === "dup-b")?.passwordHash, "hash-b");
      assert.deepEqual(store.profiles.find((item) => item.id === "dup-a")?.roles, ["brand"]);
      assert.deepEqual(store.profiles.find((item) => item.id === "dup-b")?.roles, ["clipper"]);
      assert.deepEqual(
        store.wallets.map((item) => item.userId).sort(),
        ["dup-a", "dup-b"],
      );
      const createdAdmin = store.profiles.find(
        (item) => item.roles.includes("admin") && item.passwordHash !== "hash-a" && item.passwordHash !== "hash-b",
      );
      assert.equal(createdAdmin, undefined);
    } finally {
      restoreAdmin();
      restoreData();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an env admin is created when that email is missing and can log in", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fweta-admin-new-"));
    const restoreData = useDataDir(dir);
    const restoreAdmin = useAdminEnv("ops@fweta.com", "env-password-99");
    const legacyHash = await bcrypt.hash("legacy-password-99", 10);
    const legacy = profile({
      id: "legacy",
      email: "admin@fweta.test",
      passwordHash: legacyHash,
      roles: ["admin"],
      primaryRole: "admin",
    });
    writeStore(dir, [legacy], [wallet(legacy.id)]);
    try {
      const house = await runHousekeepingJob(new Date("2026-04-01T00:00:00.000Z"));
      assert.equal(house.adminSeeded, true);
      assert.deepEqual(house.duplicateProfileEmails, []);
      const { readStore } = await import("../../lib/db/store");
      const store = await readStore();
      const created = store.profiles.find((item) => item.email === "ops@fweta.com");
      const oldAdmin = store.profiles.find((item) => item.id === "legacy");
      assert.ok(created);
      assert.equal(created.primaryRole, "admin");
      assert.deepEqual(created.roles, ["admin"]);
      assert.equal(await bcrypt.compare("env-password-99", created.passwordHash), true);
      assert.equal(store.wallets.some((item) => item.userId === created.id), true);
      assert.equal(oldAdmin?.passwordHash, legacyHash);
      assert.equal(oldAdmin?.email, "admin@fweta.test");
      assert.deepEqual(oldAdmin?.roles, ["admin"]);
      assert.equal(store.wallets.some((item) => item.userId === "legacy"), true);

      const createdLogin = runLogin(dir, "ops@fweta.com", "env-password-99");
      assert.equal(createdLogin.status, 0, createdLogin.stderr || createdLogin.stdout || "new admin login failed");
      const legacyLogin = runLogin(dir, "admin@fweta.test", "env-password-99");
      assert.notEqual(legacyLogin.status, 0);
      assert.match(legacyLogin.stderr, /Invalid email or password/);
    } finally {
      restoreAdmin();
      restoreData();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
