"use server";

import { randomUUID } from "crypto";

import { requireSession } from "@/lib/auth/session";
import { readStore, updateStore } from "@/lib/db/store";
import type { UgcFile } from "@/lib/db/types";
import {
  SERVER_ACTION_FILE_MAX,
  STORAGE_NOT_READY_ERROR,
  friendlyStorageError,
} from "@/lib/storage/constants";
import { createSupabaseStorageDriver, isStorageConfigured } from "@/lib/storage/driver";
import {
  claimStoredGrant,
  finalizeStoredGrant,
  hashUploadToken,
  issueStoredGrant,
  newUploadToken,
  ugcStageDecision,
} from "@/lib/storage/policy";
import { safeOriginalName } from "@/lib/ugc/files";
import { createUgcUploadSchema, finalizeUgcUploadSchema } from "@/lib/validations/uploads";

export async function createUgcUploadAction(raw: unknown) {
  const session = await requireSession();
  const parsed = createUgcUploadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Choose a file to upload." };
  if (parsed.data.byteSize <= SERVER_ACTION_FILE_MAX) {
    return { ok: false as const, error: "Files up to 4 MB upload with the form." };
  }
  if (!isStorageConfigured()) return { ok: false as const, error: STORAGE_NOT_READY_ERROR };

  const store = await readStore();
  const decision = ugcStageDecision({
    userId: session.id,
    applicationId: parsed.data.applicationId,
    applications: store.ugcApplications,
    grants: store.uploadGrants ?? [],
    nowMs: Date.now(),
  });
  if (!decision.ok) return { ok: false as const, error: decision.error };

  const token = newUploadToken();
  const issued = issueStoredGrant({
    userId: session.id,
    purpose: "ugc",
    byteSize: parsed.data.byteSize,
    nowMs: Date.now(),
    id: randomUUID(),
    token,
    targetId: parsed.data.applicationId,
  });
  if ("error" in issued) return { ok: false as const, error: issued.error };

  const claimed = claimStoredGrant(issued, token, session.id, Date.now());
  if (!claimed.ok) return { ok: false as const, error: claimed.error };

  let blocked: string | null = null;
  await updateStore((draft) => {
    const again = ugcStageDecision({
      userId: session.id,
      applicationId: parsed.data.applicationId,
      applications: draft.ugcApplications,
      grants: draft.uploadGrants ?? [],
      nowMs: Date.now(),
    });
    if (!again.ok) {
      blocked = again.error;
      return;
    }
    draft.uploadGrants = [...(draft.uploadGrants ?? []), claimed.grant];
  });
  if (blocked) return { ok: false as const, error: blocked };

  let signedUrl = "";
  try {
    const signed = await createSupabaseStorageDriver().createSignedUploadUrl({
      bucket: claimed.grant.bucket,
      path: claimed.grant.path,
    });
    signedUrl = signed.signedUrl;
  } catch (error) {
    await updateStore((draft) => {
      draft.uploadGrants = (draft.uploadGrants ?? []).filter((item) => item.id !== claimed.grant.id);
    });
    return {
      ok: false as const,
      error: friendlyStorageError(error instanceof Error ? error.message : "Upload failed"),
    };
  }

  return { ok: true as const, token, signedUrl, path: claimed.grant.path };
}

export async function finalizeUgcUploadAction(raw: unknown): Promise<
  { ok: true; file: UgcFile } | { ok: false; error: string }
> {
  const session = await requireSession();
  const parsed = finalizeUgcUploadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "This upload link is not valid." };
  if (!isStorageConfigured()) return { ok: false, error: STORAGE_NOT_READY_ERROR };

  const store = await readStore();
  const grant = (store.uploadGrants ?? []).find(
    (item) => item.tokenHash === hashUploadToken(parsed.data.token) && item.userId === session.id,
  );
  if (!grant || grant.targetId !== parsed.data.applicationId) {
    return { ok: false, error: "This upload link is not valid." };
  }

  const driver = createSupabaseStorageDriver();
  let bytes: Uint8Array | null = null;
  try {
    bytes = await driver.downloadObject(grant.bucket, grant.path);
  } catch (error) {
    return { ok: false, error: friendlyStorageError(error instanceof Error ? error.message : "Upload failed") };
  }
  if (!bytes) return { ok: false, error: "Upload the file before finishing." };

  const checked = finalizeStoredGrant(grant, parsed.data.token, session.id, Date.now(), bytes);
  if (!checked.ok) {
    let deleteError: string | null = null;
    if (checked.deleteObject) {
      try {
        await driver.deleteObject(grant.bucket, grant.path);
      } catch (error) {
        deleteError = friendlyStorageError(error instanceof Error ? error.message : "Upload failed");
      }
    }
    if (checked.grant) {
      await updateStore((draft) => {
        const row = draft.uploadGrants?.find((item) => item.id === grant.id);
        if (row && checked.grant) {
          row.tokenHash = checked.grant.tokenHash;
          row.spentAt = checked.grant.spentAt ?? new Date().toISOString();
        }
      });
    }
    return { ok: false, error: deleteError ?? checked.error };
  }

  await updateStore((draft) => {
    const row = draft.uploadGrants?.find((item) => item.id === grant.id);
    if (row) row.finalizedAt = checked.grant.finalizedAt;
  });

  return {
    ok: true,
    file: {
      id: grant.id,
      name: grant.path,
      originalName: safeOriginalName(parsed.data.originalName || "upload"),
      kind: "raw",
    },
  };
}
