import { createHash, randomBytes } from "crypto";

import {
  type AllowedKind,
  type StorageBucket,
  type UploadPurpose,
  UPLOAD_TTL_MS,
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
  if (grant.tokenHash.startsWith("spent:")) {
    return { ok: false, error: "This upload link was already used.", deleteObject: false };
  }
  if (hashUploadToken(token) !== grant.tokenHash || userId !== grant.userId || !pathOwnedBy(grant.path, userId)) {
    return { ok: false, error: "This upload link is not valid.", deleteObject: false };
  }
  if (!grant.openedAt) return { ok: false, error: "Upload the file before finishing.", deleteObject: false };
  if (grant.finalizedAt) return { ok: false, error: "This upload link was already used.", deleteObject: false };
  const spent = { ...grant, tokenHash: `spent:${grant.id}` };
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

export function grantsAfterSweep(grants: StoredGrant[], nowMs: number): { keep: StoredGrant[]; remove: StoredGrant[] } {
  const remove: StoredGrant[] = [];
  const keep: StoredGrant[] = [];
  for (const grant of grants) {
    if (!grant.finalizedAt && Date.parse(grant.expiresAt) <= nowMs) remove.push(grant);
    else keep.push(grant);
  }
  return { keep, remove };
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
