import { readFileSync } from "node:fs";
import path from "node:path";

import { generateMetadata } from "../../app/influencers/[slug]/layout";
import BookInfluencerPage from "../../app/influencers/[slug]/book/page";
import PublicInfluencerPage from "../../app/influencers/[slug]/page";
import InfluencersPage from "../../app/influencers/page";
import BrandCreatorsPage from "../../app/dashboard/brand/creators/page";
import { InfluencerOffers } from "../../components/rewards/influencer-offers";

function isExpectedSignedOutStop(error: unknown): boolean {
  const digest =
    typeof error === "object" && error && "digest" in error
      ? String((error as { digest?: string }).digest)
      : "";
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("workUnitAsyncStorage") || message.includes("cookies");
}

async function render(fn: () => Promise<unknown>, allowSignedOutStop: boolean) {
  try {
    await fn();
  } catch (error) {
    if (!allowSignedOutStop || !isExpectedSignedOutStop(error)) throw error;
  }
}

async function main() {
  const dir = process.env.FWETA_DATA_DIR;
  if (!dir) throw new Error("FWETA_DATA_DIR is required");
  const file = path.join(dir, "store.json");
  const before = readFileSync(file);

  await render(() => InfluencersPage({ searchParams: Promise.resolve({}) }), false);
  await render(() => PublicInfluencerPage({ params: Promise.resolve({ slug: "missing-creator" }) }), true);
  await render(() => PublicInfluencerPage({ params: Promise.resolve({ slug: "hidden-clip-hidden" }) }), true);
  await render(() => BookInfluencerPage({ params: Promise.resolve({ slug: "missing-creator" }) }), true);
  await render(() => BrandCreatorsPage({ searchParams: Promise.resolve({}) }), true);
  await render(() => InfluencerOffers(), false);
  await render(() => generateMetadata({ params: Promise.resolve({ slug: "missing-creator" }) }), false);

  const after = readFileSync(file);
  if (!after.equals(before)) {
    throw new Error("signed-out page render changed store.json");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
