import type { UserRole } from "@/types/enums";
import type { BusinessListing, CreatorReview, DatabaseStore } from "@/lib/db/types";
import { assertCanPublishListing, assertCanPublishReview, uniqueSlug } from "@/lib/directory/public";

export type DirectoryActor = {
  id: string;
  roles: readonly UserRole[];
};

export type DirectoryClock = {
  id: () => string;
  now: () => string;
};

export type ListingInput = {
  name: string;
  city: string;
  category: string;
  summary: string;
  website: string;
  address: string;
  optInReviews: boolean;
};

function cleanListing(input: ListingInput) {
  const name = input.name.trim();
  const city = input.city.trim();
  const category = input.category.trim();
  const summary = input.summary.trim();
  const address = input.address.trim();
  const website = input.website.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Business name must be 2 to 120 characters.");
  if (city.length < 2 || city.length > 80) throw new Error("Enter a city.");
  if (category.length < 2 || category.length > 80) throw new Error("Enter a category.");
  if (summary.length < 20 || summary.length > 2000) throw new Error("Summary must be 20 to 2000 characters.");
  if (address.length > 200) throw new Error("Address is too long.");
  let websiteUrl: string | null = null;
  if (website) {
    let parsed: URL;
    try {
      parsed = new URL(website);
    } catch {
      throw new Error("Website must be a full https link.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Website must be a full https link.");
    websiteUrl = parsed.toString();
  }
  return { name, city, category, summary, address: address || null, website: websiteUrl };
}

export function saveListing(
  store: DatabaseStore,
  actor: DirectoryActor,
  input: ListingInput & { listingId?: string | null },
  clock: DirectoryClock,
): BusinessListing {
  if (!actor.roles.includes("brand")) throw new Error("Brand role required.");
  const clean = cleanListing(input);
  const now = clock.now();
  if (input.listingId) {
    const listing = store.businessListings.find((item) => item.id === input.listingId && item.brandId === actor.id);
    if (!listing) throw new Error("Listing not found.");
    if (listing.status === "taken_down") throw new Error("This listing was taken down. Ask an admin to review it.");
    listing.name = clean.name;
    listing.city = clean.city;
    listing.category = clean.category;
    listing.summary = clean.summary;
    listing.address = clean.address;
    listing.website = clean.website;
    listing.optInReviews = input.optInReviews;
    if (listing.status === "draft") listing.slug = uniqueSlug(store, clean.name, listing.id);
    listing.updatedAt = now;
    stampBrandOptIn(store, listing);
    if (listing.status === "published" && listing.optInReviews) assertCanPublishListing(listing);
    return listing;
  }
  const listing: BusinessListing = {
    id: clock.id(),
    brandId: actor.id,
    slug: uniqueSlug(store, clean.name),
    name: clean.name,
    city: clean.city,
    category: clean.category,
    summary: clean.summary,
    website: clean.website,
    address: clean.address,
    optInReviews: input.optInReviews,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  store.businessListings.push(listing);
  return listing;
}

function stampBrandOptIn(store: DatabaseStore, listing: BusinessListing) {
  for (const review of store.creatorReviews) {
    if (review.businessId !== listing.id) continue;
    if (review.status === "taken_down" || review.status === "rejected") continue;
    review.brandOptIn = listing.optInReviews;
    if (!listing.optInReviews && review.status === "published") review.status = "pending";
    review.updatedAt = listing.updatedAt;
  }
}

export function submitReview(
  store: DatabaseStore,
  actor: DirectoryActor,
  input: { businessId: string; rating: number; body: string; postUrl: string; creatorOptIn: boolean },
  clock: DirectoryClock,
): CreatorReview {
  if (!actor.roles.includes("clipper") && !actor.roles.includes("influencer")) {
    throw new Error("Creator role required.");
  }
  const listing = store.businessListings.find((item) => item.id === input.businessId);
  if (!listing || listing.status === "taken_down") throw new Error("Business not found.");
  if (listing.brandId === actor.id) throw new Error("You cannot review your own business.");
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error("Rating must be from 1 to 5.");
  const body = input.body.trim();
  if (body.length < 20 || body.length > 2000) throw new Error("Review must be 20 to 2000 characters.");
  let postUrl: string | null = null;
  if (input.postUrl.trim()) {
    let parsed: URL;
    try {
      parsed = new URL(input.postUrl.trim());
    } catch {
      throw new Error("Post link must be a full URL.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Post link must be a full URL.");
    postUrl = parsed.toString();
  }
  const existing = store.creatorReviews.find(
    (review) => review.businessId === listing.id && review.creatorId === actor.id && review.status !== "rejected",
  );
  const now = clock.now();
  if (existing) {
    existing.rating = input.rating;
    existing.body = body;
    existing.postUrl = postUrl;
    existing.creatorOptIn = input.creatorOptIn;
    existing.brandOptIn = listing.optInReviews;
    if (existing.status === "published") existing.status = "pending";
    existing.updatedAt = now;
    return existing;
  }
  const review: CreatorReview = {
    id: clock.id(),
    businessId: listing.id,
    creatorId: actor.id,
    rating: input.rating,
    body,
    postUrl,
    creatorOptIn: input.creatorOptIn,
    brandOptIn: listing.optInReviews,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  store.creatorReviews.push(review);
  return review;
}

export function creatorTakedown(store: DatabaseStore, actor: DirectoryActor, reviewId: string, clock: DirectoryClock) {
  const review = store.creatorReviews.find((item) => item.id === reviewId && item.creatorId === actor.id);
  if (!review) throw new Error("Review not found.");
  review.status = "taken_down";
  review.creatorOptIn = false;
  review.updatedAt = clock.now();
  return review;
}

export function moderateListing(
  store: DatabaseStore,
  actor: DirectoryActor,
  listingId: string,
  action: "publish" | "takedown" | "draft",
  clock: DirectoryClock,
) {
  if (!actor.roles.includes("admin")) throw new Error("Admin role required.");
  const listing = store.businessListings.find((item) => item.id === listingId);
  if (!listing) throw new Error("Listing not found.");
  if (action === "publish") {
    assertCanPublishListing(listing);
    listing.status = "published";
  } else if (action === "takedown") {
    listing.status = "taken_down";
  } else {
    listing.status = "draft";
  }
  listing.updatedAt = clock.now();
  return listing;
}

export function moderateReview(
  store: DatabaseStore,
  actor: DirectoryActor,
  reviewId: string,
  action: "publish" | "reject" | "takedown",
  clock: DirectoryClock,
) {
  if (!actor.roles.includes("admin")) throw new Error("Admin role required.");
  const review = store.creatorReviews.find((item) => item.id === reviewId);
  if (!review) throw new Error("Review not found.");
  const listing = store.businessListings.find((item) => item.id === review.businessId);
  if (!listing) throw new Error("Business not found.");
  if (action === "publish") {
    assertCanPublishReview(listing, review);
    review.status = "published";
  } else if (action === "reject") {
    review.status = "rejected";
  } else {
    review.status = "taken_down";
  }
  review.updatedAt = clock.now();
  return review;
}
