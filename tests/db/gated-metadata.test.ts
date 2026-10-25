import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function generateMetadataBody(source: string): string | null {
  const start = source.search(/export\s+async\s+function\s+generateMetadata\b/);
  if (start < 0) return null;
  const head = source.slice(start);
  const signature = head.match(/export\s+async\s+function\s+generateMetadata\b[\s\S]*?\)\s*:\s*Promise<Metadata>\s*\{/);
  if (!signature || signature.index === undefined) return head;
  const open = start + signature.index + signature[0].length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

test("session-gated pages do not read the store from generateMetadata", () => {
  const appDir = path.join(process.cwd(), "app");
  const offenders: string[] = [];
  for (const file of walk(appDir)) {
    const source = readFileSync(file, "utf8");
    const body = generateMetadataBody(source);
    if (!body || !/\breadStore\b/.test(body)) continue;
    const gated = /\bgetSession\b/.test(source) && /\bredirect\s*\(/.test(source);
    if (gated) offenders.push(path.relative(process.cwd(), file));
  }
  assert.deepEqual(offenders, []);
});
