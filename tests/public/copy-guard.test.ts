import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const root = new URL("../../", import.meta.url).pathname;
const sources = ["app", "lib", "components"].flatMap((dir) => files(join(root, dir)));

test("no em dashes in app, lib, or components", () => {
  const hits = sources.filter((path) => readFileSync(path, "utf8").includes("\u2014"));
  assert.deepEqual(hits, []);
});

test("no local demo text in server messages", () => {
  const hits = sources
    .filter((path) => path.includes(`${join("app", "actions")}`))
    .filter((path) => /demo only/i.test(readFileSync(path, "utf8")));
  assert.deepEqual(hits, []);
});
