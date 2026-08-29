import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicInfluencer } from "@/app/actions/influencer";
import { Logo } from "@/components/brand/logo";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function PublicInfluencerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicInfluencer(slug);
  if (!data) notFound();

  const { profile, rates } = data;
  const session = await getSession();

  return (
    <div className="bg-atmosphere min-h-screen">
      <header className="border-b border-border/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Logo href="/" />
          <Link href="/influencers" className="text-sm text-muted">
            ← All influencers
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <Badge tone="gold">{profile.niche}</Badge>
        <h1 className="mt-4 font-display text-4xl tracking-tight">{profile.displayName}</h1>
        <p className="mt-2 text-lg text-muted">{profile.headline}</p>
        <p className="mt-1 text-sm text-muted-light">{profile.location}</p>

        <Card className="mt-8">
          <h2 className="font-display text-xl">About</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{profile.bio}</p>
        </Card>

        <div className="mt-8">
          <h2 className="font-display text-2xl">Rate card</h2>
          {rates.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No active rates listed.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {rates.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-sm text-muted">
                      {r.type} · {r.platform}
                    </p>
                  </div>
                  <p className="font-display text-lg">{formatMoney(r.priceCents)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-10">
          {session?.roles.includes("brand") ? (
            <Link href={`/influencers/${slug}/book`}>
              <Button size="lg">Request booking</Button>
            </Link>
          ) : (
            <Link href={session ? "/dashboard" : "/signup?role=brand"}>
              <Button size="lg" variant="secondary">
                {session ? "Switch to brand role to book" : "Sign up as a brand"}
              </Button>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
