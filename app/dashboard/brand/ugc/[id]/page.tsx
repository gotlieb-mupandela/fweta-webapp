import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ApplicationDecision,
  BriefLifecycle,
  DisputeForm,
  InviteForm,
  RevisionForm,
} from "@/components/forms/licensing-forms";
import { Badge, Card, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatLabel, platformLabel, usageLabel } from "@/lib/licensing/hub";
import { formatMoney } from "@/lib/utils";

export default async function BrandUgcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) redirect("/dashboard");
  const { id } = await params;
  const store = await readStore();
  const brief = store.ugcBriefs.find((item) => item.id === id && item.brandId === session.id);
  if (!brief) notFound();

  const applications = store.ugcApplications.filter((item) => item.briefId === brief.id);
  const deliveries = store.ugcDeliveries.filter((item) => item.briefId === brief.id);
  const licenses = store.contentLicenses.filter((item) => item.briefId === brief.id);
  const nameOf = (userId: string) => store.profiles.find((profile) => profile.id === userId)?.displayName ?? "Creator";

  return (
    <div className="dash-stack">
      <PageHeader
        title={brief.title}
        description={`${formatLabel(brief.format)}, up to ${brief.lengthSeconds}s · ${usageLabel(brief.usage)} · ${brief.termMonths} months · ${brief.territory}`}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={brief.status === "open" ? "success" : "muted"}>{brief.status}</Badge>
          <span className="text-sm text-muted">
            {formatMoney(brief.feePerAssetCents)} per video · {brief.videoCount} videos · reserved {formatMoney(brief.budgetReservedCents)} of {formatMoney(brief.budgetCents)}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed">{brief.summary}</p>
        <p className="mt-2 text-xs text-muted">
          Platforms: {brief.platforms.map(platformLabel).join(", ")}. Raw files: {brief.rawFiles ? "yes" : "no"}. Revisions: {brief.revisionLimit}.
        </p>
        <div className="mt-4">
          <BriefLifecycle briefId={brief.id} status={brief.status} />
        </div>
      </Card>

      {brief.status === "open" || brief.status === "paused" ? (
        <section>
          <SectionHeader title="Invite" />
          <InviteForm briefId={brief.id} />
        </section>
      ) : null}

      <section>
        <SectionHeader title="Applications" />
        {applications.length === 0 ? (
          <p className="text-sm text-muted">No applications yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {applications.map((application) => (
              <li key={application.id} className="list-row text-sm">
                <div>
                  <p className="font-medium">{nameOf(application.creatorId)}</p>
                  <p className="text-xs text-muted">
                    {application.status}
                    {application.note ? ` · ${application.note}` : ""}
                  </p>
                </div>
                {application.status === "applied" || application.status === "invited" ? (
                  <ApplicationDecision applicationId={application.id} />
                ) : (
                  <Badge tone="muted">{application.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Files" />
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted">No files yet.</p>
        ) : (
          <ul className="space-y-4">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="panel p-4">
                <p className="text-sm font-medium">
                  {nameOf(delivery.creatorId)} · {delivery.status}
                  {delivery.revisionCount ? ` · ${delivery.revisionCount} revision${delivery.revisionCount === 1 ? "" : "s"}` : ""}
                </p>
                {delivery.revisionNote ? <p className="mt-1 text-sm text-muted">{delivery.revisionNote}</p> : null}
                <ul className="mt-2 space-y-1 text-sm">
                  {delivery.files.map((file) => (
                    <li key={file.id}>
                      <a className="text-gold-deep hover:underline" href={`/api/ugc/${file.name}`}>
                        {file.originalName}
                      </a>
                      <span className="text-muted"> · {file.kind}</span>
                    </li>
                  ))}
                </ul>
                {delivery.status === "submitted" || delivery.status === "revision" ? (
                  <div className="mt-3">
                    <RevisionForm deliveryId={delivery.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Licenses" />
        {licenses.length === 0 ? (
          <p className="text-sm text-muted">A license is created when you approve a file.</p>
        ) : (
          <ul className="space-y-4">
            {licenses.map((license) => (
              <li key={license.id} className="panel p-4 text-sm">
                <p className="font-medium">
                  {license.creatorName} · {formatMoney(license.feeCents)} · {license.startsAt.slice(0, 10)} to {license.endsAt.slice(0, 10)}
                </p>
                <p className="mt-1 text-muted">{usageLabel(license.usage)} · {license.territory}</p>
                <p className="mt-2">
                  <Link href={`/api/licenses/${license.id}`} className="text-gold-deep hover:underline">
                    Download license summary
                  </Link>
                </p>
                <div className="mt-3">
                  <DisputeForm licenseId={license.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
