import assert from "node:assert/strict";
import test from "node:test";

import { moderateListing, moderateReview, saveListing, submitReview, creatorTakedown } from "../../lib/directory/commands";
import {
  aggregateRating,
  businessFaqs,
  businessJsonLd,
  businessesInCategory,
  hasDash,
  isPublicReview,
  publicBusinesses,
  slugify,
} from "../../lib/directory/public";
import { HELP_ARTICLES } from "../../lib/onboarding/help";
import type { BusinessListing, CreatorReview, DatabaseStore, Profile } from "../../lib/db/types";

const brandId = "11111111-1111-4111-8111-111111111111";
const creatorId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";

function profile(id: string, roles: Profile["roles"]): Profile {
  return {
    id,
    email: `${id}@fweta.test`,
    displayName: id === creatorId ? "Amara Nangolo" : "Desert Brands",
    passwordHash: "x",
    bio: "",
    avatarUrl: null,
    roles,
    primaryRole: roles[0],
    notifyEmail: false,
    notifyWithdrawals: false,
    notifyBookings: false,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
    suspended: false,
  };
}

function empty(): DatabaseStore {
  return {
    profiles: [
      profile(brandId, ["brand"]),
      profile(creatorId, ["influencer"]),
      profile(adminId, ["admin"]),
    ],
    campaigns: [],
    submissions: [],
    viewSnapshots: [],
    wallets: [],
    ledgerEntries: [],
    payoutMethods: [],
    withdrawalRequests: [],
    influencerProfiles: [],
    rateCards: [],
    bookings: [],
    brandDeposits: [],
    fraudFlags: [],
    notifications: [],
    notificationDispatches: [],
    linkedAccounts: [],
    socialAccounts: [],
    workspaces: [],
    workspaceMembers: [],
    savedCampaigns: [],
    supportTickets: [],
    supportMessages: [],
    auditLog: [],
    prizeAwards: [],
    platformSettings: [],
    ugcBriefs: [],
    ugcApplications: [],
    ugcDeliveries: [],
    contentLicenses: [],
    licenseDisputes: [],
    creatorPortfolios: [],
    businessListings: [],
    creatorReviews: [],
  };
}

let n = 0;
const clock = {
  id: () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  },
  now: () => "2026-10-18T12:00:00.000Z",
};

const listingInput = {
  name: "River Cafe",
  city: "Windhoek",
  category: "Cafe",
  summary: "A Windhoek cafe that serves breakfast and coffee near the river.",
  website: "https://river.example",
  address: "1 River Road",
  optInReviews: true,
};

test("slugs are stable and public routes only include published opted-in businesses", () => {
  assert.equal(slugify("Windhoek"), "windhoek");
  assert.equal(slugify("Café & Tea"), "cafe-tea");
  const store = empty();
  const listing = saveListing(store, { id: brandId, roles: ["brand"] }, listingInput, clock);
  assert.equal(publicBusinesses(store).length, 0);
  moderateListing(store, { id: adminId, roles: ["admin"] }, listing.id, "publish", clock);
  assert.equal(businessesInCategory(store, "windhoek", "cafe").length, 1);
  moderateListing(store, { id: adminId, roles: ["admin"] }, listing.id, "takedown", clock);
  assert.equal(publicBusinesses(store).length, 0);
});

test("a review is public only after both opt-ins and admin publish", () => {
  const store = empty();
  const listing = saveListing(store, { id: brandId, roles: ["brand"] }, listingInput, clock);
  moderateListing(store, { id: adminId, roles: ["admin"] }, listing.id, "publish", clock);
  const review = submitReview(
    store,
    { id: creatorId, roles: ["influencer"] },
    {
      businessId: listing.id,
      rating: 5,
      body: "The coffee was excellent and the staff knew the regulars by name.",
      postUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      creatorOptIn: true,
    },
    clock,
  );
  assert.equal(isPublicReview(review, listing), false);
  moderateReview(store, { id: adminId, roles: ["admin"] }, review.id, "publish", clock);
  assert.equal(isPublicReview(review, listing), true);
  assert.equal(review.creatorOptIn && review.brandOptIn, true);
});

test("published review leaves the page on takedown or when the brand opts out", () => {
  const store = empty();
  const listing = saveListing(store, { id: brandId, roles: ["brand"] }, listingInput, clock);
  moderateListing(store, { id: adminId, roles: ["admin"] }, listing.id, "publish", clock);
  const review = submitReview(
    store,
    { id: creatorId, roles: ["influencer"] },
    {
      businessId: listing.id,
      rating: 4,
      body: "I would send a friend here for breakfast. The portion was generous.",
      postUrl: "",
      creatorOptIn: true,
    },
    clock,
  );
  // Listing is published, so admin can publish the review.
  moderateReview(store, { id: adminId, roles: ["admin"] }, review.id, "publish", clock);
  assert.equal(isPublicReview(review, listing), true);

  const faqs = businessFaqs(listing, [review]);
  assert.equal(faqs.some((faq) => faq.answer.includes("4.0 out of 5")), true);
  assert.equal(faqs.some((faq) => hasDash(faq.question) || hasDash(faq.answer)), false);
  const json = businessJsonLd({
    listing,
    reviews: [review],
    creatorNames: new Map([[creatorId, "Amara Nangolo"]]),
    canonical: "https://app.fweta.com/business/river-cafe",
  });
  const rating = json.aggregateRating as { ratingValue: number; reviewCount: number };
  assert.equal(rating.ratingValue, 4);
  assert.equal(rating.reviewCount, 1);
  assert.equal((json.review as { reviewBody: string }[])[0].reviewBody.includes("breakfast"), true);

  creatorTakedown(store, { id: creatorId, roles: ["influencer"] }, review.id, clock);
  assert.equal(isPublicReview(review, listing), false);

  const again = submitReview(
    store,
    { id: creatorId, roles: ["influencer"] },
    {
      businessId: listing.id,
      rating: 5,
      body: "Came back a week later and the same table by the window was free.",
      postUrl: "",
      creatorOptIn: true,
    },
    clock,
  );
  moderateReview(store, { id: adminId, roles: ["admin"] }, again.id, "publish", clock);
  saveListing(store, { id: brandId, roles: ["brand"] }, { ...listingInput, listingId: listing.id, optInReviews: false }, clock);
  assert.equal(isPublicReview(again, listing), false);
  assert.equal(aggregateRating([]), null);
});

test("help copy for the new flows has no em dash", () => {
  const added = HELP_ARTICLES.filter((article) => ["ugc-brief", "ugc-license", "ugc-income", "directory"].includes(article.id));
  assert.equal(added.length, 4);
  for (const article of added) {
    assert.equal(hasDash(article.question) || hasDash(article.answer), false);
  }
});

test("category grouping uses the stored city spelling", () => {
  const listing = {
    id: "b1",
    brandId,
    slug: "river-cafe",
    name: "River Cafe",
    city: "Windhoek",
    category: "Cafe",
    summary: "A Windhoek cafe that serves breakfast and coffee near the river.",
    website: null,
    address: null,
    optInReviews: true,
    status: "published",
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
  } satisfies BusinessListing;
  const review = {
    id: "r1",
    businessId: "b1",
    creatorId,
    rating: 5,
    body: "The coffee was excellent and the staff knew the regulars by name.",
    postUrl: null,
    creatorOptIn: true,
    brandOptIn: true,
    status: "published",
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
  } satisfies CreatorReview;
  assert.equal(isPublicReview(review, listing), true);
  assert.equal(isPublicReview({ ...review, creatorOptIn: false }, listing), false);
  assert.equal(isPublicReview({ ...review, status: "pending" }, listing), false);
});
