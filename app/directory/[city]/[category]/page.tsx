import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicChrome } from "@/components/public-chrome";
import { readStore } from "@/lib/db/store";
import { aggregateRating, businessesInCategory, publicReviewsFor } from "@/lib/directory/public";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; category: string }>;
}): Promise<Metadata> {
  const { city, category } = await params;
  const store = await readStore();
  const listings = businessesInCategory(store, city, category);
  const first = listings[0];
  if (!first) return { title: "Directory", robots: { index: false, follow: false } };
  const title = `${first.category} in ${first.city}`;
  const description = `Verified creator reviews of ${first.category.toLowerCase()} businesses in ${first.city}.`;
  const path = `/directory/${city}/${category}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}

export default async function DirectoryCategoryPage({
  params,
}: {
  params: Promise<{ city: string; category: string }>;
}) {
  const { city, category } = await params;
  const store = await readStore();
  const listings = businessesInCategory(store, city, category);
  const first = listings[0];
  if (!first) notFound();

  return (
    <PublicChrome
      title={`${first.category} in ${first.city}`}
      description={`Businesses in ${first.city} with public creator reviews on fweta.`}
    >
      <p className="mb-6 text-sm">
        <Link href="/directory" className="text-gold-deep hover:underline">
          All cities
        </Link>
      </p>
      <ul className="space-y-3">
        {listings.map((listing) => {
          const rating = aggregateRating(publicReviewsFor(store, listing));
          return (
            <li key={listing.id}>
              <Link href={`/business/${listing.slug}`} className="panel block p-5 hover:border-foreground/20">
                <h2 className="font-display text-2xl tracking-tight">{listing.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{listing.summary}</p>
                <p className="mt-3 text-sm">
                  {rating ? `${rating.ratingValue.toFixed(1)} out of 5 from ${rating.reviewCount} verified ${rating.reviewCount === 1 ? "review" : "reviews"}` : "Waiting for a published review"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </PublicChrome>
  );
}
