import { createClient } from "@supabase/supabase-js";

import type { DatabaseStore } from "./types";

const STORE_ROW_ID = "default";

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
});

export function isSupabaseStoreEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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

  return store;
}

function hasData(store: DatabaseStore): boolean {
  return (
    store.profiles.length > 0 ||
    store.campaigns.length > 0 ||
    store.submissions.length > 0
  );
}

async function loadJsonBlob(): Promise<DatabaseStore | null> {
  try {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fweta_app_store")
    .select("data")
    .eq("id", STORE_ROW_ID)
    .maybeSingle();

  if (error || !data?.data) return null;
  return normalizeStore(data.data);
  } catch (err) {
    console.warn("[fweta] JSON blob load failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function saveJsonBlob(store: DatabaseStore): Promise<boolean> {
  try {
  const supabase = createServiceClient();
  const { error } = await supabase.from("fweta_app_store").upsert(
    {
      id: STORE_ROW_ID,
      data: store,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("[fweta] JSON blob save failed:", error.message);
    return false;
  }
  return true;
  } catch (err) {
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
    if (relational && hasData(relational)) {
      return relational;
    }

    const jsonBlob = await loadJsonBlob();
    if (jsonBlob && hasData(jsonBlob)) {
      // Migrate legacy JSON blob → relational tables when schema exists
      await saveRelationalStore(jsonBlob).catch(() => undefined);
      return jsonBlob;
    }

    return relational ?? jsonBlob ?? emptyStore();
  } catch (err) {
    console.warn("[fweta] loadStoreFromSupabase failed:", err instanceof Error ? err.message : err);
    return emptyStore();
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

/** Production health check — tests load + round-trip save without leaking secrets. */
export async function diagnoseSupabaseStore(): Promise<SupabaseStoreDiagnostics> {
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
  // JSON blob upsert is safe; relational save deletes all rows first and can wipe data on failure.
  const jsonOk = await saveJsonBlob(store);
  if (process.env.FWETA_RELATIONAL_SYNC === "true") {
    const relationalOk = await saveRelationalStore(store);
    return jsonOk || relationalOk;
  }
  return jsonOk;
}
