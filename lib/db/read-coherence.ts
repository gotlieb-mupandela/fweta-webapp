/**
 * Per-process read cache for one shared document.
 *
 * A Vercel function instance keeps this object in memory. Another instance
 * can commit a newer revision. A read must reload when the revision it just
 * observed does not match this copy. Returning the copy whenever it is set
 * is what made dashboards alternate between saved and empty data.
 */

export type CoherentCache<T> = {
  value?: T;
  revision?: number;
  generation: number;
  pending?: Promise<T | null> | null;
  pendingGeneration?: number;
};

export type VersionedValue<T> = {
  value: T;
  revision: number;
};

export type CoherentIo<T> = {
  /** Null means the revision check failed or the row is not there yet. */
  readRevision: () => Promise<number | null>;
  /** Null means the document read failed, or the row has no revision. */
  load: () => Promise<VersionedValue<T> | null>;
};

export function createCoherentCache<T>(): CoherentCache<T> {
  return { generation: 0 };
}

/** Record a commit from this process. Never moves the cached revision backwards. */
export function rememberCommit<T>(cache: CoherentCache<T>, value: T, revision: number): void {
  if (cache.revision !== undefined && revision < cache.revision) return;
  cache.value = value;
  cache.revision = revision;
  cache.generation += 1;
  cache.pending = null;
}

export function forgetCache<T>(cache: CoherentCache<T>): void {
  cache.value = undefined;
  cache.revision = undefined;
  cache.generation += 1;
  cache.pending = null;
}

/**
 * The historical read: whatever this process loaded first, until it dies.
 * Tests use this to show the stale campaign, login, and profile symptoms.
 * Production reads go through `readCoherent`.
 */
export function readPinned<T>(cache: CoherentCache<T>): T | null {
  return cache.value ?? null;
}

export async function readCoherent<T>(cache: CoherentCache<T>, io: CoherentIo<T>): Promise<T | null> {
  if (cache.pending && cache.pendingGeneration === cache.generation) {
    return cache.pending;
  }

  const generation = cache.generation;
  const pending = loadCoherent(cache, io, generation);
  cache.pending = pending;
  cache.pendingGeneration = generation;
  try {
    return await pending;
  } finally {
    if (cache.pending === pending) cache.pending = null;
  }
}

async function loadCoherent<T>(
  cache: CoherentCache<T>,
  io: CoherentIo<T>,
  generation: number,
): Promise<T | null> {
  const observed = await io.readRevision();
  const revisionMatches =
    observed !== null && cache.value !== undefined && cache.revision === observed;
  // A commit in this process bumps generation. Do not answer a read that
  // started earlier with the pre-commit snapshot once the revision moved.
  if (revisionMatches && cache.generation === generation) {
    return cache.value ?? null;
  }

  const loaded = await io.load();
  if (!loaded) {
    // The document read failed. Serve the last copy for this request only.
    // Leave its revision unchanged so the next read tries the database again
    // instead of treating that copy as the revision we just observed.
    return cache.value ?? null;
  }

  // A slow load must not overwrite a newer commit that landed while it ran.
  if (cache.revision !== undefined && loaded.revision < cache.revision) {
    return cache.value ?? null;
  }

  cache.value = loaded.value;
  cache.revision = loaded.revision;
  return loaded.value;
}
