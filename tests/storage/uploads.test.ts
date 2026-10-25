import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { uploadAvatarFile } from "../../lib/storage/avatars";
import {
  AVATAR_MAX_BYTES,
  GENERAL_READ_TTL_SECONDS,
  KYC_MAX_BYTES,
  KYC_READ_TTL_SECONDS,
  SCREENSHOT_MAX_BYTES,
  STORAGE_NOT_READY_ERROR,
  UGC_MAX_BYTES,
  friendlyStorageError,
  withinLimit,
} from "../../lib/storage/constants";
import type { StorageDriver } from "../../lib/storage/driver";
import { inspectFile } from "../../lib/storage/inspect";
import {
  claimStoredGrant,
  downloadHeaders,
  finalizeStoredGrant,
  grantsAfterSweep,
  issueStoredGrant,
  newUploadToken,
  prepareRead,
  privateBucketProblems,
} from "../../lib/storage/policy";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const fileId = "33333333-3333-4333-8333-333333333333";
const nowMs = Date.parse("2026-10-25T12:00:00.000Z");

function pngBytes(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

function fileOf(bytes: Uint8Array, name: string, type: string): File {
  return new File([Buffer.from(bytes)], name, { type });
}

function grantFor(byteSize = 1200, clientPath?: string) {
  const token = newUploadToken();
  const issued = issueStoredGrant({
    userId: userA,
    purpose: "ugc",
    byteSize,
    nowMs,
    id: fileId,
    token,
    targetId: "application-1",
    clientPath,
  });
  if ("error" in issued) throw new Error(issued.error);
  return { token, issued };
}

test("limits match the 2 MB, 4 MB, and 40 MB screens", () => {
  assert.equal(AVATAR_MAX_BYTES, 2 * 1024 * 1024);
  assert.equal(SCREENSHOT_MAX_BYTES, 2 * 1024 * 1024);
  assert.equal(KYC_MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(UGC_MAX_BYTES, 40 * 1024 * 1024);
  assert.equal(withinLimit("avatar", AVATAR_MAX_BYTES), true);
  assert.equal(withinLimit("screenshot", SCREENSHOT_MAX_BYTES), true);
  assert.equal(withinLimit("kyc", KYC_MAX_BYTES), true);
  assert.equal(withinLimit("ugc", UGC_MAX_BYTES), true);
  assert.equal(withinLimit("ugc", UGC_MAX_BYTES + 1), false);
  assert.equal(KYC_READ_TTL_SECONDS < GENERAL_READ_TTL_SECONDS, true);
});

test("a wrong type with a right name is rejected", async () => {
  const svg = fileOf(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "photo.png", "image/png");
  await assert.rejects(() => inspectFile(svg, "avatar"), /JPEG, PNG, or WebP/);
  const html = fileOf(new TextEncoder().encode("<!DOCTYPE html><html></html>"), "image.jpg", "image/jpeg");
  await assert.rejects(() => inspectFile(html, "ugc"), /PNG, JPG, WebP, or PDF/);
  const png = await inspectFile(fileOf(pngBytes(), "notes.pdf", "application/pdf"), "avatar");
  assert.equal(png.kind, "png");
});

test("an oversize file is rejected", async () => {
  const big = fileOf(new Uint8Array(AVATAR_MAX_BYTES + 1), "big.png", "image/png");
  await assert.rejects(() => inspectFile(big, "avatar"), /2MB or smaller/);
});

test("the server ignores another user's path", () => {
  const { issued, token } = grantFor(100, `${userB}/ugc/stolen`);
  assert.equal(issued.path.startsWith(`${userA}/ugc/`), true);
  assert.equal(issued.path.includes(userB), false);
  const stolen = claimStoredGrant(issued, token, userB, nowMs);
  assert.equal(stolen.ok, false);
});

test("a reused upload link is rejected", () => {
  const { issued, token } = grantFor();
  const first = claimStoredGrant(issued, token, userA, nowMs);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = claimStoredGrant(first.grant, token, userA, nowMs + 1000);
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.match(second.error, /already used/);
});

test("an expired upload link is rejected", () => {
  const { issued, token } = grantFor();
  const expired = claimStoredGrant(issued, token, userA, nowMs + 5 * 60 * 1000);
  assert.equal(expired.ok, false);
  if (expired.ok) return;
  assert.match(expired.error, /expired/);
});

test("a non-owner read is rejected and does not get a signed link", () => {
  const denied = prepareRead({
    requesterId: userB,
    ownerIds: [userA],
    isAdmin: false,
    bucket: "fweta-kyc",
  });
  assert.equal(denied.ok, false);
  const allowed = prepareRead({
    requesterId: userA,
    ownerIds: [userA],
    isAdmin: false,
    bucket: "fweta-media",
  });
  assert.equal(allowed.ok, true);
  if (!allowed.ok) return;
  assert.equal(allowed.expiresIn, GENERAL_READ_TTL_SECONDS);
  const kyc = prepareRead({
    requesterId: userA,
    ownerIds: [userA],
    isAdmin: false,
    bucket: "fweta-kyc",
  });
  assert.equal(kyc.ok, true);
  if (!kyc.ok) return;
  assert.equal(kyc.expiresIn, KYC_READ_TTL_SECONDS);
});

test("finalize deletes a file whose bytes do not match its name", () => {
  const { issued, token } = grantFor();
  const opened = claimStoredGrant(issued, token, userA, nowMs);
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
  const checked = finalizeStoredGrant(opened.grant, token, userA, nowMs + 1000, svg);
  assert.equal(checked.ok, false);
  if (checked.ok) return;
  assert.equal(checked.deleteObject, true);
  assert.equal(checked.grant?.finalizedAt ?? null, null);
});

test("download responses use a fixed type, nosniff, and attachment for documents", () => {
  const headers = downloadHeaders({
    contentType: "image/png",
    filename: "screenshot.png",
    attachment: true,
  });
  assert.equal(headers["Content-Type"], "image/png");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Content-Disposition"] ?? "", /^attachment; filename="screenshot.png"$/);
});

test("Bucket not found becomes a friendly error", async () => {
  assert.equal(friendlyStorageError("Bucket not found"), STORAGE_NOT_READY_ERROR);
  assert.equal(STORAGE_NOT_READY_ERROR.includes("Bucket not found"), false);
  let uploaded = false;
  const driver: StorageDriver = {
    async uploadObject() {
      uploaded = true;
      throw new Error("Bucket not found");
    },
    async downloadObject() {
      return null;
    },
    async deleteObject() {},
    async createSignedUploadUrl() {
      return { signedUrl: "https://example.test/upload", token: "t" };
    },
    async createSignedReadUrl() {
      return "https://example.test/read";
    },
  };
  const result = await uploadAvatarFile({
    userId: userA,
    file: fileOf(pngBytes(), "photo.png", "image/png"),
    kind: "profile",
    driver,
  });
  assert.equal(uploaded, true);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, STORAGE_NOT_READY_ERROR);
  assert.equal(result.error.includes("Bucket not found"), false);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
    const unconfigured = await uploadAvatarFile({
      userId: userA,
      file: fileOf(pngBytes(), "photo.png", "image/png"),
      kind: "profile",
    });
    assert.equal(unconfigured.ok, false);
    if (!unconfigured.ok) {
      assert.equal(unconfigured.error, STORAGE_NOT_READY_ERROR);
      assert.equal(unconfigured.error.includes("Bucket not found"), false);
    }

    const svg = fileOf(
      new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
      "photo.png",
      "image/png",
    );
    const wrongType = await uploadAvatarFile({ userId: userA, file: svg, kind: "profile" });
    assert.equal(wrongType.ok, false);
    if (!wrongType.ok) {
      assert.match(wrongType.error, /JPEG, PNG, or WebP/);
      assert.equal(wrongType.error.includes("Bucket not found"), false);
    }
  }
});

test("housekeeping drops uploads that were never finalized", () => {
  const { issued } = grantFor();
  const swept = grantsAfterSweep(
    [issued, { ...issued, id: "kept", path: `${userA}/ugc/kept`, finalizedAt: issued.createdAt }],
    nowMs + 5 * 60 * 1000,
  );
  assert.equal(swept.remove.length, 1);
  assert.equal(swept.keep.length, 1);
  assert.equal(swept.keep[0]?.finalizedAt, issued.createdAt);
});

test("neither private bucket is public and anon cannot use storage.objects", () => {
  assert.deepEqual(
    privateBucketProblems({
      buckets: [
        { id: "fweta-media", public: false },
        { id: "fweta-kyc", public: false },
      ],
      policies: [],
    }),
    [],
  );
  assert.equal(
    privateBucketProblems({
      buckets: [
        { id: "fweta-media", public: true },
        { id: "fweta-kyc", public: false },
      ],
      policies: [],
    }).some((problem) => problem.includes("public")),
    true,
  );
  assert.equal(
    privateBucketProblems({
      buckets: [
        { id: "fweta-media", public: false },
        { id: "fweta-kyc", public: false },
      ],
      policies: [{ roles: ["authenticated"] }],
    }).some((problem) => problem.includes("anon or authenticated")),
    true,
  );
});

test("the migration creates both private buckets and does not grant anon access", () => {
  const migration = readFileSync("supabase/migrations/20261025220000_private_storage_buckets.sql", "utf8");
  const rollback = readFileSync("supabase/rollbacks/20261025220000_private_storage_buckets.sql", "utf8");
  const check = readFileSync("scripts/check-private-storage.sql", "utf8");
  assert.equal(migration.includes("'fweta-media'"), true);
  assert.equal(migration.includes("'fweta-kyc'"), true);
  assert.equal(migration.includes("create policy"), false);
  assert.equal(migration.includes("avatars_public_read"), true);
  assert.equal(migration.includes("on conflict (id) do update"), true);
  assert.equal((migration.match(/insert into storage\.buckets/g) ?? []).length, 2);
  assert.equal(migration.includes("where id = 'avatars'"), true);
  assert.equal(rollback.includes("delete from storage.buckets"), true);
  assert.equal(check.includes("'anon'"), true);
  assert.equal(check.includes("'authenticated'"), true);
  assert.equal(check.includes("fweta-media is public"), true);
  assert.equal(check.includes("fweta-kyc is public"), true);
});
