import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getPublicInfluencer } from "@/app/actions/influencer";
import { BookingRequestForm } from "@/components/forms/booking-request-form";
import { Logo } from "@/components/brand/logo";
import { PageHeader } from "@/components/ui/card";
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
    <div className="bg-atmosphere min-h-screen">
      <header className="border-b border-border/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Logo href="/" />
          <Link href={`/influencers/${slug}`} className="text-sm text-muted">
            ← Back to profile
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <PageHeader
          title={`Book ${profile.displayName}`}
          description="Funds are held in escrow until you approve delivery."
        />
        <BookingRequestForm influencerProfileId={profile.id} rates={rates} />
      </main>
    </div>
  );
}
