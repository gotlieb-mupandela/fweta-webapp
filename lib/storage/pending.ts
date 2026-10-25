import { updateStore } from "@/lib/db/store";
import type { StoredGrant } from "@/lib/storage/policy";
import { grantsAfterSweep } from "@/lib/storage/policy";
import { createSupabaseStorageDriver, isStorageConfigured, type StorageDriver } from "@/lib/storage/driver";

/**
 * Deletes objects whose upload link expired before finalize.
 * Hook from runHousekeepingJob:
 *   const uploadsRemoved = await sweepUnfinalizedUploads(now);
 * lib/jobs/housekeeping.ts is left unchanged because another PR edits it.
 */
export async function sweepUnfinalizedUploads(now = new Date(), driver?: StorageDriver): Promise<number> {
  let remove: StoredGrant[] = [];
  await updateStore((draft) => {
    const swept = grantsAfterSweep(draft.uploadGrants ?? [], now.getTime());
    draft.uploadGrants = swept.keep;
    remove = swept.remove;
  });
  if (remove.length === 0) return 0;
  const storage = driver ?? (isStorageConfigured() ? createSupabaseStorageDriver() : null);
  if (storage) {
    for (const grant of remove) {
      try {
        await storage.deleteObject(grant.bucket, grant.path);
      } catch {
        // The grant row is already gone. A later pass cannot see it.
        // The provider delete is best effort so one failure does not stop the rest.
      }
    }
  }
  return remove.length;
}
