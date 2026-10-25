import assert from "node:assert/strict";
import test from "node:test";

import { securityHeaders } from "../../lib/security/headers";

function header(nodeEnv: string | undefined, supabaseUrl?: string) {
  return Object.fromEntries(securityHeaders({ nodeEnv, supabaseUrl }).map((item) => [item.key, item.value]));
}

test("security headers include an enforced CSP and the standard protections", () => {
  const prod = header("production", "https://abcd.supabase.co");
  assert.equal(prod["X-Content-Type-Options"], "nosniff");
  assert.equal(prod["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(prod["X-Frame-Options"], "DENY");
  assert.match(prod["Permissions-Policy"], /camera=\(\)/);
  assert.equal(prod["Strict-Transport-Security"], "max-age=31536000");
  assert.ok(prod["Content-Security-Policy"]);
  assert.equal(prod["Content-Security-Policy-Report-Only"], undefined);
  assert.match(prod["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(prod["Content-Security-Policy"], /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(prod["Content-Security-Policy"], /unsafe-eval/);
  assert.match(prod["Content-Security-Policy"], /upgrade-insecure-requests/);
  assert.match(prod["Content-Security-Policy"], /https:\/\/abcd\.supabase\.co/);
  assert.match(prod["Content-Security-Policy"], /https:\/\/www\.youtube-nocookie\.com/);
});

test("development CSP allows the dev overlay and skips HSTS", () => {
  const dev = header("development");
  assert.match(dev["Content-Security-Policy"], /unsafe-eval/);
  assert.match(dev["Content-Security-Policy"], /ws:/);
  assert.doesNotMatch(dev["Content-Security-Policy"], /upgrade-insecure-requests/);
  assert.equal(dev["Strict-Transport-Security"], undefined);
});
