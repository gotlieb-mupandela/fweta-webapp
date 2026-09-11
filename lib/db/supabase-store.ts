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

function relationalSyncEnabled(): boolean {
  return process.env.FWETA_RELATIONAL_SYNC === "true";
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMissingRpc(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the function") ||
    (lower.includes("function") && lower.includes("does not exist"))
  );
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

async function loadJsonRpc(): Promise<DatabaseStore | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("fweta_json_store_get");
    if (error) {
      if (!isMissingRpc(error.message)) {
        console.warn("[fweta] JSON RPC load failed:", error.message);
      }
      return null;
    }
    return normalizeStore(data);
  } catch (err) {
    console.warn("[fweta] JSON RPC load failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function saveJsonRpc(store: DatabaseStore): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("fweta_json_store_set", { payload: store });
    if (error) {
      if (!isMissingRpc(error.message)) {
        console.warn("[fweta] JSON RPC save failed:", error.message);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[fweta] JSON RPC save failed:", err instanceof Error ? err.message : err);
    return false;
  }
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
      if (!isMissingRpc(error.message) && !error.message.includes("does not exist")) {
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
      if (!isMissingRpc(error.message)) {
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
    if (relationalSyncEnabled()) {
      const relational = await loadRelationalStore();
      if (relational && hasData(relational)) {
        return relational;
      }
    }

    const jsonRpc = await loadJsonRpc();
    if (jsonRpc && hasData(jsonRpc)) {
      return jsonRpc;
    }

    const jsonBlob = await loadJsonBlob();
    if (jsonBlob && hasData(jsonBlob)) {
      if (relationalSyncEnabled()) {
        await saveRelationalStore(jsonBlob).catch(() => undefined);
      }
      await saveJsonRpc(jsonBlob).catch(() => undefined);
      return jsonBlob;
    }

    return jsonRpc ?? jsonBlob ?? emptyStore();
  } catch (err) {
    console.warn("[fweta] loadStoreFromSupabase failed:", err instanceof Error ? err.message : err);
    return emptyStore();
  }
}

export type SupabaseStoreDiagnostics = {
  jsonRpcLoadOk: boolean;
  jsonRpcLoadError: string | null;
  jsonRpcSaveOk: boolean;
  jsonRpcSaveError: string | null;
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
    jsonRpcLoadOk: false,
    jsonRpcLoadError: null,
    jsonRpcSaveOk: false,
    jsonRpcSaveError: null,
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
    const { data, error } = await supabase.rpc("fweta_json_store_get");
    if (error) {
      result.jsonRpcLoadError = error.message;
    } else {
      result.jsonRpcLoadOk = true;
      const store = normalizeStore(data) ?? emptyStore();
      result.profileCount = store.profiles.length;
      const { error: saveError } = await supabase.rpc("fweta_json_store_set", { payload: store });
      if (saveError) {
        result.jsonRpcSaveError = saveError.message;
      } else {
        result.jsonRpcSaveOk = true;
      }
    }
  } catch (e) {
    result.jsonRpcLoadError = e instanceof Error ? e.message : "rpc threw";
  }

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
      result.profileCount = Math.max(result.profileCount, store.profiles.length);
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

  if (relationalSyncEnabled()) {
    try {
      const supabase = createServiceClient();
      const { error } = await supabase.rpc("fweta_load_store");
      if (error) {
        if (isMissingRpc(error.message)) {
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
  } else {
    result.relationalLoadError = "skipped (JSON store is primary)";
  }

  return result;
}

export async function saveStoreToSupabase(store: DatabaseStore): Promise<boolean> {
  const rpcOk = await saveJsonRpc(store);
  const jsonOk = rpcOk ? true : await saveJsonBlob(store);
  if (relationalSyncEnabled()) {
    const relationalOk = await saveRelationalStore(store);
    return jsonOk || relationalOk;
  }
  return jsonOk;
}
