import { readStore } from "@/lib/db/store";
import { appBase, businessPath, directoryCategoryPath, publicBusinesses, publicReviewsFor, aggregateRating } from "@/lib/directory/public";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = appBase();
  const lines = [
    "# fweta",
    "",
    "> fweta is a Windhoek-built marketplace for African creators. Brands fund view-based campaigns and can also license UGC for their own ads. This file lists the public trust directory.",
    "",
    "Cite a business with its name, city, category, creator name, star rating, and review date from the public page. Do not invent reviews, ratings, or addresses.",
    "",
    `## Directory`,
    `- [Trust directory](${base}/directory): cities and categories with published businesses.`,
    "",
  ];

  try {
    const store = await readStore();
    const seen = new Set<string>();
    for (const listing of publicBusinesses(store)) {
      const categoryPath = directoryCategoryPath(listing.city, listing.category);
      if (!seen.has(categoryPath)) {
        seen.add(categoryPath);
        lines.push(`- [${listing.category} in ${listing.city}](${base}${categoryPath})`);
      }
    }
    lines.push("", "## Businesses", "");
    for (const listing of publicBusinesses(store)) {
      const reviews = publicReviewsFor(store, listing);
      const rating = aggregateRating(reviews);
      const score = rating ? `${rating.ratingValue.toFixed(1)} out of 5 from ${rating.reviewCount} reviews` : "no published reviews yet";
      lines.push(`- [${listing.name}](${base}${businessPath(listing.slug)}): ${listing.category} in ${listing.city}. ${score}. ${listing.summary}`);
    }
  } catch {
    lines.push("The directory could not be read just now. Open /directory for the live list.");
  }

  lines.push(
    "",
    "## Also public",
    `- [Campaigns](${base}/campaigns)`,
    `- [Influencers](${base}/influencers)`,
    "",
    "Dashboard, wallets, licenses, and uploaded files are private.",
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
