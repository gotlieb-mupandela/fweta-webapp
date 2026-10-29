import { isServiceStorageConfigured, createServiceStorageClient } from "@/lib/storage/service";

export const KYC_BUCKET = "kyc-documents";

/**
 * Private bucket. Objects are not public URLs.
 * The app reads them through /api/kyc/[name] after a session check.
 */
export async function putKycObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (!isServiceStorageConfigured()) {
    throw new Error(
      "ID photo storage is not configured. An admin needs to enable the private kyc-documents bucket.",
    );
  }
  const client = createServiceStorageClient();
  const { error } = await client.storage.from(KYC_BUCKET).upload(key, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(error.message || "Could not store the ID photo.");
  }
}

export async function getKycObject(key: string): Promise<Uint8Array | null> {
  if (!isServiceStorageConfigured()) return null;
  const client = createServiceStorageClient();
  const { data, error } = await client.storage.from(KYC_BUCKET).download(key);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
