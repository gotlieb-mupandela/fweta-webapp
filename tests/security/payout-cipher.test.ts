import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptSecret,
  decryptWithPayoutKey,
  encryptSecret,
  encryptWithPayoutKey,
  reencryptLegacyCiphertext,
  reencryptStoreSecrets,
} from "../../lib/security/payout-cipher";

const AUTH = "auth-secret-value-that-is-long-enough";
const PAYOUT = "payout-secret-value-that-is-long-enough";

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function withPayoutEnv(fn: () => void) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PHASE: process.env.NEXT_PHASE,
    AUTH_SECRET: process.env.AUTH_SECRET,
    PAYOUT_ENCRYPTION_KEY: process.env.PAYOUT_ENCRYPTION_KEY,
  };
  setEnv("NODE_ENV", "production");
  setEnv("VERCEL", undefined);
  setEnv("VERCEL_ENV", undefined);
  setEnv("NEXT_PHASE", undefined);
  setEnv("AUTH_SECRET", AUTH);
  setEnv("PAYOUT_ENCRYPTION_KEY", PAYOUT);
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) setEnv(key, value);
  }
}

test("legacy AUTH_SECRET ciphertext decrypts and the next write uses the payout key", () => {
  const legacy = encryptWithPayoutKey("0621234567", AUTH);
  withPayoutEnv(() => {
    assert.equal(decryptSecret(legacy), "0621234567");
    assert.equal(decryptWithPayoutKey(legacy, PAYOUT), null);

    const rewritten = reencryptLegacyCiphertext(legacy);
    assert.notEqual(rewritten, legacy);
    assert.equal(decryptWithPayoutKey(rewritten, PAYOUT), "0621234567");
    assert.equal(decryptWithPayoutKey(rewritten, AUTH), null);
    assert.equal(reencryptLegacyCiphertext(rewritten), rewritten);

    const fresh = encryptSecret("0621234567");
    assert.equal(decryptSecret(fresh), "0621234567");
    assert.equal(decryptWithPayoutKey(fresh, AUTH), null);

    const store = {
      payoutMethods: [{ accountNumberEnc: legacy }],
      profiles: [{ kyc: { idNumberEnc: encryptWithPayoutKey("id-88", AUTH) } }],
    };
    reencryptStoreSecrets(store);
    assert.equal(decryptWithPayoutKey(store.payoutMethods[0].accountNumberEnc, PAYOUT), "0621234567");
    assert.equal(decryptWithPayoutKey(store.profiles[0].kyc?.idNumberEnc ?? "", PAYOUT), "id-88");
  });
});
