import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const appDir = path.join(process.cwd(), "app");

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) files.push(full);
  }
  return files;
}

function matchDelim(source: string, openAt: number, open: string, close: string): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  for (let i = openAt; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i < 0) return -1;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2);
      if (i < 0) return -1;
      i += 1;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function functionBody(source: string, from: number): string | null {
  const openParen = source.indexOf("(", from);
  if (openParen < 0) return null;
  const closeParen = matchDelim(source, openParen, "(", ")");
  if (closeParen < 0) return null;
  const open = source.indexOf("{", closeParen + 1);
  if (open < 0) return null;
  const close = matchDelim(source, open, "{", "}");
  if (close < 0) return null;
  return source.slice(open, close + 1);
}

function constBody(source: string, from: number): string | null {
  const arrow = source.indexOf("=>", from);
  const fn = source.indexOf("function", from);
  if (fn >= 0 && (arrow < 0 || fn < arrow)) return functionBody(source, fn + "function".length);
  if (arrow < 0) return null;
  let i = arrow + 2;
  while (source[i] === " " || source[i] === "\n" || source[i] === "\r") i += 1;
  if (source[i] !== "{") return source.slice(i, Math.min(source.length, i + 200));
  const close = matchDelim(source, i, "{", "}");
  if (close < 0) return null;
  return source.slice(i, close + 1);
}

function generateMetadataBodies(source: string): string[] {
  const bodies: string[] = [];
  const re = /export\s+(?:async\s+)?function\s+generateMetadata\b|export\s+const\s+generateMetadata\b/g;
  for (const match of source.matchAll(re)) {
    const isFunction = match[0].includes("function");
    const body = isFunction
      ? functionBody(source, match.index + match[0].length)
      : constBody(source, match.index + match[0].length);
    if (body) bodies.push(body);
  }
  return bodies;
}

function dbBindings(source: string): string[] {
  const names: string[] = [];
  const re = /import\s+([\s\S]*?)\s+from\s+["']@\/lib\/db(?:\/[^"']*)?["']/g;
  for (const match of source.matchAll(re)) {
    const clause = match[1].trim();
    if (clause.startsWith("type ")) continue;
    const brace = clause.indexOf("{");
    if (brace > 0) {
      const before = clause.slice(0, brace).replace(/,/g, "").trim();
      if (before && before !== "type") names.push(before);
    } else if (!clause.startsWith("{") && !clause.startsWith("*")) {
      names.push(clause);
    }
    const namespace = clause.match(/\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (namespace) names.push(namespace[1]);
    const spec = clause.match(/\{([\s\S]*)\}/);
    if (!spec) continue;
    for (const part of spec[1].split(",")) {
      const piece = part.trim();
      if (!piece || piece.startsWith("type ")) continue;
      const alias = piece.includes(" as ") ? piece.split(/\s+as\s+/).pop() : piece;
      const name = alias?.trim() ?? "";
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.push(name);
    }
  }
  return names;
}

function fetchesByIdParam(body: string): boolean {
  const names = new Set<string>();
  for (const match of body.matchAll(/\{\s*([^{}]+)\}\s*=\s*await\s+params\b/g)) {
    for (const part of match[1].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const alias = piece.includes(":") ? piece.split(":").pop() : piece;
      const name = alias?.trim() ?? "";
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
    }
  }
  if (/\(\s*await\s+params\s*\)\s*\.\s*[A-Za-z_]/.test(body)) return true;
  for (const name of names) {
    const usedInCall = new RegExp(`\\([^)]*\\b${name}\\b`).test(body);
    const usedInCompare = new RegExp(`===?\\s*${name}\\b|\\b${name}\\s*===?`).test(body);
    if (usedInCall || usedInCompare) return true;
  }
  return false;
}

function metadataLeak(source: string): string | null {
  const bindings = dbBindings(source);
  for (const body of generateMetadataBodies(source)) {
    if (/\breadStore\b/.test(body)) return "readStore";
    if (/@\/lib\/db\b/.test(body)) return "lib/db import";
    for (const name of bindings) {
      if (new RegExp(`\\b${name}\\b`).test(body)) return `lib/db binding ${name}`;
    }
    if (fetchesByIdParam(body)) return "id param fetch";
  }
  return null;
}

function layoutGates(dir: string): boolean {
  let current = dir;
  while (current.startsWith(appDir)) {
    for (const name of ["layout.tsx", "layout.ts"]) {
      const layoutPath = path.join(current, name);
      if (!existsSync(layoutPath)) continue;
      const layout = readFileSync(layoutPath, "utf8");
      if (/\b(getSession|requireSession)\b/.test(layout) && /\bredirect\s*\(/.test(layout)) return true;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

function isCovered(file: string, source: string): boolean {
  const rel = path.relative(appDir, file);
  if (rel === "dashboard" || rel.startsWith(`dashboard${path.sep}`)) return true;
  if (/\brequireSession\b/.test(source)) return true;
  if (/\bgetSession\b/.test(source) && /\bredirect\s*\(/.test(source)) return true;
  return layoutGates(path.dirname(file));
}

test("gated routes do not put stored records in generateMetadata", () => {
  const offenders: string[] = [];
  for (const file of walk(appDir)) {
    const source = readFileSync(file, "utf8");
    if (!isCovered(file, source)) continue;
    const leak = metadataLeak(source);
    if (leak) offenders.push(`${path.relative(process.cwd(), file)} (${leak})`);
  }
  assert.deepEqual(offenders, []);
});

test("the metadata leak detector flags store reads and id lookups", () => {
  const readStoreFn = `
    export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
      const { id } = await params;
      const store = await readStore();
      const campaign = store.campaigns.find((row) => row.id === id);
      return { title: campaign?.title ?? "Campaign" };
    }
  `;
  assert.equal(metadataLeak(readStoreFn), "readStore");

  const constStyle = `
    import { readStore as loadRows } from "@/lib/db/store";
    export const generateMetadata = async ({ params }: { params: Promise<{ briefId: string }> }): Promise<Metadata> => {
      const { briefId } = await params;
      const store = await loadRows();
      return { title: store.ugcBriefs.find((item) => item.id === briefId)?.title ?? "UGC brief" };
    };
  `;
  assert.equal(metadataLeak(constStyle), "lib/db binding loadRows");

  const idFetch = `
    export const generateMetadata = async function ({ params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      const dossier = await loadAdminUserDossier(id);
      return { title: dossier?.displayName ?? "User" };
    };
  `;
  assert.equal(metadataLeak(idFetch), "id param fetch");

  const staticTitle = `
    import { readStore } from "@/lib/db/store";
    export async function generateMetadata(): Promise<Metadata> {
      return { title: "Campaign" };
    }
    export default async function Page() {
      const store = await readStore();
      return store.campaigns.length;
    }
  `;
  assert.equal(metadataLeak(staticTitle), null);

  const typeOnly = `
    import type { DatabaseStore } from "@/lib/db/types";
    export async function generateMetadata(): Promise<Metadata> {
      return { title: "User" };
    }
  `;
  assert.equal(metadataLeak(typeOnly), null);
});
