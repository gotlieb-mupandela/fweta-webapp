import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getPublicInfluencer } from "@/app/actions/influencer";
import { BookingRequestForm } from "@/components/forms/booking-request-form";
import { PublicChrome } from "@/components/public-chrome";
import { Card, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const store = await readStore();
    const profile = store.influencerProfiles.find((row) => row.slug === slug && row.published);
    if (!profile) return { title: "Book a creator" };
    return {
      title: `Book ${profile.displayName}`,
      description: "Request a booking at the creator's listed rate.",
    };
  } catch {
    return { title: "Book a creator" };
  }
}

export default async function BookInfluencerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/influencers/${slug}/book`);
  if (!session.roles.includes("brand")) redirect("/dashboard");

  const data = await getPublicInfluencer(slug);
  if (!data) notFound();

  const { profile, rates } = data;

  return (
    <PublicChrome>
      <div className="mx-auto max-w-3xl">
        <Link href={`/influencers/${slug}`} className="section-link">
          ← Back to profile
        </Link>
        <div className="mt-6">
          <PageHeader
            title={`Book ${profile.displayName}`}
            description="Funds are held in escrow until you approve delivery."
          />
          <Card>
            <BookingRequestForm influencerProfileId={profile.id} rates={rates} />
          </Card>
        </div>
      </div>
    </PublicChrome>
  );
}
