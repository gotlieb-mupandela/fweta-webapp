import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { UgcFile } from "@/lib/db/types";

const DIR = path.join(process.cwd(), "data", "ugc");
const NAME = /^[0-9a-f-]{36}\.(mp4|webm|mov|png|jpg|webp)$/i;
const MAX = 40 * 1024 * 1024;

const TYPES: Record<string, { ext: string; kind: UgcFile["kind"]; contentType: string }> = {
  "video/mp4": { ext: "mp4", kind: "video", contentType: "video/mp4" },
  "video/webm": { ext: "webm", kind: "video", contentType: "video/webm" },
  "video/quicktime": { ext: "mov", kind: "video", contentType: "video/quicktime" },
  "image/png": { ext: "png", kind: "raw", contentType: "image/png" },
  "image/jpeg": { ext: "jpg", kind: "raw", contentType: "image/jpeg" },
  "image/webp": { ext: "webp", kind: "raw", contentType: "image/webp" },
};

export function ugcFileNameOk(name: string): boolean {
  return NAME.test(name);
}

export function ugcContentType(name: string): string | null {
  const match = Object.values(TYPES).find((item) => name.toLowerCase().endsWith(`.${item.ext}`));
  return match?.contentType ?? null;
}

export function ugcAbsolutePath(name: string): string | null {
  if (!ugcFileNameOk(name)) return null;
  const root = path.resolve(DIR);
  const full = path.resolve(DIR, name);
  if (!full.startsWith(`${root}${path.sep}`)) return null;
  return full;
}

function safeOriginalName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "").trim().slice(0, 80);
  return cleaned || "upload";
}

export async function saveUgcFile(file: File): Promise<UgcFile> {
  if (file.size <= 0) throw new Error("That file is empty.");
  if (file.size > MAX) throw new Error("Each file must be 40 MB or smaller.");
  const spec = TYPES[file.type];
  if (!spec) throw new Error("Use MP4, WebM, MOV, PNG, JPG, or WebP.");
  const name = `${randomUUID()}.${spec.ext}`;
  await mkdir(DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(DIR, name), bytes);
  return {
    id: randomUUID(),
    name,
    originalName: safeOriginalName(file.name || `upload.${spec.ext}`),
    kind: spec.kind,
  };
}

export async function readUgcFile(name: string): Promise<Buffer | null> {
  const full = ugcAbsolutePath(name);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}
