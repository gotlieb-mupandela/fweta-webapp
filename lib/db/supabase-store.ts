import { createClient } from "@supabase/supabase-js";

import { hydrateStoreCampaigns } from "@/lib/rewards/content-rewards";

import type { DatabaseStore } from "./types";

const STORE_ROW_ID = "default";

export class StorePersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorePersistError";
  }
}

declare global {
  var __fwetaBlobRevision: number | undefined;
}

type LoadResult =
  | { ok: true; store: DatabaseStore; revision: number | null }
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

/** Prefer Vercel–Supabase integration secret, then explicit service role. */
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

  // Supabase JSON may contain null arrays — coerce so .filter/.map never throw.
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

function revisionFromRow(row: { revision?: unknown } | null): number | null {
  return typeof row?.revision === "number" ? row.revision : null;
}

async function loadJsonBlob(): Promise<LoadResult> {
  try {
    const supabase = createServiceClient();
    const withRevision = await supabase
      .from("fweta_app_store")
      .select("data, revision")
      .eq("id", STORE_ROW_ID)
      .maybeSingle();

    let data: { data?: unknown; revision?: unknown } | null = withRevision.data;
    let error = withRevision.error;
    if (error && /revision/i.test(error.message)) {
      const fallback = await supabase
        .from("fweta_app_store")
        .select("data")
        .eq("id", STORE_ROW_ID)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) return { ok: false, error: error.message };
    // No row yet: revision null so the first save inserts instead of conflicting.
    if (!data) return { ok: true, store: emptyStore(), revision: null };
    if (!data.data) return { ok: true, store: emptyStore(), revision: revisionFromRow(data) ?? 0 };
    const store = normalizeStore(data.data);
    if (!store) return { ok: false, error: "fweta_app_store row was not a store document" };
    return { ok: true, store, revision: revisionFromRow(data) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "JSON blob load failed" };
  }
}

async function upsertJsonBlob(store: DatabaseStore, revision: number | null): Promise<boolean> {
  const supabase = createServiceClient();
  const row: { id: string; data: DatabaseStore; updated_at: string; revision?: number } = {
    id: STORE_ROW_ID,
    data: store,
    updated_at: new Date().toISOString(),
  };
  if (revision !== null) row.revision = revision;
  const { error } = await supabase.from("fweta_app_store").upsert(row, { onConflict: "id" });
  if (error && revision !== null && /revision/i.test(error.message)) {
    delete row.revision;
    const retry = await supabase.from("fweta_app_store").upsert(row, { onConflict: "id" });
    if (retry.error) {
      console.warn("[fweta] JSON blob save failed:", retry.error.message);
      return false;
    }
    globalThis.__fwetaBlobRevision = undefined;
    return true;
  }
  if (error) {
    console.warn("[fweta] JSON blob save failed:", error.message);
    return false;
  }
  if (revision !== null) globalThis.__fwetaBlobRevision = revision;
  return true;
}

async function saveJsonBlob(store: DatabaseStore): Promise<boolean> {
  try {
    const current = await loadJsonBlob();
    if (!current.ok) {
      console.warn("[fweta] JSON blob save skipped; could not read current row:", current.error);
      return false;
    }
    if (store.profiles.length === 0 && current.store.profiles.length > 0) {
      throw new StorePersistError(
        "Refusing to replace a populated store with an empty profile list.",
      );
    }

    const expected = globalThis.__fwetaBlobRevision;
    if (typeof expected === "number") {
      const next = expected + 1;
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("fweta_app_store")
        .update({
          data: store,
          updated_at: new Date().toISOString(),
          revision: next,
        })
        .eq("id", STORE_ROW_ID)
        .eq("revision", expected)
        .select("revision");

      if (error && /revision/i.test(error.message)) {
        return upsertJsonBlob(store, null);
      }
      if (error) {
        console.warn("[fweta] JSON blob save failed:", error.message);
        return false;
      }
      if (!data || data.length === 0) {
        if (current.revision === null && current.store.profiles.length === 0 && store.profiles.length > 0) {
          return upsertJsonBlob(store, 1);
        }
        throw new StorePersistError(
          "Store changed in another instance. Reload and try again.",
        );
      }
      globalThis.__fwetaBlobRevision = next;
      return true;
    }

    return upsertJsonBlob(store, current.revision === null ? null : (current.revision ?? 0) + 1);
  } catch (err) {
    if (err instanceof StorePersistError) throw err;
    console.warn("[fweta] JSON blob save failed:", err instanceof Error ? err.message : err);
    return false;
  }
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
    if (jsonBlob.ok) {
      globalThis.__fwetaBlobRevision = jsonBlob.revision === null ? undefined : jsonBlob.revision;
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
 * Production health check. Read-only unless `probe` is set — the probe writes
 * and deletes a throwaway row, so callers must authenticate it.
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
      const probeId = "__health_probe__";
      const { error } = await supabase.from("fweta_app_store").upsert(
        {
          id: probeId,
          data: { probe: true },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) {
        result.jsonBlobSaveError = error.message;
      } else {
        result.jsonBlobSaveOk = true;
        await supabase.from("fweta_app_store").delete().eq("id", probeId);
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

export async function saveStoreToSupabase(store: DatabaseStore): Promise<boolean> {
  // JSON blob is the production document. Relational replace deletes every row
  // first, so it stays opt-in and never runs unless the JSON write succeeded.
  const jsonOk = await saveJsonBlob(store);
  if (!jsonOk) return false;
  if (process.env.FWETA_RELATIONAL_SYNC === "true") {
    await saveRelationalStore(store);
  }
  return true;
}
