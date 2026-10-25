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

/** The save did not finish before the overall deadline. */
export class StoreDeadlineError extends Error {
  constructor(message = "Saving took too long. Try again.") {
    super(message);
    this.name = "StoreDeadlineError";
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
export const STORE_COMMIT_DEADLINE_MS = 20_000;

/**
 * Wait between conflict retries so a burst of instances does not stampede.
 * `attempt` is the 1-based index of the try that just conflicted.
 * The delay is half to all of an exponential cap (100ms, 200ms, ... 1600ms).
 */
export function conflictBackoffMs(attempt: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempt - 1);
  const capped = Math.min(1_600, 100 * 2 ** exponent);
  const low = Math.floor(capped / 2);
  const span = capped - low;
  const roll = Math.min(1, Math.max(0, random()));
  return low + Math.floor(roll * (span + 1));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function commitLoadedMutation<T>(args: {
  load: () => Promise<LoadedDocument<T>>;
  save: (store: T, expectedRevision: number | null) => Promise<CasResult>;
  mutate: (store: T) => void | Promise<void>;
  clone: (store: T) => T;
  beforeSave?: (draft: T, base: T) => void;
  maxAttempts?: number;
  deadlineMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}): Promise<T> {
  const maxAttempts = args.maxAttempts ?? DEFAULT_ATTEMPTS;
  const deadlineMs = args.deadlineMs ?? STORE_COMMIT_DEADLINE_MS;
  const now = args.now ?? Date.now;
  const sleep = args.sleep ?? delay;
  const random = args.random ?? Math.random;
  const started = now();
  let expired = false;

  let rejectDeadline: (error: StoreDeadlineError) => void = () => {};
  const deadlinePromise = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  // Attached immediately so a late timer cannot become an unhandled rejection.
  void deadlinePromise.catch(() => undefined);
  const timer = setTimeout(() => {
    expired = true;
    rejectDeadline(new StoreDeadlineError());
  }, deadlineMs);

  const work = (async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (expired || now() - started >= deadlineMs) {
        throw new StoreDeadlineError();
      }
      const loaded = await args.load();
      if (expired || now() - started >= deadlineMs) {
        throw new StoreDeadlineError();
      }
      const draft = args.clone(loaded.store);
      await args.mutate(draft);
      args.beforeSave?.(draft, loaded.store);
      const saved = await args.save(draft, loaded.revision);
      if (saved.ok) return draft;
      if (attempt === maxAttempts) break;
      const budget = deadlineMs - (now() - started);
      if (budget <= 0 || expired) throw new StoreDeadlineError();
      const wait = Math.min(conflictBackoffMs(attempt, random), budget);
      if (wait <= 0) throw new StoreDeadlineError();
      await sleep(wait);
    }
    throw new StoreConflictError();
  })();

  try {
    return await Promise.race([work, deadlinePromise]);
  } finally {
    clearTimeout(timer);
    void work.catch(() => undefined);
  }
}
