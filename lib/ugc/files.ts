import { randomUUID } from "crypto";

import type { UgcFile } from "@/lib/db/types";
import { inspectFile } from "@/lib/storage/inspect";
import { putCheckedObject, readCheckedObject, sniffedType } from "@/lib/storage/objects";
import { isStoredObjectName } from "@/lib/storage/policy";

export function ugcFileNameOk(name: string): boolean {
  return isStoredObjectName(name) && (name.includes("/ugc/") || !name.includes("/"));
}

export function ugcContentType(bytes: Uint8Array): string | null {
  return sniffedType(bytes);
}

function safeOriginalName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "").trim().slice(0, 80);
  return cleaned || "upload";
}

export async function saveUgcFile(file: File, userId?: string): Promise<UgcFile> {
  const checked = await inspectFile(file, "ugc");
  const { isStorageConfigured } = await import("@/lib/storage/driver");
  let owner = userId;
  if (isStorageConfigured() && !owner) {
    const { getSession } = await import("@/lib/auth/session");
    owner = (await getSession())?.id;
  }
  if (isStorageConfigured() && !owner) throw new Error("Sign in required.");
  const name = await putCheckedObject({
    userId: owner || "local",
    purpose: "ugc",
    bytes: checked.bytes,
    kind: checked.kind,
  });
  return {
    id: randomUUID(),
    name,
    originalName: safeOriginalName(file.name || `upload.${checked.kind === "jpg" ? "jpg" : checked.kind}`),
    kind: "raw",
  };
}

export async function readUgcFile(name: string): Promise<Uint8Array | null> {
  if (!ugcFileNameOk(name)) return null;
  return readCheckedObject("ugc", name);
}

export { safeOriginalName };
