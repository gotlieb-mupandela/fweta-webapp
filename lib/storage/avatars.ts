import { randomUUID } from "crypto";

import {
  contentTypeForKind,
  extensionForKind,
  friendlyStorageError,
  STORAGE_NOT_READY_ERROR,
} from "@/lib/storage/constants";
import { createSupabaseStorageDriver, isStorageConfigured, type StorageDriver } from "@/lib/storage/driver";
import { inspectFile } from "@/lib/storage/inspect";
import { serverObjectPath } from "@/lib/storage/policy";

/**
 * Profile photos go to the private fweta-media bucket.
 * The stored URL is an app route, never a public storage URL.
 */
export async function uploadAvatarFile(opts: {
  userId: string;
  file: File;
  kind: "profile" | "influencer";
  driver?: StorageDriver;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let checked: Awaited<ReturnType<typeof inspectFile>>;
  try {
    checked = await inspectFile(opts.file, "avatar");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Use a JPEG, PNG, or WebP image.";
    if (/bucket not found/i.test(message) || /\bbucket\b/i.test(message)) {
      return { ok: false, error: STORAGE_NOT_READY_ERROR };
    }
    return { ok: false, error: message };
  }

  const driver = opts.driver ?? (isStorageConfigured() ? createSupabaseStorageDriver() : null);
  if (!driver) return { ok: false, error: STORAGE_NOT_READY_ERROR };

  let path: string;
  try {
    path = serverObjectPath(opts.userId, "avatar", randomUUID(), extensionForKind(checked.kind));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : STORAGE_NOT_READY_ERROR };
  }

  try {
    await driver.uploadObject({
      bucket: "fweta-media",
      path,
      body: checked.bytes,
      contentType: contentTypeForKind(checked.kind),
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Upload failed";
    return { ok: false, error: friendlyStorageError(raw) };
  }

  // kind is kept so a later profile photo does not collide with the influencer photo name.
  void opts.kind;
  return { ok: true, url: `/api/avatars/${path}` };
}

export { isStorageConfigured as isAvatarStorageConfigured };
