import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import {
  type AllowedKind,
  type UploadPurpose,
  contentTypeForKind,
  extensionForKind,
  friendlyStorageError,
} from "@/lib/storage/constants";
import { createSupabaseStorageDriver, isStorageConfigured, type StorageDriver } from "@/lib/storage/driver";
import { isFlatLocalName, isSafeStoragePath, serverObjectPath } from "@/lib/storage/policy";
import { contentTypeForBytes } from "@/lib/storage/sniff";

function localDir(purpose: Exclude<UploadPurpose, "avatar">): string {
  if (purpose === "screenshot") return path.join(process.cwd(), "data", "view-screenshots");
  if (purpose === "kyc") return path.join(process.cwd(), "data", "kyc");
  return path.join(process.cwd(), "data", "ugc");
}

export async function putCheckedObject(input: {
  userId: string;
  purpose: Exclude<UploadPurpose, "avatar">;
  bytes: Uint8Array;
  kind: AllowedKind;
  driver?: StorageDriver;
}): Promise<string> {
  const driver = input.driver ?? (isStorageConfigured() ? createSupabaseStorageDriver() : null);
  const id = randomUUID();
  if (!driver) {
    const name = `${id}.${extensionForKind(input.kind)}`;
    const dir = localDir(input.purpose);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(/*turbopackIgnore: true*/ dir, name), input.bytes);
    return name;
  }
  const objectPath = serverObjectPath(input.userId, input.purpose, id, extensionForKind(input.kind));
  try {
    await driver.uploadObject({
      bucket: input.purpose === "kyc" ? "fweta-kyc" : "fweta-media",
      path: objectPath,
      body: input.bytes,
      contentType: contentTypeForKind(input.kind),
    });
  } catch (error) {
    throw new Error(friendlyStorageError(error instanceof Error ? error.message : "Upload failed"));
  }
  return objectPath;
}

export async function readCheckedObject(
  purpose: Exclude<UploadPurpose, "avatar">,
  name: string,
  driver?: StorageDriver,
): Promise<Uint8Array | null> {
  if (isSafeStoragePath(name)) {
    const storage = driver ?? (isStorageConfigured() ? createSupabaseStorageDriver() : null);
    if (!storage) return null;
    try {
      return await storage.downloadObject(purpose === "kyc" ? "fweta-kyc" : "fweta-media", name);
    } catch {
      return null;
    }
  }
  if (!isFlatLocalName(name)) return null;
  const root = path.resolve(localDir(purpose));
  const full = path.resolve(/*turbopackIgnore: true*/ localDir(purpose), name);
  if (!full.startsWith(`${root}${path.sep}`)) return null;
  try {
    return new Uint8Array(await readFile(/*turbopackIgnore: true*/ full));
  } catch {
    return null;
  }
}

export function sniffedType(bytes: Uint8Array): string | null {
  return contentTypeForBytes(bytes);
}
