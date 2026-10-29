import { randomUUID } from "crypto";

import { imageKindForUpload, type ImageKind } from "@/lib/kyc/magic";
import { getKycObject, putKycObject } from "@/lib/storage/kyc";
import { ID_PHOTO_MAX_BYTES, isAllowedImageType, uploadLimitMessage } from "@/lib/uploads/limits";

const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/i;
const USER_ID = /^[0-9a-zA-Z-]{8,80}$/;

const TYPES: Record<string, ImageKind> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type KycTestStore = {
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  get: (key: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>;
};

let testStore: KycTestStore | null = null;

/** Unit tests only. Production ignores this and uses the private bucket. */
export function useKycStoreForTests(store: KycTestStore | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test storage is not available in production.");
  }
  testStore = store;
}

export function kycFileNameOk(name: string): boolean {
  return NAME.test(name);
}

export function kycContentType(name: string): string | null {
  if (!kycFileNameOk(name)) return null;
  if (name.toLowerCase().endsWith(".png")) return "image/png";
  if (name.toLowerCase().endsWith(".webp")) return "image/webp";
  if (name.toLowerCase().endsWith(".jpg")) return "image/jpeg";
  return null;
}

export function kycObjectKey(userId: string, name: string): string | null {
  if (!USER_ID.test(userId) || !kycFileNameOk(name)) return null;
  return `${userId}/${name}`;
}

/** Owner or admin. Everyone else is denied, including a missing session. */
export function canViewKycDocument(
  session: { id: string; roles: readonly string[] } | null,
  ownerId: string,
): boolean {
  if (!session) return false;
  if (session.roles.includes("admin")) return true;
  return session.id === ownerId;
}

export async function saveKycDocument(userId: string, file: File): Promise<string> {
  if (!USER_ID.test(userId)) throw new Error("Could not store the ID photo.");
  if (file.size <= 0) throw new Error("That ID photo is empty.");
  const tooBig = uploadLimitMessage(file, ID_PHOTO_MAX_BYTES, "ID photo");
  if (tooBig) throw new Error(tooBig);
  if (!TYPES[file.type] || !isAllowedImageType(file.type)) {
    throw new Error("Use a PNG, JPG, or WebP photo of the ID.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = imageKindForUpload(file.type, Buffer.from(bytes));
  if (!ext) throw new Error("That file is not a PNG, JPG, or WebP photo.");
  const name = `${randomUUID()}.${ext}`;
  const key = kycObjectKey(userId, name);
  if (!key) throw new Error("Could not store the ID photo.");
  const contentType = file.type;
  if (testStore) {
    await testStore.put(key, bytes, contentType);
  } else {
    await putKycObject(key, bytes, contentType);
  }
  return name;
}

export async function readKycDocument(
  userId: string,
  name: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const key = kycObjectKey(userId, name);
  const contentType = kycContentType(name);
  if (!key || !contentType) return null;
  if (testStore) {
    const found = await testStore.get(key);
    if (!found) return null;
    return { bytes: found.bytes, contentType };
  }
  const bytes = await getKycObject(key);
  if (!bytes) return null;
  return { bytes, contentType };
}
