import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidTokenInput,
  pageParam,
  readPreferencesForm,
  readUnsubscribeForm,
} from "../../lib/email/preference-form";

const form = (values: Record<string, unknown>) => ({ get: (name: string) => values[name] ?? null });

test("preference form rejects malformed input without throwing", () => {
  for (const bad of [undefined, null, "x", 42, {}, [], { get: "no" }, { get: () => { throw new Error("boom"); } }]) {
    assert.equal(readPreferencesForm(bad), null);
    assert.equal(readUnsubscribeForm(bad), null);
  }
  assert.equal(readPreferencesForm(form({ token: { a: 1 } })), null);
  assert.equal(readPreferencesForm(form({ token: "t".repeat(5000) })), null);
});

test("preference form reads a good form", () => {
  assert.deepEqual(readPreferencesForm(form({ token: "abc", notifyEmail: "on" })), {
    token: "abc",
    notifyEmail: true,
    notifyWithdrawals: false,
    notifyBookings: false,
  });
  const fd = new FormData();
  fd.set("token", "abc");
  fd.set("scope", "bookings");
  assert.deepEqual(readUnsubscribeForm(fd), { token: "abc", scope: "bookings" });
  fd.set("scope", "everything");
  assert.equal(readUnsubscribeForm(fd), null);
});

test("token and page params are checked", () => {
  assert.equal(isValidTokenInput(""), false);
  assert.equal(isValidTokenInput(undefined), false);
  assert.equal(isValidTokenInput({}), false);
  assert.equal(isValidTokenInput("abc"), true);
  assert.equal(pageParam(["a", "b"]), "a");
  assert.equal(pageParam(undefined), "");
  assert.equal(pageParam({}), "");
});
