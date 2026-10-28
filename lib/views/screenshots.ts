import { inspectFile } from "@/lib/storage/inspect";
import { putCheckedObject, readCheckedObject, sniffedType } from "@/lib/storage/objects";
import { isStoredObjectName } from "@/lib/storage/policy";

export function screenshotFileNameOk(name: string): boolean {
  return isStoredObjectName(name) && (name.includes("/screenshot/") || !name.includes("/"));
}

export function screenshotContentType(bytes: Uint8Array): string | null {
  return sniffedType(bytes);
}

export async function saveViewScreenshot(file: File): Promise<string> {
  const checked = await inspectFile(file, "screenshot");
  const { isStorageConfigured } = await import("@/lib/storage/driver");
  if (!isStorageConfigured()) return putCheckedObject({ userId: "local", purpose: "screenshot", ...checked });
  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession();
  if (!session) throw new Error("Sign in required.");
  return putCheckedObject({ userId: session.id, purpose: "screenshot", ...checked });
}

export async function readViewScreenshot(name: string): Promise<Uint8Array | null> {
  if (!screenshotFileNameOk(name)) return null;
  return readCheckedObject("screenshot", name);
}
