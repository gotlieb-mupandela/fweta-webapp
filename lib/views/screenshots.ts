import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const DIR = path.join(process.cwd(), "data", "view-screenshots");
const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/i;

const TYPES: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function screenshotFileNameOk(name: string): boolean {
  return NAME.test(name);
}

export function screenshotContentType(name: string): string | null {
  if (!screenshotFileNameOk(name)) return null;
  if (name.toLowerCase().endsWith(".png")) return "image/png";
  if (name.toLowerCase().endsWith(".webp")) return "image/webp";
  if (name.toLowerCase().endsWith(".jpg")) return "image/jpeg";
  return null;
}

export function screenshotAbsolutePath(name: string): string | null {
  if (!screenshotFileNameOk(name)) return null;
  const root = path.resolve(DIR);
  const full = path.resolve(DIR, name);
  if (!full.startsWith(`${root}${path.sep}`)) return null;
  return full;
}

export async function saveViewScreenshot(file: File): Promise<string> {
  if (file.size <= 0) throw new Error("That screenshot is empty.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Screenshot must be 2 MB or smaller.");
  const ext = TYPES[file.type];
  if (!ext) throw new Error("Use a PNG, JPG, or WebP screenshot.");
  const name = `${randomUUID()}.${ext}`;
  await mkdir(DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(DIR, name), bytes);
  return name;
}

export async function readViewScreenshot(name: string): Promise<Buffer | null> {
  const full = screenshotAbsolutePath(name);
  if (!full) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}
