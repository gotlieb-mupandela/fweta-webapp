import {
  GENERAL_READ_TTL_SECONDS,
  KYC_BUCKET,
  MEDIA_BUCKET,
  contentTypeForKind,
  extensionForKind,
  type StorageBucket,
} from "@/lib/storage/constants";
import { createSupabaseStorageDriver, isStorageConfigured } from "@/lib/storage/driver";
import { readCheckedObject } from "@/lib/storage/objects";
import { downloadHeaders, isFlatLocalName, isSafeStoragePath, prepareRead } from "@/lib/storage/policy";
import { sniffKind } from "@/lib/storage/sniff";

export async function openDownload(input: {
  purpose: "avatar" | "screenshot" | "kyc" | "ugc";
  name: string;
  requesterId: string;
  ownerIds: string[];
  isAdmin: boolean;
  filenameBase: string;
  attachment: boolean;
  /** Published profile photos skip the owner check and use a cache header. */
  publicAvatar?: boolean;
}): Promise<{ bytes: Uint8Array; headers: Record<string, string> } | null> {
  const bucket: StorageBucket = input.purpose === "kyc" ? KYC_BUCKET : MEDIA_BUCKET;
  const access = input.publicAvatar
    ? { ok: true as const, expiresIn: GENERAL_READ_TTL_SECONDS }
    : prepareRead({
        requesterId: input.requesterId,
        ownerIds: input.ownerIds,
        isAdmin: input.isAdmin,
        bucket,
      });
  if (!access.ok) return null;

  let bytes: Uint8Array | null = null;
  if (isSafeStoragePath(input.name)) {
    if (!isStorageConfigured()) return null;
    try {
      const driver = createSupabaseStorageDriver();
      const signedUrl = await driver.createSignedReadUrl({
        bucket,
        path: input.name,
        expiresIn: access.expiresIn,
        downloadName: input.attachment ? input.filenameBase : "",
      });
      const response = await fetch(signedUrl);
      if (!response.ok) return null;
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
  } else if (isFlatLocalName(input.name) && input.purpose !== "avatar") {
    bytes = await readCheckedObject(input.purpose, input.name);
  } else {
    return null;
  }

  if (!bytes) return null;
  const kind = sniffKind(bytes);
  if (!kind) return null;
  if ((input.purpose === "avatar" || input.purpose === "screenshot") && kind === "pdf") return null;
  const headers = downloadHeaders({
    contentType: contentTypeForKind(kind),
    filename: `${input.filenameBase}.${extensionForKind(kind)}`,
    attachment: input.attachment,
    cacheSeconds: input.publicAvatar ? 300 : undefined,
  });
  return { bytes, headers };
}
