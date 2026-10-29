import type { RateCardItem } from "@/lib/db/types";

export type NewRateCard = Omit<RateCardItem, "id" | "createdAt" | "updatedAt">;

/** Same card added again within this window counts as a double submit. */
export const RATE_CARD_DUPLICATE_WINDOW_MS = 15_000;

/**
 * Adds a rate card unless an identical one was added moments ago.
 * Call it inside the updateStore mutator: the compare-and-swap save reruns
 * it on the fresh document after a conflict, so two simultaneous requests
 * end with one card.
 */
export function addRateCardOnce(
  store: { rateCards: RateCardItem[] },
  card: NewRateCard,
  makeId: () => string,
  nowMs: number = Date.now(),
): { id: string; created: boolean } {
  const duplicate = store.rateCards.find((rate) => {
    if (rate.influencerProfileId !== card.influencerProfileId) return false;
    if (rate.title !== card.title || rate.type !== card.type) return false;
    if (rate.platform !== card.platform || rate.priceCents !== card.priceCents) return false;
    const age = nowMs - Date.parse(rate.createdAt);
    return Number.isFinite(age) && age >= 0 && age < RATE_CARD_DUPLICATE_WINDOW_MS;
  });
  if (duplicate) return { id: duplicate.id, created: false };
  const stamp = new Date(nowMs).toISOString();
  const item: RateCardItem = { ...card, id: makeId(), createdAt: stamp, updatedAt: stamp };
  store.rateCards.push(item);
  return { id: item.id, created: true };
}
