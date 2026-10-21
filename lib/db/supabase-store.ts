import { createClient } from "@supabase/supabase-js";

import { hydrateStoreCampaigns } from "@/lib/rewards/content-rewards";

import {
  commitLoadedMutation,
  parseStoreRevision,
  StoreConflictError,
  type CasResult,
} from "./store-commit";
import type { DatabaseStore } from "./types";

const STORE_ROW_ID = "default";

export class StorePersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorePersistError";
  }
}

type LoadResult =
  | { ok: true; store: DatabaseStore; revision: number | null; versioned: boolean }
  | { ok: false; error: string };

const emptyStore = (): DatabaseStore => ({
  profiles: [],
  campaigns: [],
  submissions: [],
  viewSnapshots: [],
  wallets: [],
  ledgerEntries: [],
  payoutMethods: [],
  withdrawalRequests: [],
  influencerProfiles: [],
  rateCards: [],
  bookings: [],
  brandDeposits: [],
  fraudFlags: [],
  notifications: [],
  notificationDispatches: [],
  linkedAccounts: [],
  socialAccounts: [],
  workspaces: [],
  workspaceMembers: [],
  savedCampaigns: [],
  supportTickets: [],
  supportMessages: [],
  auditLog: [],
  prizeAwards: [],
  platformSettings: [],
  ugcBriefs: [],
  ugcApplications: [],
  ugcDeliveries: [],
  contentLicenses: [],
  licenseDisputes: [],
  creatorPortfolios: [],
  businessListings: [],
  creatorReviews: [],
});

function supabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}

/** Prefer the Vercel Supabase integration secret, then the explicit service role key. */
function supabaseServiceKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
}

export function isSupabaseStoreEnabled(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

function createServiceClient() {
  const url = supabaseUrl()!;
  const key = supabaseServiceKey()!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function normalizeStore(raw: unknown): DatabaseStore | null {
  if (!raw || typeof raw !== "object") return null;
  const base = emptyStore();
  const input = raw as Record<string, unknown>;
  const store = { ...base, ...input } as DatabaseStore;

  // Supabase JSON may contain null arrays. Coerce them so .filter/.map never throw.
  (Object.keys(base) as (keyof DatabaseStore)[]).forEach((key) => {
    if (!Array.isArray(store[key])) {
      (store as Record<string, unknown>)[key] = [];
    }
  });

  return hydrateStoreCampaigns(store);
}

function hasData(store: DatabaseStore): boolean {
  return (
    store.profiles.length > 0 ||
    store.campaigns.length > 0 ||
    store.submissions.length > 0
  );
}

function isStoreConflict(error: { message?: string; code?: string }): boolean {
  if (error.code === "40001") return true;
  return (error.message ?? "").includes("fweta_store_conflict");
}

function cloneStore(store: DatabaseStore): DatabaseStore {
  return hydrateStoreCampaigns(structuredClone(store));
}

async function loadJsonBlob(): Promise<LoadResult> {
  try {
    const supabase = createServiceClient();
    const withRevision = await supabase
      .from("fweta_app_store")
      .select("data, revision")
      .eq("id", STORE_ROW_ID)
      .maybeSingle();

    if (withRevision.error && /revision/i.test(withRevision.error.message)) {
      // Column is not installed yet. Reads can still use the document.
      // Writes must fail closed. A blind upsert is what dropped live accounts.
      const fallback = await supabase
        .from("fweta_app_store")
        .select("data")
        .eq("id", STORE_ROW_ID)
        .maybeSingle();
      if (fallback.error) return { ok: false, error: fallback.error.message };
      if (!fallback.data?.data) {
        return { ok: true, store: emptyStore(), revision: null, versioned: false };
      }
      const store = normalizeStore(fallback.data.data);
      if (!store) return { ok: false, error: "fweta_app_store row was not a store document" };
      return { ok: true, store, revision: null, versioned: false };
    }

    if (withRevision.error) return { ok: false, error: withRevision.error.message };
    // No row yet. revision null tells the compare-and-swap to insert.
    if (!withRevision.data) {
      return { ok: true, store: emptyStore(), revision: null, versioned: true };
    }
    const revision = parseStoreRevision(withRevision.data.revision);
    if (revision === null) {
      return { ok: false, error: "fweta_app_store.revision was not a safe integer" };
    }
    if (!withRevision.data.data) {
      return { ok: true, store: emptyStore(), revision, versioned: true };
    }
    const store = normalizeStore(withRevision.data.data);
    if (!store) return { ok: false, error: "fweta_app_store row was not a store document" };
    return { ok: true, store, revision, versioned: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "JSON blob load failed" };
  }
}

async function compareAndSwap(store: DatabaseStore, expectedRevision: number | null): Promise<CasResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("fweta_cas_save_store", {
    payload: store,
    expected_revision: expectedRevision,
  });
  if (error) {
    if (isStoreConflict(error)) return { ok: false, conflict: true };
    if (
      error.code === "PGRST202" ||
      (error.message ?? "").includes("Could not find the function")
    ) {
      throw new StorePersistError(
        "Refusing to save the store without fweta_cas_save_store. Apply the store revision migration before writing.",
      );
    }
    throw new StorePersistError(error.message);
  }
  const revision = parseStoreRevision(data);
  if (revision === null) {
    throw new StorePersistError("fweta_cas_save_store did not return a revision.");
  }
  return { ok: true, revision };
}

async function loadRelationalStore(): Promise<DatabaseStore | null> {
  try {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("fweta_load_store");

  if (error) {
    if (!error.message.includes("Could not find the function")) {
      console.warn("[fweta] Relational load failed:", error.message);
    }
    return null;
  }

  return normalizeStore(data);
  } catch (err) {
    console.warn("[fweta] Relational load failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function saveRelationalStore(store: DatabaseStore): Promise<boolean> {
  try {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("fweta_save_store", { payload: store });

  if (error) {
    if (!error.message.includes("Could not find the function")) {
      console.warn("[fweta] Relational save failed:", error.message);
    }
    return false;
  }
  return true;
  } catch (err) {
    console.warn("[fweta] Relational save failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function loadStoreFromSupabase(): Promise<DatabaseStore | null> {
  try {
    const relational = await loadRelationalStore();
    const jsonBlob = await loadJsonBlob();
    if (!jsonBlob.ok && !relational) {
      console.warn("[fweta] Supabase store load failed:", jsonBlob.error);
      return null;
    }

    const sync = process.env.FWETA_RELATIONAL_SYNC === "true";

    // The JSON document is the source of truth. A relational snapshot can be
    // stale and hide accounts that signed up after the last SQL mirror.
    if (!sync && jsonBlob.ok && hasData(jsonBlob.store)) return jsonBlob.store;

    if (sync && relational && hasData(relational)) {
      // Older relational SQL omitted the inbox, accounts, and workspaces.
      // Copy those from the JSON document only when the tables came back empty.
      if (jsonBlob.ok) {
        const fill = <K extends keyof DatabaseStore>(key: K) => {
          const fromSql = relational[key];
          const fromJson = jsonBlob.store[key];
          if (Array.isArray(fromSql) && fromSql.length === 0 && Array.isArray(fromJson) && fromJson.length > 0) {
            relational[key] = fromJson;
          }
        };
        fill("notifications");
        fill("notificationDispatches");
        fill("linkedAccounts");
        fill("socialAccounts");
        fill("workspaces");
        fill("workspaceMembers");
        fill("savedCampaigns");
        fill("supportTickets");
        fill("supportMessages");
        fill("auditLog");
        fill("prizeAwards");
        fill("platformSettings");
        fill("ugcBriefs");
        fill("ugcApplications");
        fill("ugcDeliveries");
        fill("contentLicenses");
        fill("licenseDisputes");
        fill("creatorPortfolios");
        fill("businessListings");
        fill("creatorReviews");
      }
      return relational;
    }

    if (jsonBlob.ok && hasData(jsonBlob.store)) {
      if (sync) await saveRelationalStore(jsonBlob.store).catch(() => undefined);
      return jsonBlob.store;
    }

    if (jsonBlob.ok) return jsonBlob.store;
    return relational;
  } catch (err) {
    console.warn("[fweta] loadStoreFromSupabase failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type SupabaseStoreDiagnostics = {
  jsonBlobLoadOk: boolean;
  jsonBlobLoadError: string | null;
  jsonBlobSaveOk: boolean;
  jsonBlobSaveError: string | null;
  relationalLoadOk: boolean;
  relationalLoadError: string | null;
  profileCount: number;
};

/**
 * Production health check. Read-only unless `probe` is set. The probe calls
 * compare-and-swap with a revision the row cannot have, so it must not write.
 */
export async function diagnoseSupabaseStore(options?: {
  probe?: boolean;
}): Promise<SupabaseStoreDiagnostics> {
  const result: SupabaseStoreDiagnostics = {
    jsonBlobLoadOk: false,
    jsonBlobLoadError: null,
    jsonBlobSaveOk: false,
    jsonBlobSaveError: null,
    relationalLoadOk: false,
    relationalLoadError: null,
    profileCount: 0,
  };

  if (!isSupabaseStoreEnabled()) return result;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("fweta_app_store")
      .select("data")
      .eq("id", STORE_ROW_ID)
      .maybeSingle();

    if (error) {
      result.jsonBlobLoadError = error.message;
    } else {
      result.jsonBlobLoadOk = true;
      const store = normalizeStore(data?.data) ?? emptyStore();
      result.profileCount = store.profiles.length;
    }
  } catch (e) {
    result.jsonBlobLoadError = e instanceof Error ? e.message : "load threw";
  }

  if (!options?.probe) {
    result.jsonBlobSaveOk = false;
    result.jsonBlobSaveError = "not probed";
  } else {
    try {
      const supabase = createServiceClient();
      // A revision the row cannot have. The RPC must reject it and must not write.
      const { error } = await supabase.rpc("fweta_cas_save_store", {
        payload: { profiles: [] },
        expected_revision: -1,
      });
      if (!error) {
        result.jsonBlobSaveError = "compare-and-swap accepted a revision the row does not have";
      } else if (isStoreConflict(error)) {
        result.jsonBlobSaveOk = true;
      } else {
        result.jsonBlobSaveError = error.message;
      }
    } catch (e) {
      result.jsonBlobSaveError = e instanceof Error ? e.message : "save threw";
    }
  }

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("fweta_load_store");
    if (error) {
      if (error.message.includes("Could not find the function")) {
        result.relationalLoadError = "fweta_load_store not installed (optional)";
      } else {
        result.relationalLoadError = error.message;
      }
    } else {
      result.relationalLoadOk = true;
    }
  } catch (e) {
    result.relationalLoadError = e instanceof Error ? e.message : "rpc threw";
  }

  return result;
}

/**
 * Reload the JSON document, run `mutator` on that copy, and compare-and-swap.
 * On conflict, load again and run the mutator again. The in-memory read cache
 * is not an input. A direct SQL edit bumps revision, so it is part of the next
 * load and is not overwritten by a stale copy.
 */
export async function commitStoreToSupabase(
  mutator: (store: DatabaseStore) => void | Promise<void>,
): Promise<DatabaseStore> {
  let saved: DatabaseStore;
  try {
    saved = await commitLoadedMutation({
      load: async () => {
        const loaded = await loadJsonBlob();
        if (!loaded.ok) throw new StorePersistError(loaded.error);
        if (!loaded.versioned) {
          throw new StorePersistError(
            "Refusing to save the store without a revision check. Apply the store revision migration before writing.",
          );
        }
        return { store: loaded.store, revision: loaded.revision };
      },
      clone: cloneStore,
      mutate: mutator,
      beforeSave: (draft, base) => {
        if (draft.profiles.length === 0 && base.profiles.length > 0) {
          throw new StorePersistError(
            "Refusing to replace a populated store with an empty profile list.",
          );
        }
      },
      save: compareAndSwap,
    });
  } catch (err) {
    if (err instanceof StoreConflictError) {
      throw new StorePersistError(err.message);
    }
    throw err;
  }

  // JSON is the source of truth. The relational replace stays opt-in and only
  // mirrors a document that compare-and-swap already accepted.
  if (process.env.FWETA_RELATIONAL_SYNC === "true") {
    await saveRelationalStore(saved);
  }
  return saved;
}
