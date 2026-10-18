import Link from "next/link";
import { redirect } from "next/navigation";

import { BusinessListingForm } from "@/components/forms/directory-forms";
import { Badge, PageHeader, SectionHeader } from "@/components/ui/card";
import { ContextHelp } from "@/components/onboarding/context-help";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function BrandDirectoryPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const listings = store.businessListings.filter((item) => item.brandId === session.id);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Business page"
        description="Opt in if you want approved creator reviews on a public, indexable page."
      />
      <ContextHelp
        title="Nothing is public until an admin publishes it"
        body="Turn on creator reviews, write a plain summary, and save. An admin publishes the listing. Reviews also wait for the creator to opt in and for an admin to publish them. You can turn reviews off later, which pulls them from the public page."
      />
      {listings.length === 0 ? <BusinessListingForm /> : null}
      <ul className="space-y-6">
        {listings.map((listing) => (
          <li key={listing.id} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={listing.status === "published" ? "success" : "muted"}>{listing.status}</Badge>
              {listing.status === "published" ? (
                <Link href={`/business/${listing.slug}`} className="text-sm text-gold-deep hover:underline">
                  View public page
                </Link>
              ) : null}
            </div>
            <BusinessListingForm
              listing={{
                id: listing.id,
                name: listing.name,
                city: listing.city,
                category: listing.category,
                summary: listing.summary,
                website: listing.website ?? "",
                address: listing.address ?? "",
                optInReviews: listing.optInReviews,
              }}
            />
            <section>
              <SectionHeader title="Reviews on this listing" />
              <ul className="space-y-2 text-sm">
                {store.creatorReviews.filter((review) => review.businessId === listing.id).length === 0 ? (
                  <li className="text-muted">No reviews yet.</li>
                ) : (
                  store.creatorReviews
                    .filter((review) => review.businessId === listing.id)
                    .map((review) => {
                      const creator = store.profiles.find((profile) => profile.id === review.creatorId);
                      return (
                        <li key={review.id} className="list-row">
                          <div>
                            <p className="font-medium">{creator?.displayName ?? "Creator"}</p>
                            <p className="text-xs text-muted">
                              {review.status} · {review.rating} out of 5 · creator opt-in {review.creatorOptIn ? "yes" : "no"}
                            </p>
                          </div>
                        </li>
                      );
                    })
                )}
              </ul>
            </section>
          </li>
        ))}
      </ul>
      {listings.length > 0 ? (
        <section>
          <SectionHeader title="Another location" />
          <BusinessListingForm idPrefix="new-biz" />
        </section>
      ) : null}
    </div>
  );
}
