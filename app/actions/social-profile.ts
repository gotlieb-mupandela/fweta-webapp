"use server";

import { requireSession } from "@/lib/auth/session";
import { lookupPublicProfile } from "@/lib/onboarding/profile-html";
import { normalizeSocialProfileUrl, profileLookupMessage } from "@/lib/social/profile-url";
import { socialPlatformSchema } from "@/lib/validations/shared";
import { z } from "zod";

const previewSchema = z.object({
  platform: socialPlatformSchema,
  value: z.string().max(500),
});

/**
 * Confirms a profile link. The returned url is only the normalised user input.
 * A blocked or error response never becomes that url.
 */
export async function previewSocialProfileAction(raw: unknown): Promise<
  | { ok: true; url: string; verified: boolean; message: string | null; attempted: boolean }
  | { ok: false; message: string }
> {
  await requireSession();
  const parsed = previewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Enter a profile link or @handle." };

  const normalized = normalizeSocialProfileUrl(parsed.data.platform, parsed.data.value);
  if (!normalized.ok) return { ok: false, message: normalized.message };
  if (!normalized.url) return { ok: true, url: "", verified: false, message: null, attempted: false };

  const lookup = await lookupPublicProfile(normalized.url, 2500);
  const outcome = profileLookupMessage(parsed.data.platform, normalized.handle, lookup);
  return {
    ok: true,
    url: normalized.url,
    verified: outcome.verified,
    message: outcome.message,
    attempted: lookup.attempted,
  };
}
