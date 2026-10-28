import type { StoredGrant } from "@/lib/storage/policy";

/**
 * Reserves grant rows first, then writes objects.
 * A blocked reserve never calls writeObject.
 * A failed write marks that grant spent so the sweep can remove any bytes that landed.
 */
export async function writeReservedGrants(input: {
  reserve: () => Promise<{ ok: true; grants: StoredGrant[] } | { ok: false; error: string }>;
  writeObject: (grant: StoredGrant) => Promise<void>;
  markSpent: (grant: StoredGrant) => Promise<void>;
}): Promise<{ ok: true; grants: StoredGrant[] } | { ok: false; error: string }> {
  const reserved = await input.reserve();
  if (!reserved.ok) return reserved;
  for (const grant of reserved.grants) {
    try {
      await input.writeObject(grant);
    } catch (error) {
      await input.markSpent(grant);
      return { ok: false, error: error instanceof Error ? error.message : "Upload failed" };
    }
  }
  return { ok: true, grants: reserved.grants };
}
