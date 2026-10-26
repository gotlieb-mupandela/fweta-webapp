import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../../app/api/webhooks/route";

test("POST /api/webhooks rejects gateway posts", async () => {
  const response = await POST();
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "Not found");
});
