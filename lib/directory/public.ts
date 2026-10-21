import type { BusinessListing, CreatorReview, DatabaseStore } from "@/lib/db/types";

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "listing";
}

export function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.fweta.com").replace(/\/$/, "");
}

export function directoryCategoryPath(city: string, category: string): string {
  return `/directory/${slugify(city)}/${slugify(category)}`;
}

export function businessPath(slug: string): string {
  return `/business/${slug}`;
}

export function isPublicListing(listing: BusinessListing | undefined | null): listing is BusinessListing {
  return Boolean(listing && listing.status === "published" && listing.optInReviews);
}

export function isPublicReview(review: CreatorReview, listing: BusinessListing | undefined): boolean {
  if (!isPublicListing(listing)) return false;
  if (review.businessId !== listing.id) return false;
  if (review.status !== "published") return false;
  if (!review.creatorOptIn || !review.brandOptIn) return false;
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) return false;
  return review.body.trim().length >= 20;
}

export function publicBusinesses(store: DatabaseStore): BusinessListing[] {
  return store.businessListings.filter((listing) => isPublicListing(listing));
}

export function publicReviewsFor(store: DatabaseStore, listing: BusinessListing): CreatorReview[] {
  return store.creatorReviews
    .filter((review) => isPublicReview(review, listing))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function businessesInCategory(store: DatabaseStore, citySlug: string, categorySlug: string): BusinessListing[] {
  return publicBusinesses(store).filter(
    (listing) => slugify(listing.city) === citySlug && slugify(listing.category) === categorySlug,
  );
}

export type RatingSummary = { ratingValue: number; reviewCount: number };

export function aggregateRating(reviews: readonly Pick<CreatorReview, "rating">[]): RatingSummary | null {
  if (!reviews.length) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  const ratingValue = Math.round((total / reviews.length) * 10) / 10;
  return { ratingValue, reviewCount: reviews.length };
}

export type FaqItem = { question: string; answer: string };

export function businessFaqs(
  listing: BusinessListing,
  reviews: readonly CreatorReview[],
): FaqItem[] {
  const rating = aggregateRating(reviews);
  const newest = reviews[0]?.createdAt.slice(0, 10);
  const recommend = rating
    ? `${rating.reviewCount} verified creator ${rating.reviewCount === 1 ? "review is" : "reviews are"} published. The average rating is ${rating.ratingValue.toFixed(1)} out of 5.`
    : `No verified creator review of ${listing.name} is published yet.`;
  const recent = newest
    ? `The newest published review is dated ${newest}. Each review shows the creator name, the star rating, and the date it was written.`
    : "There is no published review date yet.";
  const where = listing.address
    ? `${listing.name} is in ${listing.city}. The listed address is ${listing.address}.`
    : `${listing.name} is listed in ${listing.city}. A street address is not published on this page.`;
  return [
    {
      question: `What is ${listing.name}?`,
      answer: `${listing.name} is a ${listing.category} business in ${listing.city}. ${listing.summary}`,
    },
    {
      question: `Where is ${listing.name}?`,
      answer: where,
    },
    {
      question: `Do verified creators recommend ${listing.name}?`,
      answer: recommend,
    },
    {
      question: `How recent are the reviews of ${listing.name}?`,
      answer: recent,
    },
  ];
}

export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function businessJsonLd(input: {
  listing: BusinessListing;
  reviews: CreatorReview[];
  creatorNames: Map<string, string>;
  canonical: string;
}): Record<string, unknown> {
  const rating = aggregateRating(input.reviews);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.listing.name,
    description: input.listing.summary,
    url: input.canonical,
    address: {
      "@type": "PostalAddress",
      addressLocality: input.listing.city,
      streetAddress: input.listing.address || undefined,
    },
  };
  if (input.listing.website) data.sameAs = input.listing.website;
  if (rating) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.ratingValue,
      reviewCount: rating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  data.review = input.reviews.map((review) => {
    const entry: Record<string, unknown> = {
      "@type": "Review",
      author: {
        "@type": "Person",
        name: input.creatorNames.get(review.creatorId) || "Verified creator",
      },
      datePublished: review.createdAt.slice(0, 10),
      reviewBody: review.body,
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
    };
    if (review.postUrl) entry.url = review.postUrl;
    return entry;
  });
  return data;
}

export function faqJsonLd(faqs: readonly FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function assertCanPublishListing(listing: BusinessListing) {
  if (listing.status === "taken_down") throw new Error("This listing was taken down.");
  if (!listing.optInReviews) throw new Error("The brand must opt in to public reviews first.");
  if (listing.name.trim().length < 2 || listing.city.trim().length < 2 || listing.category.trim().length < 2) {
    throw new Error("Name, city, and category are required.");
  }
  if (listing.summary.trim().length < 20) throw new Error("Add a plain-language summary before publishing.");
}

export function assertCanPublishReview(listing: BusinessListing, review: CreatorReview) {
  assertCanPublishListing(listing);
  if (listing.status !== "published") throw new Error("Publish the business listing first.");
  if (!review.creatorOptIn) throw new Error("The creator has not opted in.");
  if (!review.brandOptIn) throw new Error("The brand has not opted in.");
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    throw new Error("Rating must be from 1 to 5.");
  }
  if (review.body.trim().length < 20) throw new Error("Review must be at least 20 characters.");
}

export function uniqueSlug(store: DatabaseStore, name: string, ignoreId?: string): string {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (store.businessListings.some((listing) => listing.slug === slug && listing.id !== ignoreId)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

const DASH = /[\u2013\u2014]/;

export function hasDash(value: string): boolean {
  return DASH.test(value);
}
