import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ApplicationDecision, ApplyForm, DeliveryForm, DisputeForm } from "@/components/forms/licensing-forms";
import { Badge, Card, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatLabel, platformLabel, usageLabel } from "@/lib/licensing/hub";
import { formatMoney } from "@/lib/utils";

export default async function CreatorUgcDetailPage({ params }: { params: Promise<{ briefId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const creator = session.roles.includes("clipper") || session.roles.includes("influencer") || session.roles.includes("admin");
  if (!creator) redirect("/dashboard");
  const { briefId } = await params;
  const store = await readStore();
  const brief = store.ugcBriefs.find((item) => item.id === briefId);
  if (!brief) notFound();
  const application = store.ugcApplications.find((item) => item.briefId === brief.id && item.creatorId === session.id && item.status !== "withdrawn" && item.status !== "declined");
  const deliveries = store.ugcDeliveries.filter((item) => item.applicationId === application?.id);
  const licenses = store.contentLicenses.filter((item) => item.briefId === brief.id && item.creatorId === session.id);
  const brand = store.profiles.find((profile) => profile.id === brief.brandId);

  return (
    <div className="dash-stack">
      <PageHeader
        title={brief.title}
        description={`${brand?.displayName ?? "Brand"} · ${formatMoney(brief.feePerAssetCents)} per video · you do not post this on your feed.`}
      />
      <Card>
        <div className="flex flex-wrap gap-2">
          <Badge tone={brief.status === "open" ? "success" : "muted"}>{brief.status}</Badge>
          <Badge tone="gold">{usageLabel(brief.usage)}</Badge>
        </div>
        <p className="mt-3 text-sm leading-relaxed">{brief.summary}</p>
        <p className="mt-2 text-xs text-muted">
          {formatLabel(brief.format)}, up to {brief.lengthSeconds}s · {brief.videoCount} {brief.videoCount === 1 ? "video" : "videos"} · {brief.termMonths} months · {brief.territory} · {brief.platforms.map(platformLabel).join(", ")} · raw files {brief.rawFiles ? "required" : "not required"} · up to {brief.revisionLimit} revisions
        </p>
      </Card>

      {!application && brief.status === "open" ? (
        <section>
          <SectionHeader title="Apply" />
          <ApplyForm briefId={brief.id} />
        </section>
      ) : null}

      {application ? (
        <section>
          <SectionHeader title="Your application" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">Status: {application.status}</p>
            {application.status === "applied" || application.status === "invited" ? (
              <ApplicationDecision applicationId={application.id} canWithdraw />
            ) : null}
          </div>
        </section>
      ) : null}

      {application?.status === "accepted" ? (
        <section>
          <SectionHeader title="Upload" />
          <DeliveryForm applicationId={application.id} rawFiles={brief.rawFiles} />
        </section>
      ) : null}

      {deliveries.length > 0 ? (
        <section>
          <SectionHeader title="Your files" />
          <ul className="space-y-3">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="panel p-4 text-sm">
                <p className="font-medium">{delivery.status}</p>
                {delivery.revisionNote ? <p className="mt-1 text-muted">Revision note: {delivery.revisionNote}</p> : null}
                <ul className="mt-2 space-y-1">
                  {delivery.files.map((file) => (
                    <li key={file.id}>
                      <a href={`/api/ugc/${file.name}`} className="text-gold-deep hover:underline">
                        {file.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {licenses.length > 0 ? (
        <section>
          <SectionHeader title="Licenses" />
          <ul className="space-y-4">
            {licenses.map((license) => (
              <li key={license.id} className="panel p-4 text-sm">
                <p className="font-medium">
                  {formatMoney(license.feeCents)} · {license.startsAt.slice(0, 10)} to {license.endsAt.slice(0, 10)}
                </p>
                <Link href={`/api/licenses/${license.id}`} className="mt-2 inline-block text-gold-deep hover:underline">
                  Download license summary
                </Link>
                <div className="mt-3">
                  <DisputeForm licenseId={license.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
