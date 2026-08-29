import Link from "next/link";

import { listActiveCampaignsPublic } from "@/app/actions/campaigns";
import { Logo } from "@/components/brand/logo";
import { Badge, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; platform?: string }>;
}) {
  const params = await searchParams;
  const campaigns = await listActiveCampaignsPublic({
    q: params.q,
    type: params.type,
    platform: params.platform,
  });

  return (
    <div className="bg-atmosphere min-h-screen">
      <header className="border-b border-border/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Logo href="/" />
          <Link href="/login">
            <Button size="sm" variant="secondary">
              Log in
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl tracking-tight">Open campaigns</h1>
        <p className="mt-2 text-muted">Browse content rewards campaigns and start earning.</p>

        <form className="mt-8 flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search…"
            className="input-capsule h-11 min-w-[200px] flex-1"
          />
          <select name="type" defaultValue={params.type ?? ""} className="input-capsule h-11">
            <option value="">All types</option>
            <option value="clipping">Clipping</option>
            <option value="ugc">UGC</option>
          </select>
          <select name="platform" defaultValue={params.platform ?? ""} className="input-capsule h-11">
            <option value="">All platforms</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
            <option value="x">X</option>
          </select>
          <Button type="submit" size="sm">
            Filter
          </Button>
        </form>

        <div className="mt-10">
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns found" description="Try adjusting your filters." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="block rounded-3xl border border-border bg-white p-5 hover:border-foreground/20"
                  >
                    <h2 className="font-display text-xl">{c.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{c.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge tone="gold">{c.type}</Badge>
                      <Badge>{c.category}</Badge>
                      <Badge tone="muted">CPM {formatMoney(c.cpmCents)}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
