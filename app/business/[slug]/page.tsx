import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreatorReviewForm, CreatorTakedownButton } from "@/components/forms/directory-forms";
import { PublicChrome } from "@/components/public-chrome";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import {
  aggregateRating,
  appBase,
  businessFaqs,
  businessJsonLd,
  businessPath,
  directoryCategoryPath,
  faqJsonLd,
  isPublicListing,
  jsonLdScript,
  publicReviewsFor,
} from "@/lib/directory/public";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await readStore();
  const listing = store.businessListings.find((item) => item.slug === slug && isPublicListing(item));
  if (!listing) return { title: "Business", robots: { index: false, follow: false } };
  const title = `${listing.name} in ${listing.city}`;
  const description = listing.summary.replace(/\s+/g, " ").trim().slice(0, 160);
  const path = businessPath(listing.slug);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", siteName: "fweta" },
  };
}

function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (parsed.hostname.endsWith("youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] ?? null;
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await readStore();
  const listing = store.businessListings.find((item) => item.slug === slug && isPublicListing(item));
  if (!listing) notFound();
  const reviews = publicReviewsFor(store, listing);
  const names = new Map(store.profiles.map((profile) => [profile.id, profile.displayName]));
  const rating = aggregateRating(reviews);
  const faqs = businessFaqs(listing, reviews);
  const canonical = `${appBase()}${businessPath(listing.slug)}`;
  const session = await getSession();
  const isCreator = Boolean(session && (session.roles.includes("clipper") || session.roles.includes("influencer")));
  const ownReview = session ? store.creatorReviews.find((review) => review.businessId === listing.id && review.creatorId === session.id) : undefined;
  const graph = [businessJsonLd({ listing, reviews, creatorNames: names, canonical }), faqJsonLd(faqs)];

  return (
    <PublicChrome title={listing.name} description={`${listing.category} in ${listing.city}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(graph) }} />
      <p className="text-sm">
        <Link href="/directory" className="text-gold-deep hover:underline">
          Directory
        </Link>
        {" · "}
        <Link href={directoryCategoryPath(listing.city, listing.category)} className="text-gold-deep hover:underline">
          {listing.category} in {listing.city}
        </Link>
      </p>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed">{listing.summary}</p>
      <p className="mt-3 text-sm text-muted">
        {listing.address ? `${listing.address}, ${listing.city}` : listing.city}
        {rating ? ` · ${rating.ratingValue.toFixed(1)} out of 5 from ${rating.reviewCount} verified ${rating.reviewCount === 1 ? "review" : "reviews"}` : " · No published reviews yet"}
      </p>
      {listing.website ? (
        <p className="mt-2 text-sm">
          <a href={listing.website} className="text-gold-deep hover:underline">
            {listing.website.replace(/^https?:\/\//, "")}
          </a>
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-3xl tracking-tight">Verified creator reviews</h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No review is public yet. Reviews appear after the creator opts in and an admin publishes them.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {reviews.map((review) => {
              const video = review.postUrl ? youtubeId(review.postUrl) : null;
              return (
                <li key={review.id} className="panel p-5">
                  <p className="font-medium">{names.get(review.creatorId) || "Verified creator"}</p>
                  <p className="mt-1 text-sm text-muted">
                    {review.rating} out of 5 · {review.createdAt.slice(0, 10)}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed">{review.body}</p>
                  {review.postUrl ? (
                    <p className="mt-3 text-sm">
                      <a href={review.postUrl} className="text-gold-deep hover:underline">
                        Watch the linked post
                      </a>
                    </p>
                  ) : null}
                  {video ? (
                    <div className="mt-3 aspect-video overflow-hidden rounded-2xl bg-black">
                      <iframe
                        title={`Post by ${names.get(review.creatorId) || "creator"}`}
                        src={`https://www.youtube-nocookie.com/embed/${video}`}
                        className="h-full w-full"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl tracking-tight">Questions people ask</h2>
        <dl className="mt-4 space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-medium">{faq.question}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      {isCreator && session?.id !== listing.brandId ? (
        <section className="mt-10 max-w-xl">
          <h2 className="font-display text-3xl tracking-tight">Write a review</h2>
          <p className="mt-2 text-sm text-muted">It stays private until you opt in and an admin publishes it.</p>
          <div className="mt-4">
            <CreatorReviewForm businessId={listing.id} />
          </div>
          {ownReview && ownReview.status !== "taken_down" ? (
            <div className="mt-3">
              <CreatorTakedownButton reviewId={ownReview.id} />
            </div>
          ) : null}
        </section>
      ) : null}
    </PublicChrome>
  );
}
