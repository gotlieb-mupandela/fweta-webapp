import { inspectFile } from "@/lib/storage/inspect";
import { putCheckedObject, readCheckedObject, sniffedType } from "@/lib/storage/objects";
import { isStoredObjectName } from "@/lib/storage/policy";

export function kycFileNameOk(name: string): boolean {
  return isStoredObjectName(name) && (name.includes("/kyc/") || !name.includes("/"));
}

export function kycContentType(bytes: Uint8Array): string | null {
  return sniffedType(bytes);
}

export async function saveKycDocument(file: File, userId?: string): Promise<string> {
  const checked = await inspectFile(file, "kyc");
  const { isStorageConfigured } = await import("@/lib/storage/driver");
  if (!isStorageConfigured()) return putCheckedObject({ userId: userId || "local", purpose: "kyc", ...checked });
  let owner = userId;
  if (!owner) {
    const { getSession } = await import("@/lib/auth/session");
    owner = (await getSession())?.id;
  }
  if (!owner) throw new Error("Sign in required.");
  return putCheckedObject({ userId: owner, purpose: "kyc", ...checked });
}

export async function readKycDocument(name: string): Promise<Uint8Array | null> {
  if (!kycFileNameOk(name)) return null;
  return readCheckedObject("kyc", name);
}
