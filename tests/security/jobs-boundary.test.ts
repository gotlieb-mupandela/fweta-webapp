import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

const JOB_EXPORTS = [
  "pollSubmissionViewsJob",
  "recalculateEarningsJob",
  "budgetAlertsJob",
  "settleRewardsJob",
] as const;

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) found.push(...walk(full));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function isUseServer(source: string): boolean {
  return /^\s*["']use server["'];?/m.test(source);
}

test("job functions are not exported from a use server file", () => {
  assert.equal(existsSync(path.join(root, "app/actions/jobs.ts")), false);

  const modulePath = path.join(root, "lib/jobs/submission-jobs.ts");
  const moduleSource = readFileSync(modulePath, "utf8");
  assert.equal(isUseServer(moduleSource), false);
  assert.match(moduleSource, /import "server-only"/);
  for (const name of JOB_EXPORTS) {
    assert.match(moduleSource, new RegExp(`export async function ${name}\\b`));
  }

  const useServerFiles = [...walk(path.join(root, "app")), ...walk(path.join(root, "lib"))].filter((file) =>
    isUseServer(readFileSync(file, "utf8")),
  );
  for (const file of useServerFiles) {
    const source = readFileSync(file, "utf8");
    for (const name of JOB_EXPORTS) {
      assert.equal(new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).test(source), false, file);
      assert.equal(new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(source), false, file);
    }
  }

  const poll = readFileSync(path.join(root, "app/api/jobs/poll-views/route.ts"), "utf8");
  const settle = readFileSync(path.join(root, "app/api/jobs/settle-rewards/route.ts"), "utf8");
  assert.match(poll, /authorizeCron/);
  assert.match(settle, /authorizeCron/);
  assert.match(poll, /from "@\/lib\/jobs\/submission-jobs"/);
  assert.match(settle, /from "@\/lib\/jobs\/submission-jobs"/);
  assert.equal(poll.includes("app/actions/jobs"), false);
  assert.equal(settle.includes("app/actions/jobs"), false);
});
