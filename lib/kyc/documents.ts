import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { imageKindForUpload, type ImageKind } from "@/lib/kyc/magic";

const DIR = path.join(process.cwd(), "data", "kyc");
const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/i;

const TYPES: Record<string, ImageKind> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function kycFileNameOk(name: string): boolean {
  return NAME.test(name);
}

export function kycContentType(name: string): string | null {
  if (!kycFileNameOk(name)) return null;
  if (name.toLowerCase().endsWith(".png")) return "image/png";
  if (name.toLowerCase().endsWith(".webp")) return "image/webp";
  if (name.toLowerCase().endsWith(".jpg")) return "image/jpeg";
  return null;
}

export function kycAbsolutePath(name: string): string | null {
  if (!kycFileNameOk(name)) return null;
  const root = path.resolve(DIR);
  const full = path.resolve(DIR, name);
  if (!full.startsWith(`${root}${path.sep}`)) return null;
  return full;
}

export async function saveKycDocument(file: File): Promise<string> {
  if (file.size <= 0) throw new Error("That ID photo is empty.");
  if (file.size > 4 * 1024 * 1024) throw new Error("ID photo must be 4 MB or smaller.");
  if (!TYPES[file.type]) throw new Error("Use a PNG, JPG, or WebP photo of the ID.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = imageKindForUpload(file.type, bytes);
  if (!ext) throw new Error("That file is not a PNG, JPG, or WebP photo.");
  const name = `${randomUUID()}.${ext}`;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), bytes);
  return name;
}

export async function readKycDocument(name: string): Promise<Buffer | null> {
  const full = kycAbsolutePath(name);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}
