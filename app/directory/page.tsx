import type { Metadata } from "next";
import Link from "next/link";

import { PublicChrome } from "@/components/public-chrome";
import { EmptyState } from "@/components/ui/card";
import { readStore } from "@/lib/db/store";
import { aggregateRating, directoryCategoryPath, publicBusinesses, publicReviewsFor } from "@/lib/directory/public";

export const metadata: Metadata = {
  title: "Creator trust directory",
  description: "Businesses in Namibia and SADC with reviews from verified fweta creators.",
  alternates: { canonical: "/directory" },
  openGraph: {
    title: "Creator trust directory",
    description: "Businesses with reviews from verified fweta creators.",
    url: "/directory",
  },
};

export default async function DirectoryPage() {
  const store = await readStore();
  const listings = publicBusinesses(store);
  const groups = new Map<string, { city: string; category: string; count: number }>();
  for (const listing of listings) {
    const key = directoryCategoryPath(listing.city, listing.category);
    const current = groups.get(key) ?? { city: listing.city, category: listing.category, count: 0 };
    current.count += 1;
    groups.set(key, current);
  }

  return (
    <PublicChrome
      title="Trust directory"
      description="Public recommendations from verified creators. Each business page lists the creator, the rating, and the date so the page can be cited."
    >
      {groups.size === 0 ? (
        <EmptyState
          title="No public businesses yet"
          description="A brand opts in, a creator writes a review, and an admin publishes both before a page appears here."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {[...groups.entries()].map(([href, group]) => (
            <li key={href}>
              <Link href={href} className="panel block p-5 hover:border-foreground/20">
                <h2 className="font-display text-2xl tracking-tight">
                  {group.category} in {group.city}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {group.count} {group.count === 1 ? "business" : "businesses"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {listings.length > 0 ? (
        <ul className="mt-10 space-y-3">
          {listings.map((listing) => {
            const rating = aggregateRating(publicReviewsFor(store, listing));
            return (
              <li key={listing.id}>
                <Link href={`/business/${listing.slug}`} className="list-row text-sm">
                  <div>
                    <p className="font-medium">{listing.name}</p>
                    <p className="text-xs text-muted">
                      {listing.city} · {listing.category}
                    </p>
                  </div>
                  <span className="text-muted">
                    {rating ? `${rating.ratingValue.toFixed(1)} out of 5` : "No reviews yet"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="mt-10 text-sm text-muted">
        <Link href="/llms.txt" className="text-gold-deep hover:underline">
          llms.txt
        </Link>{" "}
        lists these pages for AI search engines.
      </p>
    </PublicChrome>
  );
}
