import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readStore, updateStore } from "../../lib/db/store";

import { uploadAvatarFile } from "../../lib/storage/avatars";
import {
  AVATAR_MAX_BYTES,
  BRIEF_UPLOAD_RATE_LIMIT_ERROR,
  GENERAL_READ_TTL_SECONDS,
  KYC_MAX_BYTES,
  KYC_READ_TTL_SECONDS,
  DELIVERY_FILE_LIMIT,
  DELIVERY_FILE_LIMIT_ERROR,
  SCREENSHOT_MAX_BYTES,
  SIGNED_UPLOAD_RETENTION_MS,
  STAGED_GRANT_RETENTION_MS,
  STORAGE_NOT_READY_ERROR,
  UGC_MAX_BYTES,
  UPLOAD_GRANTS_PER_BRIEF_PER_HOUR,
  UPLOAD_GRANTS_PER_HOUR,
  UPLOAD_RATE_LIMIT_ERROR,
  friendlyStorageError,
  withinLimit,
} from "../../lib/storage/constants";
import { isStorageConfigured, type StorageDriver } from "../../lib/storage/driver";
import { sweepUnfinalizedUploads } from "../../lib/storage/pending";
import { inspectFile } from "../../lib/storage/inspect";
import {
  appendGrantsIfAllowed,
  claimStagedFiles,
  claimStoredGrant,
  STAGED_FILE_IN_USE_ERROR,
  deliveryReferencedPaths,
  deliveryUploadDecision,
  downloadHeaders,
  finalizeStoredGrant,
  grantsAfterSweep,
  issueStoredGrant,
  newUploadToken,
  prepareRead,
  privateBucketProblems,
  retainAfterSweep,
  ugcStageDecision,
  type StoredGrant,
} from "../../lib/storage/policy";
import { writeReservedGrants } from "../../lib/storage/stage";

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
  assert.equal(typeof checked.grant?.spentAt, "string");
  assert.match(checked.grant?.tokenHash ?? "", /^spent:/);
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

test("housekeeping sweeps spent and expired uploads and keeps the grant through the signed URL window", () => {
  const housekeeping = readFileSync("lib/jobs/housekeeping.ts", "utf8");
  assert.match(housekeeping, /result\.uploadsRemoved = await sweepUnfinalizedUploads\(now\)/);
  assert.equal(SIGNED_UPLOAD_RETENTION_MS > 2 * 60 * 60 * 1000, true);

  const { issued, token } = grantFor();
  const opened = claimStoredGrant(issued, token, userA, nowMs);
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
  const rejected = finalizeStoredGrant(opened.grant, token, userA, nowMs + 1000, svg);
  assert.equal(rejected.ok, false);
  if (rejected.ok || !rejected.grant) return;

  const duringUrl = grantsAfterSweep([rejected.grant], nowMs + 2 * 60 * 60 * 1000);
  assert.equal(duringUrl.keep.some((grant) => grant.id === rejected.grant?.id), true);
  assert.equal(duringUrl.deleteObjects.length, 1);
  assert.equal(duringUrl.deleteObjects[0]?.path, rejected.grant.path);

  const afterUrl = grantsAfterSweep([rejected.grant], nowMs + SIGNED_UPLOAD_RETENTION_MS);
  assert.equal(afterUrl.keep.some((grant) => grant.id === rejected.grant?.id), false);
  assert.equal(afterUrl.deleteObjects.length, 1);

  const expired = grantsAfterSweep([issued], nowMs + 5 * 60 * 1000);
  assert.equal(expired.keep.length, 1);
  assert.equal(expired.deleteObjects.length, 1);
  const expiredLater = grantsAfterSweep([issued], nowMs + SIGNED_UPLOAD_RETENTION_MS);
  assert.equal(expiredLater.keep.length, 0);
  assert.equal(expiredLater.deleteObjects.length, 1);

  const finalized = { ...issued, id: "kept", path: `${userA}/ugc/kept`, finalizedAt: issued.createdAt };
  const saved = grantsAfterSweep([finalized], nowMs + SIGNED_UPLOAD_RETENTION_MS);
  assert.equal(saved.keep.length, 1);
  assert.equal(saved.deleteObjects.length, 0);

  const past = nowMs + SIGNED_UPLOAD_RETENTION_MS;
  const keptDuring = retainAfterSweep({
    grants: [rejected.grant],
    nowMs: nowMs + 60 * 60 * 1000,
    deletedIds: new Set([rejected.grant.id]),
    storageConfigured: true,
  });
  assert.equal(keptDuring.length, 1);
  const dropped = retainAfterSweep({
    grants: [rejected.grant],
    nowMs: past,
    deletedIds: new Set([rejected.grant.id]),
    storageConfigured: true,
  });
  assert.equal(dropped.length, 0);
  const retry = retainAfterSweep({
    grants: [rejected.grant],
    nowMs: past,
    deletedIds: new Set(),
    storageConfigured: true,
  });
  assert.equal(retry.length, 1);
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

const acceptedApplication = {
  id: "application-1",
  creatorId: userA,
  briefId: "brief-1",
  status: "accepted",
};

function stagedCopies(count: number, targetId: string, createdAtMs: number, owner = userA): StoredGrant[] {
  const { issued } = grantFor();
  return Array.from({ length: count }, (_, index) => {
    const id = `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`;
    return {
      ...issued,
      id,
      userId: owner,
      path: `${owner}/ugc/${id}`,
      targetId,
      createdAt: new Date(createdAtMs).toISOString(),
    };
  });
}

test("stageUgcFileAction requires an accepted application on that brief", () => {
  const licensing = readFileSync("app/actions/licensing.ts", "utf8");
  const form = readFileSync("components/forms/licensing-forms.tsx", "utf8");
  assert.match(licensing, /appendGrantsIfAllowed\(/);
  assert.match(form, /body\.set\("applicationId", applicationId\)/);

  const allowed = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications: [acceptedApplication],
    grants: [],
    nowMs,
  });
  assert.equal(allowed.ok, true);

  const missing = ugcStageDecision({
    userId: userA,
    applicationId: "missing-application",
    applications: [acceptedApplication],
    grants: [],
    nowMs,
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.error, "Accept the brief before uploading.");

  const applied = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications: [{ ...acceptedApplication, status: "applied" }],
    grants: [],
    nowMs,
  });
  assert.equal(applied.ok, false);

  const someoneElse = ugcStageDecision({
    userId: userB,
    applicationId: acceptedApplication.id,
    applications: [acceptedApplication],
    grants: [],
    nowMs,
  });
  assert.equal(someoneElse.ok, false);
});

test("stageUgcFileAction caps grants per user and per brief", () => {
  assert.equal(UPLOAD_GRANTS_PER_HOUR, 30);
  assert.equal(UPLOAD_GRANTS_PER_BRIEF_PER_HOUR < UPLOAD_GRANTS_PER_HOUR, true);
  const applications = [
    acceptedApplication,
    { ...acceptedApplication, id: "application-old", status: "declined" },
    { ...acceptedApplication, id: "application-2", briefId: "brief-2" },
  ];
  const under = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_BRIEF_PER_HOUR - 1, "application-old", nowMs - 1000),
    nowMs,
  });
  assert.equal(under.ok, true);
  const atBrief = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_BRIEF_PER_HOUR, "application-old", nowMs - 1000),
    nowMs,
  });
  assert.equal(atBrief.ok, false);
  if (atBrief.ok) return;
  assert.equal(atBrief.error, BRIEF_UPLOAD_RATE_LIMIT_ERROR);

  const otherBrief = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_BRIEF_PER_HOUR, "application-2", nowMs - 1000),
    nowMs,
  });
  assert.equal(otherBrief.ok, true);

  const stale = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_HOUR, acceptedApplication.id, nowMs - 60 * 60 * 1000),
    nowMs,
  });
  assert.equal(stale.ok, true);
});

test("createUgcUploadAction uses the same hourly grant cap", () => {
  const uploads = readFileSync("app/actions/uploads.ts", "utf8");
  assert.match(uploads, /ugcStageDecision\(/);
  const applications = [
    acceptedApplication,
    { ...acceptedApplication, id: "application-2", briefId: "brief-2" },
  ];
  const capped = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_HOUR, "application-2", nowMs - 1000),
    nowMs,
  });
  assert.equal(capped.ok, false);
  if (capped.ok) return;
  assert.equal(capped.error, UPLOAD_RATE_LIMIT_ERROR);

  const room = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_HOUR - 1, "application-2", nowMs - 1000),
    nowMs,
  });
  assert.equal(room.ok, true);

  const otherUser = ugcStageDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_HOUR, "application-2", nowMs - 1000, userB),
    nowMs,
  });
  assert.equal(otherUser.ok, true);
});

function asStaged(id: string, stagedMs: number, extra: Partial<StoredGrant> = {}): StoredGrant {
  const { issued } = grantFor();
  return {
    ...issued,
    id,
    path: `${userA}/ugc/${id}`,
    createdAt: new Date(stagedMs).toISOString(),
    stagedAt: new Date(stagedMs).toISOString(),
    finalizedAt: new Date(stagedMs).toISOString(),
    attachedAt: null,
    targetId: acceptedApplication.id,
    ...extra,
  };
}

test("parallel stage requests leave no object without a grant", async () => {
  const licensing = readFileSync("app/actions/licensing.ts", "utf8");
  assert.equal(licensing.includes("saveUgcFile"), false);
  assert.match(licensing, /appendGrantsIfAllowed\(/);
  assert.match(licensing, /writeReservedGrants\(/);

  let grants = stagedCopies(UPLOAD_GRANTS_PER_HOUR - 1, "application-2", nowMs - 1000);
  const applications = [
    acceptedApplication,
    { ...acceptedApplication, id: "application-2", briefId: "brief-2" },
  ];
  let chain = Promise.resolve();
  const written: string[] = [];

  async function stage(index: number) {
    const id = `66666666-6666-4666-8666-${String(index).padStart(12, "0")}`;
    const grant = asStaged(id, nowMs);
    return writeReservedGrants({
      reserve: () => {
        const run = chain.then(() => {
          const appended = appendGrantsIfAllowed({
            grants,
            userId: userA,
            applicationId: acceptedApplication.id,
            applications,
            nowMs,
            incoming: [grant],
          });
          grants = appended.grants;
          return appended.ok
            ? { ok: true as const, grants: [grant] }
            : { ok: false as const, error: appended.error };
        });
        chain = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      },
      writeObject: async (reserved) => {
        written.push(reserved.path);
      },
      markSpent: async () => undefined,
    });
  }

  const results = await Promise.all([1, 2, 3, 4, 5].map((index) => stage(index)));
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(written.length, 1);
  for (const objectPath of written) {
    assert.equal(grants.some((item) => item.path === objectPath), true);
  }
  assert.equal(grants.length, UPLOAD_GRANTS_PER_HOUR);
});

test("a failed object write marks the grant spent so the sweep can remove it", async () => {
  const grant = asStaged("77777777-7777-4777-8777-777777777777", nowMs, { finalizedAt: null });
  let spent: StoredGrant | null = null;
  const result = await writeReservedGrants({
    reserve: async () => ({ ok: true, grants: [grant] }),
    writeObject: async () => {
      throw new Error("Upload failed");
    },
    markSpent: async (row) => {
      spent = { ...row, tokenHash: `spent:${row.id}`, spentAt: new Date(nowMs).toISOString() };
    },
  });
  assert.equal(result.ok, false);
  assert.ok(spent);
  if (!spent) return;
  const swept = grantsAfterSweep([spent], nowMs + 1000);
  assert.equal(swept.deleteObjects.some((item) => item.id === grant.id), true);
});

test("submitDeliveryAction checks the brief and caps before any object write", async () => {
  const applications = [
    acceptedApplication,
    { ...acceptedApplication, id: "application-2", briefId: "brief-2" },
  ];
  const tooMany = deliveryUploadDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: [],
    nowMs,
    fileCount: DELIVERY_FILE_LIMIT + 1,
  });
  assert.equal(tooMany.ok, false);
  if (tooMany.ok) return;
  assert.equal(tooMany.error, DELIVERY_FILE_LIMIT_ERROR);

  const applied = deliveryUploadDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications: [{ ...acceptedApplication, status: "applied" }],
    grants: [],
    nowMs,
    fileCount: 2,
  });
  assert.equal(applied.ok, false);
  if (applied.ok) return;
  assert.equal(applied.error, "Accept the brief before uploading.");

  const hourly = deliveryUploadDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_HOUR - 2, "application-2", nowMs - 1000),
    nowMs,
    fileCount: 3,
  });
  assert.equal(hourly.ok, false);
  if (hourly.ok) return;
  assert.equal(hourly.error, UPLOAD_RATE_LIMIT_ERROR);

  const brief = deliveryUploadDecision({
    userId: userA,
    applicationId: acceptedApplication.id,
    applications,
    grants: stagedCopies(UPLOAD_GRANTS_PER_BRIEF_PER_HOUR - 1, acceptedApplication.id, nowMs - 1000),
    nowMs,
    fileCount: 2,
  });
  assert.equal(brief.ok, false);
  if (brief.ok) return;
  assert.equal(brief.error, BRIEF_UPLOAD_RATE_LIMIT_ERROR);

  const writes: string[] = [];
  const blocked = await writeReservedGrants({
    reserve: async () => ({ ok: false, error: tooMany.error }),
    writeObject: async (grant) => {
      writes.push(grant.path);
    },
    markSpent: async () => undefined,
  });
  assert.equal(blocked.ok, false);
  assert.equal(writes.length, 0);

  const incoming = [1, 2].map((index) => asStaged(`88888888-8888-4888-8888-${String(index).padStart(12, "0")}`, nowMs));
  const reserved = appendGrantsIfAllowed({
    grants: [],
    userId: userA,
    applicationId: acceptedApplication.id,
    applications: [acceptedApplication],
    nowMs,
    incoming,
  });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  assert.equal(reserved.grants.length, incoming.length);
  assert.equal(reserved.grants.every((grant) => incoming.some((file) => file.id === grant.id)), true);
});

test("an unattached staged file is swept after its retention and an attached file is kept", () => {
  assert.equal(STAGED_GRANT_RETENTION_MS, 24 * 60 * 60 * 1000);
  const fresh = asStaged(fileId, nowMs);
  const early = grantsAfterSweep([fresh], nowMs + 60 * 60 * 1000);
  assert.equal(early.keep.length, 1);
  assert.equal(early.deleteObjects.length, 0);

  const stale = asStaged(fileId, nowMs - STAGED_GRANT_RETENTION_MS);
  const late = grantsAfterSweep([stale], nowMs);
  assert.equal(late.keep.length, 0);
  assert.equal(late.deleteObjects.length, 1);

  const attached = asStaged(fileId, nowMs - STAGED_GRANT_RETENTION_MS, {
    attachedAt: new Date(nowMs - 1000).toISOString(),
  });
  const saved = grantsAfterSweep([attached], nowMs + STAGED_GRANT_RETENTION_MS);
  assert.equal(saved.keep.length, 1);
  assert.equal(saved.deleteObjects.length, 0);

  const retry = retainAfterSweep({
    grants: [stale],
    nowMs,
    deletedIds: new Set(),
    storageConfigured: true,
  });
  assert.equal(retry.length, 1);
  const removed = retainAfterSweep({
    grants: [stale],
    nowMs,
    deletedIds: new Set([stale.id]),
    storageConfigured: true,
  });
  assert.equal(removed.length, 0);
});

test("a later delivery cannot re-attach a file that is already attached", () => {
  const attachedAt = new Date(nowMs - 1000).toISOString();
  const grants = [asStaged(fileId, nowMs - 60_000, { attachedAt })];
  const before = grants.map((grant) => ({ ...grant }));
  const deliveries: string[] = ["delivery-1"];
  const claimed = claimStagedFiles({
    grants,
    userId: userA,
    applicationId: acceptedApplication.id,
    paths: [grants[0]!.path],
    now: new Date(nowMs).toISOString(),
  });
  assert.equal(claimed.ok, false);
  if (claimed.ok) return;
  assert.equal(claimed.error, STAGED_FILE_IN_USE_ERROR);
  assert.deepEqual(grants, before);
  assert.equal(deliveries.length, 1);
  assert.equal(grants[0]?.attachedAt, attachedAt);

  const fresh = asStaged("44444444-4444-4444-8444-444444444444", nowMs - 60_000);
  const batch = [grants[0]!, fresh];
  const batchBefore = batch.map((grant) => ({ ...grant }));
  const mixed = claimStagedFiles({
    grants: batch,
    userId: userA,
    applicationId: acceptedApplication.id,
    paths: [grants[0]!.path, fresh.path],
    now: new Date(nowMs).toISOString(),
  });
  assert.equal(mixed.ok, false);
  assert.deepEqual(batch, batchBefore);
});

test("two parallel deliveries attach the same staged file once", async () => {
  let grants = [asStaged(fileId, nowMs - 60_000)];
  const deliveries: string[] = [];
  let chain = Promise.resolve();

  function deliver(deliveryId: string) {
    const run = chain.then(() => {
      const claimed = claimStagedFiles({
        grants,
        userId: userA,
        applicationId: acceptedApplication.id,
        paths: [grants[0]!.path],
        now: new Date(nowMs).toISOString(),
      });
      if (!claimed.ok) return claimed;
      grants = claimed.grants;
      deliveries.push(deliveryId);
      return claimed;
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const results = await Promise.all([deliver("delivery-a"), deliver("delivery-b")]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok && result.error === STAGED_FILE_IN_USE_ERROR).length, 1);
  assert.deepEqual(deliveries, ["delivery-a"]);
  assert.equal(grants.filter((grant) => grant.attachedAt).length, 1);
});

test("the sweep rechecks attachment inside the write before deleting", () => {
  const pending = readFileSync("lib/storage/pending.ts", "utf8");
  const fn = pending.slice(pending.indexOf("export async function sweepUnfinalizedUploads"));
  const writeAt = fn.indexOf("await updateStore");
  const closeAt = fn.indexOf("\n  });", writeAt);
  const deleteAt = fn.indexOf("deleteObject", closeAt);
  const writeBody = fn.slice(writeAt, closeAt);
  assert.ok(writeAt >= 0 && closeAt > writeAt && deleteAt > closeAt);
  assert.equal(writeBody.includes("deleteObject"), false);
  assert.match(writeBody, /deliveryReferencedPaths\(draft/);
  assert.match(writeBody, /rowsAfterSweepWrite\(/);

  const stale = asStaged(fileId, nowMs - STAGED_GRANT_RETENTION_MS);
  const preview = grantsAfterSweep([stale], nowMs);
  assert.equal(preview.deleteObjects.length, 1);
  const attached = { ...stale, attachedAt: new Date(nowMs).toISOString() };
  const insideWrite = grantsAfterSweep([attached], nowMs);
  assert.equal(insideWrite.deleteObjects.length, 0);
  const kept = retainAfterSweep({
    grants: [attached],
    nowMs,
    deletedIds: new Set([stale.id]),
    storageConfigured: true,
  });
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.attachedAt, attached.attachedAt);
});

test("a delivery that references the object just before the sweep keeps the object and the row", () => {
  const stale = asStaged(fileId, nowMs - STAGED_GRANT_RETENTION_MS);
  assert.equal(stale.attachedAt ?? null, null);
  const preview = grantsAfterSweep([stale], nowMs);
  assert.equal(preview.deleteObjects.length, 1);

  const referencedPaths = deliveryReferencedPaths([{ files: [{ name: stale.path }] }]);
  const insideWrite = grantsAfterSweep([stale], nowMs, referencedPaths);
  assert.equal(insideWrite.deleteObjects.length, 0);
  assert.equal(insideWrite.keep.length, 1);

  const kept = retainAfterSweep({
    grants: [stale],
    nowMs,
    deletedIds: new Set([stale.id]),
    storageConfigured: false,
    referencedPaths,
  });
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.id, stale.id);
  assert.equal(kept[0]?.path, stale.path);
});

function sweepDriver(deleteObject: StorageDriver["deleteObject"]): StorageDriver {
  return {
    uploadObject: async () => undefined,
    downloadObject: async () => null,
    deleteObject,
    createSignedUploadUrl: async () => ({ signedUrl: "", token: "" }),
    createSignedReadUrl: async () => "",
  };
}

async function resetSweepStore() {
  globalThis.__fwetaStore = undefined;
  await rm("data/store.json", { force: true });
}

test("a delivery that attaches a staged file older than 24h wins the race and kept rows are not deleted", async () => {
  const raced = asStaged(fileId, nowMs - STAGED_GRANT_RETENTION_MS);
  const keptId = "55555555-5555-4555-8555-555555555555";
  const doomedId = "66666666-6666-4666-8666-666666666666";
  const kept = asStaged(keptId, nowMs - STAGED_GRANT_RETENTION_MS, {
    attachedAt: new Date(nowMs - 1000).toISOString(),
  });
  const doomed = asStaged(doomedId, nowMs - STAGED_GRANT_RETENTION_MS);
  const calls: string[] = [];
  await resetSweepStore();
  try {
    await updateStore((draft) => {
      draft.uploadGrants = [raced, kept, doomed];
      draft.ugcDeliveries = [];
      draft.pendingUploadDeletes = [];
    });
    const attaching = updateStore((draft) => {
      const grant = draft.uploadGrants?.find((item) => item.id === raced.id);
      if (!grant) throw new Error("missing grant");
      grant.attachedAt = new Date(nowMs).toISOString();
      draft.ugcDeliveries.push({
        id: "delivery-race",
        briefId: acceptedApplication.briefId,
        applicationId: acceptedApplication.id,
        creatorId: userA,
        files: [{ id: raced.id, name: raced.path, originalName: "clip.png", kind: "raw" }],
        status: "submitted",
        revisionCount: 0,
        revisionNote: null,
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
      });
    });
    const sweeping = sweepUnfinalizedUploads(new Date(nowMs), sweepDriver(async (_bucket, path) => {
      calls.push(path);
    }));
    await Promise.all([attaching, sweeping]);
    assert.equal(calls.includes(raced.path), false);
    assert.equal(calls.includes(kept.path), false);
    assert.deepEqual(calls, [doomed.path]);
    const after = await readStore();
    assert.equal(after.uploadGrants?.some((grant) => grant.id === raced.id && grant.attachedAt), true);
    assert.equal(after.uploadGrants?.some((grant) => grant.id === kept.id), true);
    assert.equal(after.uploadGrants?.some((grant) => grant.id === doomed.id), false);
  } finally {
    await resetSweepStore();
  }
});

test("a failed object delete leaves the row removed and the next sweep retries it", async () => {
  const doomed = asStaged(fileId, nowMs - STAGED_GRANT_RETENTION_MS);
  await resetSweepStore();
  try {
    await updateStore((draft) => {
      draft.uploadGrants = [doomed];
      draft.ugcDeliveries = [];
      draft.pendingUploadDeletes = [];
    });
    await sweepUnfinalizedUploads(
      new Date(nowMs),
      sweepDriver(async () => {
        throw new Error("provider down");
      }),
    );
    const mid = await readStore();
    assert.equal(mid.uploadGrants?.some((grant) => grant.id === doomed.id), false);
    assert.equal(mid.pendingUploadDeletes?.some((item) => item.id === doomed.id && item.path === doomed.path), true);
    const calls: string[] = [];
    await sweepUnfinalizedUploads(
      new Date(nowMs),
      sweepDriver(async (_bucket, path) => {
        calls.push(path);
      }),
    );
    assert.deepEqual(calls, [doomed.path]);
    const done = await readStore();
    assert.equal(done.pendingUploadDeletes?.length ?? 0, 0);
    assert.equal(done.uploadGrants?.some((grant) => grant.id === doomed.id), false);
  } finally {
    await resetSweepStore();
  }
});

test("storage not configured leaves an unattached expired grant and the retry list, and deletes nothing", async () => {
  assert.equal(isStorageConfigured(), false);
  const stale = asStaged(fileId, nowMs - STAGED_GRANT_RETENTION_MS);
  const retry = [
    {
      id: "77777777-7777-4777-8777-777777777777",
      bucket: "fweta-kyc" as const,
      path: `${userA}/kyc/77777777-7777-4777-8777-777777777777`,
    },
  ];
  await resetSweepStore();
  try {
    await updateStore((draft) => {
      draft.uploadGrants = [stale];
      draft.ugcDeliveries = [];
      draft.pendingUploadDeletes = retry.map((item) => ({ ...item }));
    });
    const removed = await sweepUnfinalizedUploads(new Date(nowMs));
    assert.equal(removed, 0);
    const after = await readStore();
    assert.equal(after.uploadGrants?.some((grant) => grant.id === stale.id), true);
    assert.equal(after.uploadGrants?.find((grant) => grant.id === stale.id)?.attachedAt ?? null, null);
    assert.deepEqual(after.pendingUploadDeletes, retry);
  } finally {
    await resetSweepStore();
  }
});
