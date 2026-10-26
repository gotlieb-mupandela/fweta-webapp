import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { recoverFromError, recoverGlobalError } from "@/lib/errors/recover-global-error";

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (full.endsWith("layout.tsx")) files.push(full);
  }
  return files;
}

function firstTitleIsString(source: string): boolean {
  const start = source.indexOf("export const metadata");
  if (start < 0) return false;
  const match = source.slice(start, start + 600).match(/title:\s*(\{|["'])/);
  return Boolean(match && match[1] !== "{");
}

test("nested layouts keep a fweta title template", () => {
  const appDir = path.join(process.cwd(), "app");
  const offenders: string[] = [];
  for (const file of walk(appDir)) {
    if (file === path.join(appDir, "layout.tsx")) continue;
    const source = readFileSync(file, "utf8");
    if (firstTitleIsString(source)) offenders.push(path.relative(process.cwd(), file));
    if (source.includes("export const metadata") && source.includes("title:")) {
      assert.match(source, /template:\s*"%s · Fweta"/, path.relative(process.cwd(), file));
    }
  }
  assert.deepEqual(offenders, []);
});

test("global error recovery refreshes when the router is mounted", () => {
  const calls: string[] = [];
  recoverGlobalError(
    () => calls.push("reset"),
    () => calls.push("refresh"),
    () => calls.push("reload"),
  );
  assert.deepEqual(calls, ["refresh", "reset"]);
});

test("global error recovery reloads when the router is missing", () => {
  const calls: string[] = [];
  recoverGlobalError(
    () => calls.push("reset"),
    undefined,
    () => calls.push("reload"),
  );
  assert.deepEqual(calls, ["reset", "reload"]);
});

test("shared recovery refreshes when the router is mounted", () => {
  const calls: string[] = [];
  recoverFromError(
    () => calls.push("reset"),
    { refresh: () => calls.push("refresh") },
    () => calls.push("reload"),
  );
  assert.deepEqual(calls, ["refresh", "reset"]);
});

test("shared recovery reloads when the router is unavailable", () => {
  const calls: string[] = [];
  recoverFromError(
    () => calls.push("reset"),
    null,
    () => calls.push("reload"),
  );
  assert.deepEqual(calls, ["reset", "reload"]);
});

test("segment and global error pages share router-safe recovery", () => {
  const helper = readFileSync(path.join(process.cwd(), "components/errors/try-again.tsx"), "utf8");
  assert.match(helper, /recoverFromError\(reset,\s*router\)/);
  assert.match(helper, /recoverFromError\(this\.props\.reset,\s*null\)/);

  const globalError = readFileSync(path.join(process.cwd(), "app/global-error.tsx"), "utf8");
  assert.match(globalError, /<title>Something went wrong · Fweta<\/title>/);
  assert.match(globalError, /Fweta hit an unexpected error\. Try again, or go back home\./);
  assert.match(globalError, />fweta</);
  assert.doesNotMatch(globalError, /\u2014/);

  for (const rel of ["app/error.tsx", "app/dashboard/error.tsx", "app/global-error.tsx"]) {
    const source = readFileSync(path.join(process.cwd(), rel), "utf8");
    assert.match(source, /<TryAgain\s+reset=\{reset\}\s*\/>/, rel);
    assert.doesNotMatch(source, /onClick=\{\(\)\s*=>\s*reset\(\)\}/, rel);
  }
});
