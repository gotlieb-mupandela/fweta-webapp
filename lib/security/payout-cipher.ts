import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

import { getLegacyPayoutSecret, getPayoutSecret } from "@/lib/auth/secret";

const SALT = "fweta-payout-salt";

function deriveKey(secret: string) {
  // Same scrypt parameters as before so existing ciphertext still decrypts.
  return scryptSync(secret, SALT, 32);
}

/** Encrypt with an explicit key. Tests use this to build legacy ciphertext. */
export function encryptWithPayoutKey(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Returns null when the key does not open the payload. */
export function decryptWithPayoutKey(payload: string, secret: string): string | null {
  try {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function encryptSecret(plain: string): string {
  return encryptWithPayoutKey(plain, getPayoutSecret());
}

/**
 * Try PAYOUT_ENCRYPTION_KEY first, then the legacy AUTH_SECRET key.
 * This does not write. Callers re-encrypt on the next store write.
 */
export function decryptSecret(payload: string): string {
  const current = getPayoutSecret();
  const primary = decryptWithPayoutKey(payload, current);
  if (primary !== null) return primary;

  const legacy = getLegacyPayoutSecret();
  if (legacy && legacy !== current) {
    const opened = decryptWithPayoutKey(payload, legacy);
    if (opened !== null) return opened;
  }
  throw new Error("Could not decrypt payout details.");
}

/**
 * Leave current-key ciphertext unchanged. Rewrite legacy AUTH_SECRET
 * ciphertext with PAYOUT_ENCRYPTION_KEY. Unreadable payloads are kept.
 */
export function reencryptLegacyCiphertext(payload: string): string {
  const current = getPayoutSecret();
  if (decryptWithPayoutKey(payload, current) !== null) return payload;
  const legacy = getLegacyPayoutSecret();
  if (!legacy || legacy === current) return payload;
  const plain = decryptWithPayoutKey(payload, legacy);
  if (plain === null) return payload;
  return encryptWithPayoutKey(plain, current);
}

type SecretStore = {
  payoutMethods: { accountNumberEnc: string }[];
  profiles: { kyc?: { idNumberEnc: string } | null }[];
};

/** Rewrite legacy bank and ID ciphertext in a store draft before it is saved. */
export function reencryptStoreSecrets(store: SecretStore): void {
  for (const method of store.payoutMethods) {
    if (method.accountNumberEnc) {
      method.accountNumberEnc = reencryptLegacyCiphertext(method.accountNumberEnc);
    }
  }
  for (const profile of store.profiles) {
    if (profile.kyc?.idNumberEnc) {
      profile.kyc.idNumberEnc = reencryptLegacyCiphertext(profile.kyc.idNumberEnc);
    }
  }
}
