import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canViewKycDocument,
  kycFileNameOk,
  readKycDocument,
  saveKycDocument,
  useKycStoreForTests,
} from "@/lib/kyc/documents";
import { avatarObjectPath } from "@/lib/storage/avatars";
import { AVATAR_MAX_BYTES, ID_PHOTO_MAX_BYTES, uploadLimitMessage } from "@/lib/uploads/limits";

const USER = "11111111-1111-4111-8111-111111111111";

test("upload copy and byte limits match", () => {
  const small = { size: AVATAR_MAX_BYTES };
  const big = { size: AVATAR_MAX_BYTES + 1 };
  assert.equal(uploadLimitMessage(small, AVATAR_MAX_BYTES, "Image"), null);
  assert.equal(uploadLimitMessage(big, AVATAR_MAX_BYTES, "Image"), "Image must be 2 MB or smaller.");
  assert.equal(
    uploadLimitMessage({ size: ID_PHOTO_MAX_BYTES + 1 }, ID_PHOTO_MAX_BYTES, "ID photo"),
    "ID photo must be 4 MB or smaller.",
  );
});

test("server action body limit is 5mb", () => {
  const source = readFileSync("next.config.ts", "utf8");
  assert.match(source, /bodySizeLimit:\s*"5mb"/);
});

test("kyc migration is private and marked not to apply", () => {
  const sql = readFileSync("supabase/migrations/20261028140500_kyc_documents_bucket.sql", "utf8");
  assert.match(sql, /DO NOT APPLY/);
  assert.match(sql, /kyc-documents/);
  assert.match(sql, /public = false/);
  assert.equal(/create policy/i.test(sql), false);
});

test("kyc save does not use a local data folder", () => {
  const source = readFileSync("lib/kyc/documents.ts", "utf8");
  assert.equal(source.includes("mkdir"), false);
  assert.equal(source.includes("data/kyc"), false);
  assert.equal(source.includes("/var/task"), false);
});

test("kyc file names reject traversal", () => {
  assert.equal(kycFileNameOk("../secret.png"), false);
  assert.equal(kycFileNameOk("not-a-uuid.png"), false);
  assert.equal(kycFileNameOk(`${USER}.png`), true);
});

test("only the owner or an admin can view an ID photo", () => {
  assert.equal(canViewKycDocument(null, USER), false);
  assert.equal(canViewKycDocument({ id: "22222222-2222-4222-8222-222222222222", roles: ["clipper"] }, USER), false);
  assert.equal(canViewKycDocument({ id: USER, roles: ["clipper"] }, USER), true);
  assert.equal(
    canViewKycDocument({ id: "22222222-2222-4222-8222-222222222222", roles: ["admin"] }, USER),
    true,
  );
});

test("kyc round trip uses a private object key", async () => {
  const saved = new Map<string, { bytes: Uint8Array; contentType: string }>();
  useKycStoreForTests({
    async put(key, bytes, contentType) {
      saved.set(key, { bytes, contentType });
    },
    async get(key) {
      return saved.get(key) ?? null;
    },
  });
  try {
    const png = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], "id.png", { type: "image/png" });
    const name = await saveKycDocument(USER, png);
    assert.match(name, /^[0-9a-f-]{36}\.png$/);
    const read = await readKycDocument(USER, name);
    assert.ok(read);
    assert.equal(read.contentType, "image/png");
    assert.equal(saved.has(`${USER}/${name}`), true);
    assert.equal(await readKycDocument(USER, "../secret.png"), null);
    assert.equal(await readKycDocument("other-user-id", name), null);
  } finally {
    useKycStoreForTests(null);
  }
});

test("unconfigured kyc storage does not throw a filesystem error", async () => {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) return;
  useKycStoreForTests(null);
  const png = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], "id.png", { type: "image/png" });
  await assert.rejects(
    () => saveKycDocument(USER, png),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /not configured/i);
      assert.equal(err.message.includes("ENOENT"), false);
      assert.equal(err.message.includes("mkdir"), false);
      return true;
    },
  );
});

test("oversized and empty ID photos are rejected before storage", async () => {
  let writes = 0;
  useKycStoreForTests({
    async put() {
      writes += 1;
    },
    async get() {
      return null;
    },
  });
  try {
    const empty = new File([], "id.png", { type: "image/png" });
    await assert.rejects(() => saveKycDocument(USER, empty), /empty/);
    const text = new File(["hello"], "id.png", { type: "text/plain" });
    await assert.rejects(() => saveKycDocument(USER, text), /PNG, JPG, or WebP/);
    const big = {
      size: ID_PHOTO_MAX_BYTES + 1,
      type: "image/png",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File;
    await assert.rejects(() => saveKycDocument(USER, big), /4 MB/);
    assert.equal(writes, 0);
  } finally {
    useKycStoreForTests(null);
  }
});

test("avatar object paths stay inside the owner's folder", () => {
  const url = "https://example.supabase.co/storage/v1/object/public/avatars/user-1/profile-1.png";
  assert.equal(avatarObjectPath(url, "user-1"), "user-1/profile-1.png");
  assert.equal(avatarObjectPath(url, "user-2"), null);
  assert.equal(avatarObjectPath("https://evil.test/avatars/user-1/a.png", "user-1"), null);
  assert.equal(
    avatarObjectPath("https://example.supabase.co/storage/v1/object/public/avatars/user-1/../secret.png", "user-1"),
    null,
  );
});
