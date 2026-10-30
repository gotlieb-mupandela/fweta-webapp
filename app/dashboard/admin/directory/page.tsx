import Link from "next/link";
import { redirect } from "next/navigation";

import { ListingModeration, ReviewModeration } from "@/components/forms/directory-forms";
import { Badge, PageHeader, SectionHeader } from "@/components/ui/card";
import { ContextHelp } from "@/components/onboarding/context-help";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function AdminDirectoryPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const listings = [...store.businessListings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const reviews = [...store.creatorReviews].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Directory moderation"
        description="Publish a business only after the brand opts in. Publish a review only after the creator opts in too."
      />
      <ContextHelp
        title="Takedown removes it from public pages"
        body="Taken down listings and reviews stay in this queue. They are left out of the directory, the sitemap, and the business page."
      />
      <section>
        <SectionHeader title="Businesses" />
        {listings.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-6 text-sm text-muted shadow-[var(--shadow-card)]">No listings yet.</p>
        ) : (
          <ul className="space-y-3">
            {listings.map((listing) => (
              <li key={listing.id} className="panel p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{listing.name}</p>
                  <Badge tone={listing.status === "published" ? "success" : "muted"}>{listing.status}</Badge>
                  <Badge tone={listing.optInReviews ? "gold" : "muted"}>
                    {listing.optInReviews ? "Reviews opted in" : "Reviews off"}
                  </Badge>
                </div>
                <p className="mt-1 text-muted">
                  {listing.city} · {listing.category}
                </p>
                <p className="mt-2">{listing.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <ListingModeration listingId={listing.id} status={listing.status} />
                  {listing.status === "published" ? (
                    <Link href={`/business/${listing.slug}`} className="text-xs text-gold-deep hover:underline">
                      Public page
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <SectionHeader title="Reviews" />
        {reviews.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-6 text-sm text-muted shadow-[var(--shadow-card)]">No reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => {
              const listing = store.businessListings.find((item) => item.id === review.businessId);
              const creator = store.profiles.find((profile) => profile.id === review.creatorId);
              return (
                <li key={review.id} className="panel p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{listing?.name ?? "Business"}</p>
                    <Badge tone="muted">{review.status}</Badge>
                    <span className="text-muted">{review.rating} out of 5</span>
                  </div>
                  <p className="mt-1 text-muted">
                    {creator?.displayName ?? "Creator"} · creator opt-in {review.creatorOptIn ? "yes" : "no"} · brand opt-in {review.brandOptIn ? "yes" : "no"} · {review.createdAt.slice(0, 10)}
                  </p>
                  <p className="mt-2">{review.body}</p>
                  {review.postUrl ? (
                    <a href={review.postUrl} className="mt-2 inline-block text-gold-deep hover:underline">
                      Linked post
                    </a>
                  ) : null}
                  <div className="mt-3">
                    <ReviewModeration reviewId={review.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
