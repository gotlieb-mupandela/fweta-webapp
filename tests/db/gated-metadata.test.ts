import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const appDir = path.join(process.cwd(), "app");

// Pure helpers that may be called from gated generateMetadata.
// Each one only formats a value. None of them read the store, the session, or the request.
const METADATA_LIB_ALLOWLIST = new Set<string>([
  // Currency label from a cent amount.
  "formatMoney",
  // Locale-grouped number label.
  "formatNumber",
]);

const SESSION_HELPERS = new Set(["getSession", "requireSession", "requireRole"]);

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) files.push(full);
  }
  return files;
}

function stripComments(source: string): string {
  let out = "";
  let quote: "'" | '"' | "`" | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];
    if (quote) {
      out += char;
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      const next = source.indexOf("\n", i);
      if (next < 0) break;
      i = next;
      out += "\n";
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) break;
      i = end + 1;
      out += " ";
      continue;
    }
    out += char;
  }
  return out;
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

function constMarker(source: string, from: number): { kind: "arrow" | "function"; at: number } | null {
  const eq = source.indexOf("=", from);
  if (eq < 0) return null;
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let quote: "'" | '"' | "`" | null = null;
  for (let i = eq + 1; i < source.length; i += 1) {
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
      const next = source.indexOf("\n", i);
      if (next < 0) return null;
      i = next;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 1;
      continue;
    }
    if (paren === 0 && brace === 0 && bracket === 0) {
      if (char === "=" && source[i + 1] === ">") return { kind: "arrow", at: i };
      if (source.startsWith("function", i) && (i === 0 || !/[A-Za-z0-9_]/.test(source[i - 1]))) {
        return { kind: "function", at: i };
      }
      if (char === ";" || source.startsWith("\nexport ", i)) return null;
    }
    if (char === "(") paren += 1;
    else if (char === ")") paren = Math.max(0, paren - 1);
    else if (char === "{") brace += 1;
    else if (char === "}") brace = Math.max(0, brace - 1);
    else if (char === "[") bracket += 1;
    else if (char === "]") bracket = Math.max(0, bracket - 1);
  }
  return null;
}

function constBody(source: string, from: number): string | null {
  const marker = constMarker(source, from);
  if (!marker) return null;
  if (marker.kind === "function") return functionBody(source, marker.at + "function".length);
  let i = marker.at + 2;
  while (source[i] === " " || source[i] === "\n" || source[i] === "\r") i += 1;
  if (source[i] !== "{") return source.slice(i, Math.min(source.length, i + 200));
  const close = matchDelim(source, i, "{", "}");
  if (close < 0) return null;
  return source.slice(i, close + 1);
}

function generateMetadataBodies(source: string): string[] {
  const bodies: string[] = [];
  const re = /(?:export\s+)?(?:async\s+)?function\s+generateMetadata\b|(?:export\s+)?const\s+generateMetadata\b/g;
  for (const match of source.matchAll(re)) {
    const isFunction = match[0].includes("function");
    const body = isFunction
      ? functionBody(source, match.index + match[0].length)
      : constBody(source, match.index + match[0].length);
    if (body) bodies.push(body);
  }
  return bodies;
}

type Specifier = { imported: string; local: string };

function specifierList(spec: string): Specifier[] {
  const items: Specifier[] = [];
  for (const part of spec.split(",")) {
    const piece = part.trim();
    if (!piece || piece.startsWith("type ")) continue;
    if (piece.includes(" as ")) {
      const [imported, local] = piece.split(/\s+as\s+/).map((item) => item.trim());
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(imported) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(local)) {
        items.push({ imported, local });
      }
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(piece)) items.push({ imported: piece, local: piece });
  }
  return items;
}

type LibBinding = Specifier & { moduleName: string };

function libBindings(source: string): LibBinding[] {
  const found: LibBinding[] = [];
  const re = /import\s+([\s\S]*?)\s+from\s+["'](@\/lib\/[^"']+)["']/g;
  for (const match of source.matchAll(re)) {
    const clause = match[1].trim();
    const moduleName = match[2];
    if (clause.startsWith("type ")) continue;
    const brace = clause.indexOf("{");
    const head = (brace >= 0 ? clause.slice(0, brace) : clause).trim().replace(/,\s*$/, "");
    if (head.startsWith("*")) {
      const namespace = head.match(/\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (namespace) found.push({ imported: "*", local: namespace[1], moduleName });
    } else if (head && !head.startsWith("type")) {
      const def = head.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/);
      if (def) found.push({ imported: "default", local: def[2] ?? def[1], moduleName });
    }
    if (brace < 0) continue;
    const spec = clause.slice(brace).match(/\{([\s\S]*)\}/);
    if (!spec) continue;
    for (const item of specifierList(spec[1])) found.push({ ...item, moduleName });
  }
  return found;
}

function importedValueLocals(source: string): Set<string> {
  const names = new Set<string>();
  const re = /import\s+([\s\S]*?)\s+from\s*["'][^"']+["']/g;
  for (const match of source.matchAll(re)) {
    const clause = match[1].trim();
    if (clause.startsWith("type ")) continue;
    const brace = clause.indexOf("{");
    const head = (brace >= 0 ? clause.slice(0, brace) : clause).trim().replace(/,\s*$/, "");
    if (head.startsWith("*")) {
      const namespace = head.match(/\*\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (namespace) names.add(namespace[1]);
    } else if (head && !head.startsWith("type")) {
      const def = head.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/);
      if (def) names.add(def[2] ?? def[1]);
    }
    if (brace < 0) continue;
    const spec = clause.slice(brace).match(/\{([\s\S]*)\}/);
    if (!spec) continue;
    for (const item of specifierList(spec[1])) names.add(item.local);
  }
  return names;
}

function headerBindings(source: string): Specifier[] {
  const found: Specifier[] = [];
  const re = /import\s+([\s\S]*?)\s+from\s*["']next\/headers["']/g;
  for (const match of source.matchAll(re)) {
    const spec = match[1].match(/\{([\s\S]*)\}/);
    if (!spec) continue;
    for (const item of specifierList(spec[1])) {
      if (item.imported === "cookies" || item.imported === "headers") found.push(item);
    }
  }
  return found;
}

function isDbModule(moduleName: string): boolean {
  return moduleName === "@/lib/db" || moduleName.startsWith("@/lib/db/");
}

function isAllowlisted(binding: LibBinding): boolean {
  if (METADATA_LIB_ALLOWLIST.has(binding.imported)) return true;
  // Default import keeps the helper's name as the local binding.
  return binding.imported === "default" && METADATA_LIB_ALLOWLIST.has(binding.local);
}

function used(body: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(body);
}

function called(body: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*\\(`).test(body);
}

function segmentLookup(body: string, segment: "params" | "searchParams"): boolean {
  const names = new Set<string>();
  const awaitRef = `(?:props\\s*\\.\\s*)?\\b${segment}\\b`;
  for (const match of body.matchAll(new RegExp(`\\{\\s*([^{}]+)\\}\\s*=\\s*await\\s+${awaitRef}\\b`, "g"))) {
    for (const part of match[1].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const alias = piece.includes(":") ? piece.split(":").pop() : piece;
      const name = alias?.trim() ?? "";
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
    }
  }
  for (const match of body.matchAll(
    new RegExp(`\\b(?:const|let)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*await\\s+${awaitRef}\\b`, "g"),
  )) {
    names.add(match[1]);
  }
  if (new RegExp(`\\(\\s*await\\s+${awaitRef}\\s*\\)\\s*\\.\\s*[A-Za-z_]`).test(body)) return true;
  if (new RegExp(`\\b${segment}\\s*\\.\\s*[A-Za-z_]`).test(body)) return true;
  if (new RegExp(`\\bprops\\s*\\.\\s*${segment}\\s*\\.\\s*[A-Za-z_]`).test(body)) return true;
  for (const name of names) {
    const usedInCall = new RegExp(`\\([^)]*\\b${name}\\b`).test(body);
    const usedInCompare = new RegExp(`===?\\s*${name}\\b|\\b${name}\\s*===?`).test(body);
    const usedAsMember = new RegExp(`\\b${name}\\s*\\.\\s*[A-Za-z_]`).test(body);
    const usedAsIndex = new RegExp(`\\[\\s*${name}\\s*\\]`).test(body);
    if (usedInCall || usedInCompare || usedAsMember || usedAsIndex) return true;
  }
  return false;
}

function hasLocalGenerateMetadata(source: string): boolean {
  if (/(?:^|[\n;])\s*(?:export\s+)?(?:async\s+)?function\s+generateMetadata\b/.test(source)) return true;
  return /(?:^|[\n;])\s*(?:export\s+)?const\s+generateMetadata\s*=\s*(?:async\s*)?(?:function\b|\()/.test(source);
}

function reexportedGenerateMetadata(source: string): boolean {
  const fromRe = /export\s*\{([^{}]*)\}\s*from\s*["'][^"']+["']/g;
  for (const match of source.matchAll(fromRe)) {
    if (specifierList(match[1]).some((item) => item.local === "generateMetadata")) return true;
  }
  const imported = importedValueLocals(source);
  const aliasRe = /(?:^|[\n;])\s*(?:export\s+)?const\s+generateMetadata\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:;|\n)/g;
  for (const match of source.matchAll(aliasRe)) {
    if (imported.has(match[1])) return true;
  }
  if (hasLocalGenerateMetadata(source)) return false;
  const localRe = /export\s*\{([^{}]*)\}(?!\s*from)/g;
  for (const match of source.matchAll(localRe)) {
    for (const item of specifierList(match[1])) {
      if (item.local === "generateMetadata" && imported.has(item.imported)) return true;
    }
  }
  return false;
}

function metadataLeak(source: string): string | null {
  const code = stripComments(source);
  if (reexportedGenerateMetadata(code)) return "re-exported generateMetadata";
  const bindings = libBindings(code);
  const headers = headerBindings(code);
  for (const body of generateMetadataBodies(code)) {
    if (/\breadStore\b/.test(body)) return "readStore";
    if (/@\/lib\/db\b/.test(body)) return "lib/db import";
    for (const binding of bindings) {
      if (!isDbModule(binding.moduleName) || !used(body, binding.local)) continue;
      return `lib/db binding ${binding.local}`;
    }
    for (const name of SESSION_HELPERS) {
      if (called(body, name)) return name;
    }
    for (const binding of bindings) {
      if (!SESSION_HELPERS.has(binding.imported) || !called(body, binding.local)) continue;
      return binding.imported;
    }
    if (called(body, "cookies")) return "cookies";
    if (called(body, "headers")) return "headers";
    for (const binding of headers) {
      if (called(body, binding.local)) return binding.imported;
    }
    for (const binding of bindings) {
      if (!used(body, binding.local) || isAllowlisted(binding)) continue;
      return `lib binding ${binding.local}`;
    }
    if (/["']@\/lib\//.test(body)) return "lib import";
    if (segmentLookup(body, "params")) return "id param fetch";
    if (segmentLookup(body, "searchParams")) return "searchParams lookup";
  }
  return null;
}

function layoutSourceGates(layout: string): boolean {
  if (/\b(requireSession|requireRole)\b/.test(layout)) return true;
  return /\bgetSession\b/.test(layout) && /\bredirect\s*\(/.test(layout);
}

function layoutGates(dir: string): boolean {
  let current = dir;
  while (current.startsWith(appDir)) {
    for (const name of ["layout.tsx", "layout.ts"]) {
      const layoutPath = path.join(current, name);
      if (!existsSync(layoutPath)) continue;
      if (layoutSourceGates(readFileSync(layoutPath, "utf8"))) return true;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

function isDashboardOrAdmin(rel: string): boolean {
  for (const part of rel.split(path.sep)) {
    const grouped = part.startsWith("(") && part.endsWith(")") ? part.slice(1, -1) : part;
    if (grouped === "dashboard" || grouped === "admin") return true;
  }
  return false;
}

function isCovered(file: string, source: string): boolean {
  const rel = path.relative(appDir, file);
  if (isDashboardOrAdmin(rel)) return true;
  if (/\b(requireSession|requireRole)\b/.test(source)) return true;
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

test("dashboard, admin, and other gated route groups are scanned", () => {
  assert.equal(isDashboardOrAdmin(path.join("dashboard", "brand", "page.tsx")), true);
  assert.equal(isDashboardOrAdmin(path.join("admin", "users", "page.tsx")), true);
  assert.equal(isDashboardOrAdmin(path.join("(console)", "admin", "page.tsx")), true);
  assert.equal(isDashboardOrAdmin(path.join("campaigns", "[id]", "layout.tsx")), false);
  assert.equal(layoutGates(path.join(appDir, "dashboard", "brand")), true);
  assert.equal(layoutGates(path.join(appDir, "campaigns", "[id]")), false);
  assert.equal(
    layoutSourceGates(`
      import { requireRole } from "@/lib/auth/session";
      export default async function Layout() {
        await requireRole("admin");
      }
    `),
    true,
  );
  assert.equal(layoutSourceGates(`export default function Layout() { return null; }`), false);
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

test("the metadata leak detector flags session, request, lib, searchParams, and re-exports", () => {
  const sessionRead = `
    import { getSession } from "@/lib/auth/session";
    export async function generateMetadata(): Promise<Metadata> {
      const session = await getSession();
      return { title: session?.displayName ?? "Dashboard" };
    }
  `;
  assert.equal(metadataLeak(sessionRead), "getSession");

  const required = `
    export async function generateMetadata(): Promise<Metadata> {
      const session = await requireSession();
      return { title: session.displayName };
    }
  `;
  assert.equal(metadataLeak(required), "requireSession");

  const roleAlias = `
    import { requireRole as guard } from "@/lib/auth/session";
    export async function generateMetadata(): Promise<Metadata> {
      const session = await guard("admin");
      return { title: session.displayName };
    }
  `;
  assert.equal(metadataLeak(roleAlias), "requireRole");

  const cookieRead = `
    import { cookies } from "next/headers";
    export async function generateMetadata(): Promise<Metadata> {
      const jar = await cookies();
      return { title: jar.get("fweta_session") ? "In" : "Out" };
    }
  `;
  assert.equal(metadataLeak(cookieRead), "cookies");

  const headerAlias = `
    import { headers as readHeaders } from "next/headers";
    export const generateMetadata = async () => {
      const list = await readHeaders();
      return { title: list.get("user-agent") ?? "Page" };
    };
  `;
  assert.equal(metadataLeak(headerAlias), "headers");

  const libHelper = `
    import { getScreenTitle as screenTitle } from "@/lib/dashboard/nav";
    export async function generateMetadata(): Promise<Metadata> {
      return { title: screenTitle("/dashboard/brand") };
    }
  `;
  assert.equal(metadataLeak(libHelper), "lib binding screenTitle");

  const allowlisted = `
    import { formatMoney as money } from "@/lib/utils";
    export async function generateMetadata(): Promise<Metadata> {
      return { title: money(2500) };
    }
  `;
  assert.equal(metadataLeak(allowlisted), null);

  const search = `
    export const generateMetadata = async ({
      searchParams,
    }: {
      searchParams: Promise<{ q?: string }>;
    }) => {
      const { q } = await searchParams;
      const match = rows.find((row) => row.slug === q);
      return { title: match?.name ?? "Results" };
    };
  `;
  assert.equal(metadataLeak(search), "searchParams lookup");

  const searchUnread = `
    export async function generateMetadata({
      searchParams,
    }: {
      searchParams: Promise<{ q?: string }>;
    }): Promise<Metadata> {
      await searchParams;
      return { title: "Results" };
    }
  `;
  assert.equal(metadataLeak(searchUnread), null);

  const reexport = `
    export { campaignMetadata as generateMetadata } from "@/lib/seo/gated";
  `;
  assert.equal(metadataLeak(reexport), "re-exported generateMetadata");

  const reexportLocal = `
    import { generateMetadata } from "./campaign-meta";
    export { generateMetadata };
  `;
  assert.equal(metadataLeak(reexportLocal), "re-exported generateMetadata");
});
