import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicChrome } from "@/components/public-chrome";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const store = await readStore();
  const portfolio = store.creatorPortfolios.find((item) => item.userId === id && item.published);
  const profile = store.profiles.find((item) => item.id === id);
  if (!portfolio || !profile) return { title: "Creator", robots: { index: false, follow: false } };
  const description = portfolio.headline.slice(0, 160);
  return {
    title: `${profile.displayName} UGC`,
    description,
    alternates: { canonical: `/creators/${id}` },
    openGraph: { title: profile.displayName, description, url: `/creators/${id}` },
  };
}

export default async function CreatorPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await readStore();
  const portfolio = store.creatorPortfolios.find((item) => item.userId === id && item.published);
  const profile = store.profiles.find((item) => item.id === id);
  if (!portfolio || !profile || profile.suspended) notFound();

  return (
    <PublicChrome title={profile.displayName} description={portfolio.headline}>
      <p className="max-w-2xl text-[15px] leading-relaxed">{portfolio.about}</p>
      <p className="mt-4 text-sm">
        UGC rate: {portfolio.ugcFeeCents > 0 ? `${formatMoney(portfolio.ugcFeeCents)} per video` : "Rate on request"}
      </p>
      {portfolio.sampleUrls.length > 0 ? (
        <ul className="mt-6 space-y-2 text-sm">
          {portfolio.sampleUrls.map((url) => (
            <li key={url}>
              <a href={url} className="text-gold-deep hover:underline">
                {url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">No sample links yet.</p>
      )}
    </PublicChrome>
  );
}
