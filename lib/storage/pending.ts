import { readStore, updateStore } from "@/lib/db/store";
import { grantsAfterSweep, retainAfterSweep } from "@/lib/storage/policy";
import { createSupabaseStorageDriver, isStorageConfigured, type StorageDriver } from "@/lib/storage/driver";

/**
 * Deletes objects for spent, expired, and unattached staged grants.
 * The grant row stays until its retention window ends, and it also stays when
 * the provider delete fails, so a later pass can retry.
 * The object path is never logged.
 */
export async function sweepUnfinalizedUploads(now = new Date(), driver?: StorageDriver): Promise<number> {
  const nowMs = now.getTime();
  const current = await readStore();
  const swept = grantsAfterSweep(current.uploadGrants ?? [], nowMs);
  if (swept.deleteObjects.length === 0) return 0;
  const storage = driver ?? (isStorageConfigured() ? createSupabaseStorageDriver() : null);
  const deleted = new Set<string>();
  if (storage) {
    for (const grant of swept.deleteObjects) {
      try {
        await storage.deleteObject(grant.bucket, grant.path);
        deleted.add(grant.id);
      } catch {
        console.warn(`[fweta] upload sweep could not delete an object in ${grant.bucket}`);
      }
    }
  }
  await updateStore((draft) => {
    draft.uploadGrants = retainAfterSweep({
      grants: draft.uploadGrants ?? [],
      nowMs,
      deletedIds: deleted,
      storageConfigured: Boolean(storage),
    });
  });
  return swept.deleteObjects.length;
}
