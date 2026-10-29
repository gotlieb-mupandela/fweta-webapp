/**
 * Apply one mutation to the latest store document and save it with
 * compare-and-swap. Callers reload on conflict and run the mutator again.
 * A warm in-memory copy must not be passed in as the base document.
 */

export class StoreConflictError extends Error {
  constructor(message = "Store changed in another instance. Reload and try again.") {
    super(message);
    this.name = "StoreConflictError";
  }
}

export type LoadedDocument<T> = {
  store: T;
  /** null only when the document row does not exist yet. */
  revision: number | null;
};

export type CasResult =
  | { ok: true; revision: number }
  | { ok: false; conflict: true };

/** Accept a JSON number or a bigint string. Refuse anything that is not a safe integer. */
export function parseStoreRevision(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) return null;
    return parsed;
  }
  return null;
}

const DEFAULT_ATTEMPTS = 8;

export type CommitOutcome<T> = {
  value: T;
  /** Null only when the row still does not exist and nothing was written. */
  revision: number | null;
  wrote: boolean;
};

function jsonSnapshot(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function commitLoadedMutation<T>(args: {
  load: () => Promise<LoadedDocument<T>>;
  save: (store: T, expectedRevision: number | null) => Promise<CasResult>;
  mutate: (store: T) => void | Promise<void>;
  clone: (store: T) => T;
  beforeSave?: (draft: T, base: T) => void;
  maxAttempts?: number;
}): Promise<CommitOutcome<T>> {
  const maxAttempts = args.maxAttempts ?? DEFAULT_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const loaded = await args.load();
    const draft = args.clone(loaded.store);
    // A repair that rechecks on the fresh document often changes nothing.
    // Writing the whole JSON anyway bumps traffic and collides with real saves.
    const before = jsonSnapshot(draft);
    await args.mutate(draft);
    args.beforeSave?.(draft, loaded.store);
    const after = jsonSnapshot(draft);
    if (before !== null && before === after) {
      return { value: draft, revision: loaded.revision, wrote: false };
    }
    const saved = await args.save(draft, loaded.revision);
    if (saved.ok) return { value: draft, revision: saved.revision, wrote: true };
  }
  throw new StoreConflictError();
}
