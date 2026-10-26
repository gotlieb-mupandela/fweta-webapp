import type { PendingUploadDelete } from "@/lib/db/types";
import { readStore, updateStore } from "@/lib/db/store";
import {
  deliveryReferencedPaths,
  grantsAfterSweep,
  objectIsInUse,
  pathIsReferenced,
  rowsAfterSweepWrite,
  type StoredGrant,
} from "@/lib/storage/policy";
import { createSupabaseStorageDriver, isStorageConfigured, type StorageDriver } from "@/lib/storage/driver";

/**
 * Removes grant rows that are still unattached and not named by a delivery,
 * then deletes those objects. The store write commits before any provider delete.
 * A failed delete leaves the row removed and keeps a retry record for the next sweep.
 * The object path is never logged.
 */
export async function sweepUnfinalizedUploads(now = new Date(), driver?: StorageDriver): Promise<number> {
  const nowMs = now.getTime();
  const current = await readStore();
  const preview = grantsAfterSweep(current.uploadGrants ?? [], nowMs);
  if (preview.deleteObjects.length === 0 && !(current.pendingUploadDeletes?.length)) return 0;
  const storage = driver ?? (isStorageConfigured() ? createSupabaseStorageDriver() : null);
  let removedCount = 0;
  let scheduled: PendingUploadDelete[] = [];
  await updateStore((draft) => {
    const referencedPaths = deliveryReferencedPaths(draft.ugcDeliveries);
    const plan = rowsAfterSweepWrite({
      grants: draft.uploadGrants ?? [],
      deliveries: draft.ugcDeliveries,
      nowMs,
    });
    draft.uploadGrants = plan.grants;
    removedCount = plan.removed.length;
    const queued = new Map<string, PendingUploadDelete>();
    for (const grant of plan.removed) {
      if (objectIsInUse(grant, referencedPaths)) continue;
      queued.set(grant.path, { id: grant.id, bucket: grant.bucket, path: grant.path });
    }
    for (const item of draft.pendingUploadDeletes ?? []) {
      if (pathStillInUse(item.path, referencedPaths, plan.grants)) continue;
      queued.set(item.path, item);
    }
    scheduled = storage ? [...queued.values()] : [];
    draft.pendingUploadDeletes = scheduled;
  });
  if (!storage || scheduled.length === 0) return removedCount;
  const deletedPaths = new Set<string>();
  const sparedPaths = new Set<string>();
  for (const item of scheduled) {
    if (await deliveryNamedSinceWrite(item.path)) {
      sparedPaths.add(item.path);
      continue;
    }
    try {
      await storage.deleteObject(item.bucket, item.path);
      deletedPaths.add(item.path);
    } catch {
      console.warn(`[fweta] upload sweep could not delete an object in ${item.bucket}`);
    }
  }
  if (deletedPaths.size === 0 && sparedPaths.size === 0) return removedCount;
  await updateStore((draft) => {
    const referencedPaths = deliveryReferencedPaths(draft.ugcDeliveries);
    draft.pendingUploadDeletes = (draft.pendingUploadDeletes ?? []).filter((item) => {
      if (sparedPaths.has(item.path)) return false;
      if (pathStillInUse(item.path, referencedPaths, draft.uploadGrants ?? [])) return false;
      return !deletedPaths.has(item.path);
    });
  });
  return removedCount;
}

function pathStillInUse(path: string, referencedPaths: ReadonlySet<string>, grants: readonly StoredGrant[]): boolean {
  if (pathIsReferenced(path, referencedPaths)) return true;
  return grants.some((grant) => grant.path === path && Boolean(grant.attachedAt));
}

/** The committed store is the one the write just saved. Skip a path a delivery now names. */
async function deliveryNamedSinceWrite(path: string): Promise<boolean> {
  const latest = await readStore();
  const referencedPaths = deliveryReferencedPaths(latest.ugcDeliveries);
  return pathStillInUse(path, referencedPaths, latest.uploadGrants ?? []);
}
