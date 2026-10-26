import { readStore, updateStore } from "@/lib/db/store";
import { deliveryReferencedPaths, grantsAfterSweep, objectIsInUse, retainAfterSweep } from "@/lib/storage/policy";
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
  if (grantsAfterSweep(current.uploadGrants ?? [], nowMs).deleteObjects.length === 0) return 0;
  const storage = driver ?? (isStorageConfigured() ? createSupabaseStorageDriver() : null);
  let removed = 0;
  await updateStore(async (draft) => {
    // Recheck on the store being written, including deliveries saved at the 24h mark.
    const referencedPaths = deliveryReferencedPaths(draft.ugcDeliveries);
    const swept = grantsAfterSweep(draft.uploadGrants ?? [], nowMs, referencedPaths);
    const deleted = new Set<string>();
    if (storage) {
      for (const grant of swept.deleteObjects) {
        if (objectIsInUse(grant, referencedPaths)) continue;
        try {
          await storage.deleteObject(grant.bucket, grant.path);
          deleted.add(grant.id);
        } catch {
          console.warn(`[fweta] upload sweep could not delete an object in ${grant.bucket}`);
        }
      }
    }
    const before = draft.uploadGrants ?? [];
    draft.uploadGrants = retainAfterSweep({
      grants: before,
      nowMs,
      deletedIds: deleted,
      storageConfigured: Boolean(storage),
      referencedPaths,
    });
    removed = before.length - draft.uploadGrants.length;
  });
  return removed;
}
