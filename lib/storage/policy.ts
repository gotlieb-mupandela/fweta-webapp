import { createHash, randomBytes } from "crypto";

import {
  type AllowedKind,
  BRIEF_UPLOAD_RATE_LIMIT_ERROR,
  type StorageBucket,
  type UploadPurpose,
  UPLOAD_GRANTS_PER_BRIEF_PER_HOUR,
  UPLOAD_GRANTS_PER_HOUR,
  UPLOAD_RATE_LIMIT_ERROR,
  UPLOAD_TTL_MS,
  SIGNED_UPLOAD_RETENTION_MS,
  bucketFor,
  emptyFileMessage,
  limitFor,
  oversizeMessage,
  purposeAllows,
  readTtlSeconds,
  typeMessage,
  withinLimit,
} from "@/lib/storage/constants";
import type { UploadGrant } from "@/lib/db/types";
import { sniffKind } from "@/lib/storage/sniff";

export type StoredGrant = UploadGrant;

const USER_ID = /^[A-Za-z0-9_-]{8,80}$/;
const FILE_ID = /^[0-9a-f-]{36}(\.(png|jpg|webp|pdf))?$/i;
const FLAT_NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/i;

export function hashUploadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newUploadToken(): string {
  return randomBytes(32).toString("hex");
}

export function pathOwnedBy(path: string, userId: string): boolean {
  if (!USER_ID.test(userId)) return false;
  if (!isSafeStoragePath(path)) return false;
  return path.startsWith(`${userId}/`);
}

export function isSafeStoragePath(path: string): boolean {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
  const parts = path.split("/");
  if (parts.length !== 3) return false;
  const [userId, folder, file] = parts;
  if (!userId || !folder || !file) return false;
  if (!USER_ID.test(userId)) return false;
  if (folder !== "avatar" && folder !== "screenshot" && folder !== "ugc" && folder !== "kyc") return false;
  return FILE_ID.test(file);
}

export function isFlatLocalName(name: string): boolean {
  return FLAT_NAME.test(name);
}

export function isStoredObjectName(name: string): boolean {
  return isFlatLocalName(name) || isSafeStoragePath(name);
}

/**
 * The server picks the object path. A client supplied path is ignored.
 */
export function serverObjectPath(userId: string, purpose: UploadPurpose, id: string, extension?: string): string {
  if (!USER_ID.test(userId)) throw new Error("Sign in required.");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Could not store that file.");
  const suffix = extension ? `.${extension}` : "";
  return `${userId}/${purpose}/${id}${suffix}`;
}

export function issueStoredGrant(input: {
  userId: string;
  purpose: UploadPurpose;
  byteSize: number;
  nowMs: number;
  id: string;
  token: string;
  targetId?: string | null;
  clientPath?: string | null;
}): StoredGrant | { error: string } {
  if (!USER_ID.test(input.userId)) return { error: "Sign in required." };
  if (input.byteSize <= 0) return { error: emptyFileMessage(input.purpose) };
  if (!withinLimit(input.purpose, input.byteSize)) return { error: oversizeMessage(input.purpose) };
  let path: string;
  try {
    path = serverObjectPath(input.userId, input.purpose, input.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not store that file." };
  }
  // clientPath is never written. Callers may pass one to prove the server path wins.
  void input.clientPath;
  if (!pathOwnedBy(path, input.userId)) return { error: "This upload link is not valid." };
  const now = new Date(input.nowMs).toISOString();
  return {
    id: input.id,
    userId: input.userId,
    bucket: bucketFor(input.purpose),
    path,
    purpose: input.purpose,
    maxBytes: limitFor(input.purpose),
    tokenHash: hashUploadToken(input.token),
    expiresAt: new Date(input.nowMs + UPLOAD_TTL_MS).toISOString(),
    openedAt: null,
    finalizedAt: null,
    spentAt: null,
    targetId: input.targetId ?? null,
    createdAt: now,
  };
}

export function claimStoredGrant(
  grant: StoredGrant,
  token: string,
  userId: string,
  nowMs: number,
): { ok: true; grant: StoredGrant } | { ok: false; error: string } {
  if (grantIsSpent(grant)) return { ok: false, error: "This upload link was already used." };
  if (hashUploadToken(token) !== grant.tokenHash) return { ok: false, error: "This upload link is not valid." };
  if (userId !== grant.userId) return { ok: false, error: "This upload link is not valid." };
  if (!pathOwnedBy(grant.path, userId)) return { ok: false, error: "This upload link is not valid." };
  if (nowMs >= Date.parse(grant.expiresAt)) return { ok: false, error: "This upload link has expired." };
  if (grant.openedAt || grant.finalizedAt) return { ok: false, error: "This upload link was already used." };
  return { ok: true, grant: { ...grant, openedAt: new Date(nowMs).toISOString() } };
}

export function finalizeStoredGrant(
  grant: StoredGrant,
  token: string,
  userId: string,
  nowMs: number,
  bytes: Uint8Array,
):
  | { ok: true; grant: StoredGrant; kind: AllowedKind }
  | { ok: false; error: string; deleteObject: boolean; grant?: StoredGrant } {
  if (grantIsSpent(grant)) {
    return { ok: false, error: "This upload link was already used.", deleteObject: false };
  }
  if (hashUploadToken(token) !== grant.tokenHash || userId !== grant.userId || !pathOwnedBy(grant.path, userId)) {
    return { ok: false, error: "This upload link is not valid.", deleteObject: false };
  }
  if (!grant.openedAt) return { ok: false, error: "Upload the file before finishing.", deleteObject: false };
  if (grant.finalizedAt) return { ok: false, error: "This upload link was already used.", deleteObject: false };
  const spent = { ...grant, tokenHash: `spent:${grant.id}`, spentAt: new Date(nowMs).toISOString() };
  if (nowMs >= Date.parse(grant.expiresAt)) {
    return { ok: false, error: "This upload link has expired.", deleteObject: true, grant: spent };
  }
  if (bytes.byteLength <= 0) {
    return { ok: false, error: emptyFileMessage(grant.purpose), deleteObject: true, grant: spent };
  }
  if (bytes.byteLength > grant.maxBytes) {
    return { ok: false, error: oversizeMessage(grant.purpose), deleteObject: true, grant: spent };
  }
  const kind = sniffKind(bytes);
  if (!kind || !purposeAllows(grant.purpose, kind)) {
    return { ok: false, error: typeMessage(grant.purpose), deleteObject: true, grant: spent };
  }
  return {
    ok: true,
    kind,
    grant: { ...grant, finalizedAt: new Date(nowMs).toISOString() },
  };
}

export function grantIsSpent(grant: StoredGrant): boolean {
  return Boolean(grant.spentAt) || grant.tokenHash.startsWith("spent:");
}

/**
 * Spent and expired grants stay until SIGNED_UPLOAD_RETENTION_MS after they
 * were created. The signed URL can still PUT after a rejected finalize deletes
 * the object, so the row has to remain until that URL is dead. Each sweep
 * deletes the object. The row is removed only after the window.
 */
export function grantsAfterSweep(grants: StoredGrant[], nowMs: number): {
  keep: StoredGrant[];
  deleteObjects: StoredGrant[];
} {
  const deleteObjects: StoredGrant[] = [];
  const keep: StoredGrant[] = [];
  for (const grant of grants) {
    if (grant.finalizedAt) {
      keep.push(grant);
      continue;
    }
    const expired = Date.parse(grant.expiresAt) <= nowMs;
    if (!grantIsSpent(grant) && !expired) {
      keep.push(grant);
      continue;
    }
    deleteObjects.push(grant);
    if (nowMs < grantRetainUntil(grant)) keep.push(grant);
  }
  return { keep, deleteObjects };
}

/**
 * Rows inside the signed URL window always stay.
 * Rows past that window stay when a configured provider delete failed,
 * so the next pass can retry. They are removed after a successful delete,
 * or immediately when storage is not configured.
 */
export function retainAfterSweep(input: {
  grants: StoredGrant[];
  nowMs: number;
  deletedIds: ReadonlySet<string>;
  storageConfigured: boolean;
}): StoredGrant[] {
  const swept = grantsAfterSweep(input.grants, input.nowMs);
  const staying = new Set(swept.keep.map((grant) => grant.id));
  return input.grants.filter((grant) => {
    if (staying.has(grant.id)) return true;
    if (!input.storageConfigured) return false;
    return !input.deletedIds.has(grant.id);
  });
}

function grantRetainUntil(grant: StoredGrant): number {
  const created = Date.parse(grant.createdAt);
  if (Number.isFinite(created)) return created + SIGNED_UPLOAD_RETENTION_MS;
  const expires = Date.parse(grant.expiresAt);
  if (Number.isFinite(expires)) return expires + SIGNED_UPLOAD_RETENTION_MS;
  return 0;
}

const STAGE_HOUR_MS = 60 * 60 * 1000;

type StageApplication = {
  id: string;
  creatorId: string;
  briefId: string;
  status: string;
};

/** Shared gate for every action that stages an upload grant. */
export function ugcStageDecision(input: {
  userId: string;
  applicationId: string;
  applications: StageApplication[];
  grants: StoredGrant[];
  nowMs: number;
}): { ok: true; briefId: string } | { ok: false; error: string } {
  const application = input.applications.find((item) => item.id === input.applicationId);
  if (!application || application.creatorId !== input.userId || application.status !== "accepted") {
    return { ok: false, error: "Accept the brief before uploading." };
  }
  const hourly = hourlyUploadCapError(input.grants, input.userId, input.nowMs);
  if (hourly) return { ok: false, error: hourly };
  const briefIds = new Set(
    input.applications.filter((item) => item.briefId === application.briefId).map((item) => item.id),
  );
  const hourAgo = input.nowMs - STAGE_HOUR_MS;
  const onBrief = input.grants.filter((grant) => {
    if (grant.userId !== input.userId) return false;
    if (!(Date.parse(grant.createdAt) > hourAgo)) return false;
    return grant.targetId === application.briefId || (grant.targetId != null && briefIds.has(grant.targetId));
  });
  if (onBrief.length >= UPLOAD_GRANTS_PER_BRIEF_PER_HOUR) {
    return { ok: false, error: BRIEF_UPLOAD_RATE_LIMIT_ERROR };
  }
  return { ok: true, briefId: application.briefId };
}

/** Hourly cap for staging actions. The brief cap is applied by ugcStageDecision. */
export function hourlyUploadCapError(grants: StoredGrant[], userId: string, nowMs: number): string | null {
  const hourAgo = nowMs - STAGE_HOUR_MS;
  const recent = grants.filter((grant) => grant.userId === userId && Date.parse(grant.createdAt) > hourAgo);
  if (recent.length >= UPLOAD_GRANTS_PER_HOUR) return UPLOAD_RATE_LIMIT_ERROR;
  return null;
}

export function canReadObject(input: { requesterId: string; ownerIds: string[]; isAdmin: boolean }): boolean {
  if (input.isAdmin) return true;
  return input.ownerIds.includes(input.requesterId);
}

export function prepareRead(input: {
  requesterId: string;
  ownerIds: string[];
  isAdmin: boolean;
  bucket: StorageBucket;
}): { ok: true; expiresIn: number } | { ok: false; error: string } {
  if (!canReadObject(input)) return { ok: false, error: "Not found." };
  return { ok: true, expiresIn: readTtlSeconds(input.bucket) };
}

export function downloadHeaders(input: {
  contentType: string;
  filename: string;
  attachment: boolean;
  cacheSeconds?: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": input.contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": input.attachment ? "private, no-store" : `public, max-age=${input.cacheSeconds ?? 300}`,
  };
  if (input.attachment) {
    const safe = input.filename.replace(/[^A-Za-z0-9._-]+/g, "") || "document";
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  }
  return headers;
}

export type BucketSnapshot = {
  buckets: { id: string; public: boolean }[];
  policies: { roles: string[] }[];
};

/** Same rules as scripts/check-private-storage.sql. */
export function privateBucketProblems(snapshot: BucketSnapshot): string[] {
  const problems: string[] = [];
  for (const id of ["fweta-media", "fweta-kyc"]) {
    const bucket = snapshot.buckets.find((item) => item.id === id);
    if (!bucket) problems.push(`${id} is missing`);
    else if (bucket.public) problems.push(`${id} is public`);
  }
  const open = snapshot.policies.filter((policy) =>
    policy.roles.some((role) => role === "anon" || role === "authenticated" || role === "public"),
  );
  if (open.length > 0) problems.push("anon or authenticated can access storage.objects");
  return problems;
}
