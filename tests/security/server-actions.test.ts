import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { isUseServerModule, readRepo, repoRoot, serverActions } from "./scan-actions";

// Password reset runs logged out by design. It is gated by a signed single-use token and a rate limit (PR 53).
const PUBLIC_ACTIONS = new Set([
  "loginAction",
  "signupAction",
  "logoutAction",
  "requestPasswordResetAction",
  "resetPasswordAction",
]);
const GATES = ["requireSession(", "getSession(", "verifyPrefsToken("];
const FORBIDDEN = [
  "settleRewardsJob",
  "recalculateEarningsJob",
  "pollSubmissionViewsJob",
  "budgetAlertsJob",
  "ensureDiscoverableCreators",
];

test("every exported server action checks a session, a role, or an email token", () => {
  const actions = serverActions();
  assert.ok(actions.length > 20);
  const open = actions.filter(
    (action) => !PUBLIC_ACTIONS.has(action.name) && !GATES.some((gate) => action.body.includes(gate)),
  );
  assert.deepEqual(
    open.map((action) => `${action.file} ${action.name}`),
    [],
  );
});

test("job and discoverable writers are not exported server actions", () => {
  const actions = serverActions();
  const names = new Set(actions.map((action) => action.name));
  for (const forbidden of FORBIDDEN) {
    assert.equal(names.has(forbidden), false, forbidden);
  }
  assert.equal(fs.existsSync(path.join(repoRoot, "app/actions/jobs.ts")), false);
  assert.equal(readRepo("app/actions/influencer.ts").includes("ensureDiscoverableCreators"), false);
  assert.equal(readRepo("lib/influencers/public.ts").includes("updateStore"), false);
  assert.equal(isUseServerModule(readRepo("lib/auth/session.ts")), false);
  for (const relative of [
    "lib/jobs/settle-rewards.ts",
    "lib/jobs/recalculate-earnings.ts",
    "lib/jobs/poll-submission-views.ts",
    "lib/jobs/budget-alerts.ts",
    "lib/influencers/discoverable.ts",
  ]) {
    assert.equal(isUseServerModule(readRepo(relative)), false, relative);
  }
});
