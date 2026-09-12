import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getPublicInfluencer } from "@/app/actions/influencer";
import { BookingRequestForm } from "@/components/forms/booking-request-form";
import { PublicChrome } from "@/components/public-chrome";
import { Card, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

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
