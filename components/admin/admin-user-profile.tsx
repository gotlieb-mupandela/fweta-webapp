import Link from "next/link";

import { UserSuspendButton } from "@/components/forms/user-suspend-button";
import { PLATFORM_LABEL, PlatformIcon } from "@/components/admin/platform-icon";
import { AdminCreditForm } from "@/components/forms/admin-credit-form";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { Badge } from "@/components/ui/card";
import type {
  AdminBookingRow,
  AdminFraudRow,
  AdminSubmissionRow,
  AdminUserDossier,
  SocialLink,
} from "@/lib/admin/user-profile";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

const RATE_LABEL: Record<string, string> = {
  per_post: "Per post",
  per_reel: "Per Reel",
  per_1k_views: "Per 1K views",
  package: "Package",
  ugc_flat: "UGC flat fee",
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Not set";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-NA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Windhoek" });
}

function onboardingLabel(value: string | null | undefined): string {
  if (value === undefined) return "Legacy account. Onboarding was not required";
  if (value === null) return "Not completed";
  if (value === "seeded") return "Completed at seed";
  return `Completed ${formatWhen(value)}`;
}

function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function socialHref(platform: SocialPlatform, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  if (!handle || /\s/.test(handle)) return null;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  if (platform === "youtube") return `https://www.youtube.com/@${handle}`;
  if (platform === "instagram") return `https://www.instagram.com/${handle}/`;
  if (platform === "facebook") return `https://www.facebook.com/${handle}`;
  return `https://x.com/${handle}`;
}

function socialCaption(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    const tail = url.pathname.replace(/\/$/, "").split("/").filter(Boolean).pop();
    const host = url.hostname.replace(/^www\./, "");
    return tail ? `${host}/${tail}` : host;
  } catch {
    return value;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-snug text-foreground">{children}</dd>
    </div>
  );
}

function QuietEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border bg-surface-2/60 px-4 py-5 text-sm leading-relaxed text-muted">
      {children}
    </p>
  );
}

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-deep">{kicker}</p>
        <h2 className="mt-1 font-display text-[1.65rem] leading-none tracking-tight text-foreground md:text-[1.85rem]">
          {title}
        </h2>
      </div>
      <div className="panel p-4 sm:p-5 md:p-6">{children}</div>
    </section>
  );
}

function statusTone(status: string): "gold" | "success" | "danger" | "muted" | "neutral" {
  if (
    status === "active" ||
    status === "approved" ||
    status === "paid" ||
    status === "credited" ||
    status === "verified" ||
    status === "completed" ||
    status === "listed"
  ) {
    return "success";
  }
  if (status === "suspended" || status === "rejected" || status === "flagged" || status === "open") {
    return "danger";
  }
  if (status === "pending" || status === "requested" || status === "processing" || status === "draft") {
    return "gold";
  }
  return "muted";
}

export function AdminUserProfile({
  dossier,
  isPublic = false,
}: {
  dossier: AdminUserDossier;
  isPublic?: boolean;
}) {
  const { profile } = dossier;
  const optionalFacts: Array<{ label: string; value: string }> = [];
  if (profile.firstName) optionalFacts.push({ label: "First name", value: profile.firstName });
  if (profile.lastName) optionalFacts.push({ label: "Surname", value: profile.lastName });
  if (profile.phone) optionalFacts.push({ label: "Phone", value: profile.phone });
  if (profile.companyName) optionalFacts.push({ label: "Company", value: profile.companyName });
  if (profile.website) optionalFacts.push({ label: "Website", value: profile.website });
  if (profile.niche) optionalFacts.push({ label: "Niche", value: profile.niche });
  if (profile.location) optionalFacts.push({ label: "Location", value: profile.location });
  if (profile.primaryPlatform) {
    optionalFacts.push({
      label: "Primary platform",
      value: PLATFORM_LABEL[profile.primaryPlatform],
    });
  }

  const isBrand = profile.roles.includes("brand");
  const sections = [
    { id: "account", label: "Account" },
    { id: "verification", label: "Verification" },
    { id: "media", label: "Media" },
    { id: "social", label: "Social" },
    { id: "pricing", label: "Pricing" },
    { id: "wallet", label: "Wallet" },
    { id: "payouts", label: "Payouts" },
    { id: "campaigns", label: "Campaigns" },
    { id: "clips", label: "Clips" },
    { id: "bookings", label: "Bookings" },
    { id: "deposits", label: "Deposits" },
    { id: "fraud", label: "Fraud" },
    { id: "alerts", label: "Alerts" },
  ];

  const accountSocials = dossier.socials.filter((s) => s.source === "account");
  const publicSocials = dossier.socials.filter((s) => s.source === "public");

  return (
    <div className="dash-stack">
      <Link href="/dashboard/admin/users" className="section-link hidden w-fit md:inline-flex">
        ← Users
      </Link>

      <article className="overflow-hidden rounded-[1.35rem] border border-border bg-white shadow-[var(--shadow-soft)]">
        <div
          className="relative h-36 sm:h-44 md:h-52"
          style={{
            background:
              "radial-gradient(620px 220px at 90% -20%, rgba(184,150,46,0.62), transparent 58%), radial-gradient(380px 160px at 0% 120%, rgba(184,150,46,0.28), transparent 60%), linear-gradient(150deg, #0c0b09 0%, #16140f 46%, #2c2618 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 0.7px, transparent 0.7px)",
              backgroundSize: "13px 13px",
            }}
          />
          <p className="absolute left-5 top-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60 sm:left-8">
            Admin record
          </p>
          <div className="absolute bottom-4 right-4 z-10 sm:right-7">
            <UserSuspendButton userId={profile.id} suspended={profile.suspended} />
          </div>
        </div>

        <div className="relative px-4 pb-0 sm:px-7">
          <div className="-mt-12 sm:-mt-16">
            <div className="w-fit rounded-full bg-white p-1 shadow-[var(--shadow-lift)] ring-1 ring-black/5">
              <AvatarCircle src={profile.avatarUrl} name={profile.displayName} size="xl" />
            </div>
          </div>

          <div className="mt-4 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={profile.suspended ? "danger" : "success"}>
                {profile.suspended ? "Suspended" : "Active"}
              </Badge>
              <Badge tone="gold">{profile.primaryRole}</Badge>
            </div>
            <h1 className="mt-3 font-display text-[2.15rem] leading-[0.95] tracking-tight text-foreground sm:text-5xl">
              {profile.displayName}
            </h1>
            <p className="mt-2 text-sm text-muted sm:text-[15px]">{profile.email}</p>
            {dossier.influencer?.slug ? (
              <p className="mt-1 font-mono text-xs text-muted-light">/{dossier.influencer.slug}</p>
            ) : null}
            {profile.bio ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/80">{profile.bio}</p>
            ) : (
              <p className="mt-3 text-sm text-muted">No bio stored.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.roles.map((role) => (
                <Badge key={role} tone={role === profile.primaryRole ? "neutral" : "muted"}>
                  {role === profile.primaryRole ? `${role} · primary` : role}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 divide-x divide-y divide-border border-t border-border sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Available"
            value={dossier.wallet ? formatMoney(dossier.wallet.availableCents) : "Not set"}
            hint={dossier.wallet ? undefined : "No wallet row"}
          />
          <Stat
            label="Pending"
            value={dossier.wallet ? formatMoney(dossier.wallet.pendingCents) : "Not set"}
          />
          <Stat label="Clips" value={formatNumber(dossier.submissions.length)} />
          <Stat label="Views" value={formatNumber(dossier.totalViews)} />
          <Stat label="Earnings" value={formatMoney(dossier.totalEarningsCents)} />
          <Stat label="Bookings" value={formatNumber(dossier.bookings.length)} />
        </dl>
      </article>

      <nav
        aria-label="Profile sections"
        className="sticky top-12 z-20 -mx-1 flex gap-2 overflow-x-auto bg-background/85 px-1 py-2 backdrop-blur md:top-0"
      >
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:border-gold/50"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <Section id="account" kicker="Identity" title="Account">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Display name">{profile.displayName}</Field>
          <Field label="Email">{profile.email}</Field>
          <Field label="User id">
            <span className="font-mono text-xs">{profile.id}</span>
          </Field>
          <Field label="Primary role">{profile.primaryRole}</Field>
          <Field label="Roles">{profile.roles.join(", ")}</Field>
          <Field label="Status">{profile.suspended ? "Suspended" : "Active"}</Field>
          <Field label="Onboarding">{onboardingLabel(profile.onboardingCompletedAt)}</Field>
          <Field label="Created">{formatWhen(profile.createdAt)}</Field>
          <Field label="Updated">{formatWhen(profile.updatedAt)}</Field>
          {optionalFacts.map((fact) => (
            <Field key={fact.label} label={fact.label}>
              {fact.label === "Website" ? (
                <a href={fact.value} className="section-link break-all" target="_blank" rel="noreferrer">
                  {fact.value}
                </a>
              ) : (
                fact.value
              )}
            </Field>
          ))}
        </dl>
        {optionalFacts.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No phone, company, website, niche, location, or primary platform is stored.
          </p>
        ) : null}
      </Section>

      <Section id="verification" kicker="Trust" title="Verification">
        <ul className="space-y-2.5">
          {dossier.verification.map((row) => (
            <li key={`${row.label}-${row.detail}`} className="list-row items-start">
              <div className="min-w-0">
                <p className="font-medium">{row.label}</p>
                <p className="break-all text-sm text-muted">{row.detail}</p>
              </div>
              <Badge tone={statusTone(row.status.toLowerCase())}>{row.status}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="media" kicker="Pictures" title="Media">
        {dossier.media.length === 0 ? (
          <QuietEmpty>No avatar or other pictures are stored for this account.</QuietEmpty>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {dossier.media.map((item) => (
              <li key={`${item.label}-${item.url}`} className="overflow-hidden rounded-2xl border border-border">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- stored avatar and media URLs
                  <img src={item.url} alt={item.label} className="aspect-square w-full object-cover" />
                ) : (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex aspect-square items-end bg-surface-2 p-3 text-sm font-medium"
                  >
                    Open link
                  </a>
                )}
                <p className="border-t border-border px-3 py-2 text-xs text-muted">{item.label}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="social" kicker="Profiles" title="Social">
        {dossier.socials.length === 0 ? (
          <QuietEmpty>
            No TikTok, YouTube, Instagram, or X handles are stored. Follower counts are not tracked
            on this account.
          </QuietEmpty>
        ) : (
          <div className="space-y-5">
            <SocialGroup title="Account" links={accountSocials} />
            <SocialGroup title="Public profile" links={publicSocials} />
            <p className="text-xs text-muted">Follower counts are not stored for these handles.</p>
          </div>
        )}
      </Section>

      <Section id="pricing" kicker="Influencer" title="Rate card">
        {dossier.influencer ? (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Public name">{dossier.influencer.displayName}</Field>
              <Field label="Slug">
                {isPublic ? (
                  <Link href={`/influencers/${dossier.influencer.slug}`} className="section-link">
                    /influencers/{dossier.influencer.slug}
                  </Link>
                ) : (
                  <span>/influencers/{dossier.influencer.slug} (not public)</span>
                )}
              </Field>
              <Field label="Visibility">{dossier.influencer.published ? "Published" : "Unpublished"}</Field>
              {dossier.influencer.headline ? (
                <Field label="Headline">{dossier.influencer.headline}</Field>
              ) : null}
              {dossier.influencer.niche ? <Field label="Niche">{dossier.influencer.niche}</Field> : null}
              {dossier.influencer.location ? (
                <Field label="Location">{dossier.influencer.location}</Field>
              ) : null}
              <Field label="Profile updated">{formatWhen(dossier.influencer.updatedAt)}</Field>
            </dl>
            {dossier.influencer.bio ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{dossier.influencer.bio}</p>
            ) : null}
            {dossier.influencer.featuredWork.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Featured work</p>
                <ul className="mt-2 space-y-1.5">
                  {dossier.influencer.featuredWork.map((work) => (
                    <li key={work} className="truncate text-sm">
                      <a href={work} className="section-link" target="_blank" rel="noreferrer">
                        {work}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted">No featured work is stored.</p>
            )}
            {dossier.rateCards.length === 0 ? (
              <QuietEmpty>No rate card prices are stored.</QuietEmpty>
            ) : (
              <ul className="space-y-2.5">
                {dossier.rateCards.map((rate) => (
                  <li key={rate.id} className="list-row items-start">
                    <div className="min-w-0">
                      <p className="font-medium">{rate.title}</p>
                      <p className="text-sm text-muted">
                        {RATE_LABEL[rate.type] ?? rate.type} · {rate.platform}
                      </p>
                      {rate.description ? (
                        <p className="mt-1 text-sm leading-relaxed text-muted">{rate.description}</p>
                      ) : null}
                      <div className="mt-2">
                        <Badge tone={rate.active ? "success" : "muted"}>
                          {rate.active ? "Current" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <p className="font-display text-2xl tracking-tight">{formatMoney(rate.priceCents)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <QuietEmpty>No influencer profile or rate card is stored for this account.</QuietEmpty>
        )}
      </Section>

      <Section id="wallet" kicker="Money" title="Wallet & ledger">
        {dossier.wallet ? (
          <dl className="mb-5 grid gap-4 sm:grid-cols-3">
            <Field label="Available">{formatMoney(dossier.wallet.availableCents)}</Field>
            <Field label="Pending">{formatMoney(dossier.wallet.pendingCents)}</Field>
            <Field label="Wallet updated">{formatWhen(dossier.wallet.updatedAt)}</Field>
          </dl>
        ) : (
          <QuietEmpty>No wallet row is stored. Crediting below creates one.</QuietEmpty>
        )}
        <div className="mb-6 max-w-md">
          <AdminCreditForm
            title="Manual EFT credit"
            presetUserId={profile.id}
            users={[{ id: profile.id, email: profile.email, displayName: profile.displayName }]}
          />
        </div>
        {dossier.ledger.length === 0 ? (
          <QuietEmpty>No ledger entries. Wallet changes are only recorded with a ledger row.</QuietEmpty>
        ) : (
          <ul className="space-y-2.5">
            {dossier.ledger.map((entry) => (
              <li key={entry.id} className="list-row items-start">
                <div className="min-w-0">
                  <p className="font-medium">{entry.reason}</p>
                  <p className="text-sm text-muted">
                    {humanize(entry.referenceType)}
                    {entry.referenceId ? ` · ${entry.referenceId}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-light">
                    {formatWhen(entry.createdAt)} · available{" "}
                    {formatMoney(entry.balanceAfterAvailableCents)} · pending{" "}
                    {formatMoney(entry.balanceAfterPendingCents)}
                  </p>
                </div>
                <p
                  className={
                    entry.type === "credit"
                      ? "font-medium text-success"
                      : "font-medium text-danger"
                  }
                >
                  {entry.type === "credit" ? "+" : "−"}
                  {formatMoney(entry.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="dash-split">
        <Section id="payouts" kicker="EFT" title="Payout method">
          {dossier.payout ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank">{dossier.payout.bankName}</Field>
              <Field label="Branch code">{dossier.payout.branchCode}</Field>
              <Field label="Account holder">{dossier.payout.accountHolderName}</Field>
              <Field label="Account type">{dossier.payout.accountType}</Field>
              <Field label="Account number">
                <span className="font-mono tracking-wide">{dossier.payout.accountNumberMasked}</span>
              </Field>
              <Field label="Updated">{formatWhen(dossier.payout.updatedAt)}</Field>
            </dl>
          ) : (
            <QuietEmpty>No payout method is stored. Bank details stay masked when they are.</QuietEmpty>
          )}
        </Section>

        <section className="scroll-mt-28">
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-deep">EFT</p>
            <h2 className="mt-1 font-display text-[1.65rem] leading-none tracking-tight md:text-[1.85rem]">
              Withdrawals
            </h2>
          </div>
          <div className="panel p-4 sm:p-5 md:p-6">
            {dossier.withdrawals.length === 0 ? (
              <QuietEmpty>No withdrawal requests.</QuietEmpty>
            ) : (
              <ul className="space-y-2.5">
                {dossier.withdrawals.map((withdrawal) => (
                  <li key={withdrawal.id} className="list-row items-start">
                    <div>
                      <p className="font-medium">{formatMoney(withdrawal.amountCents)}</p>
                      <p className="text-xs text-muted">{formatWhen(withdrawal.createdAt)}</p>
                      {withdrawal.bankReference ? (
                        <p className="mt-1 text-xs text-muted">Ref {withdrawal.bankReference}</p>
                      ) : null}
                      {withdrawal.adminNote ? (
                        <p className="mt-1 text-xs text-muted">{withdrawal.adminNote}</p>
                      ) : null}
                      {withdrawal.paidAt ? (
                        <p className="mt-1 text-xs text-muted">Paid {formatWhen(withdrawal.paidAt)}</p>
                      ) : null}
                    </div>
                    <Badge tone={statusTone(withdrawal.status)}>{withdrawal.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Section id="campaigns" kicker="Brand" title="Campaigns">
        {!isBrand && dossier.campaigns.length === 0 ? (
          <QuietEmpty>This account is not a brand. No campaigns are stored.</QuietEmpty>
        ) : dossier.campaigns.length === 0 ? (
          <QuietEmpty>No campaigns are stored for this brand.</QuietEmpty>
        ) : (
          <RecordList>
            {dossier.campaigns.map((campaign) => (
              <li key={campaign.id} className="list-row items-start">
                <div className="min-w-0">
                  <p className="font-medium">{campaign.title}</p>
                  <p className="text-sm text-muted">
                    {campaign.type} · {campaign.category} · CPM {formatMoney(campaign.cpmCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-light">
                    Spent {formatMoney(campaign.budgetSpentCents)} of {formatMoney(campaign.budgetTotalCents)}
                    {campaign.endDate ? ` · ends ${formatWhen(campaign.endDate)}` : ""}
                  </p>
                </div>
                <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
              </li>
            ))}
          </RecordList>
        )}
      </Section>

      <Section id="clips" kicker="Clipper" title="Submissions">
        {dossier.submissions.length === 0 ? (
          <QuietEmpty>No clips or submissions are stored.</QuietEmpty>
        ) : (
          <RecordList>
            {dossier.submissions.map((submission) => (
              <SubmissionRow key={submission.id} submission={submission} />
            ))}
          </RecordList>
        )}
      </Section>

      <Section id="bookings" kicker="Marketplace" title="Bookings">
        {dossier.bookings.length === 0 ? (
          <QuietEmpty>No bookings as a brand or influencer.</QuietEmpty>
        ) : (
          <RecordList>
            {dossier.bookings.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </RecordList>
        )}
      </Section>

      <Section id="deposits" kicker="Brand" title="Deposits">
        {!isBrand && dossier.deposits.length === 0 ? (
          <QuietEmpty>This account is not a brand. No deposits are stored.</QuietEmpty>
        ) : dossier.deposits.length === 0 ? (
          <QuietEmpty>No brand deposits are stored.</QuietEmpty>
        ) : (
          <RecordList>
            {dossier.deposits.map((deposit) => (
              <li key={deposit.id} className="list-row items-start">
                <div>
                  <p className="font-medium">{formatMoney(deposit.amountCents)}</p>
                  {deposit.note ? <p className="text-sm text-muted">{deposit.note}</p> : null}
                  <p className="text-xs text-muted-light">{formatWhen(deposit.createdAt)}</p>
                </div>
                <Badge tone={statusTone(deposit.status)}>{deposit.status}</Badge>
              </li>
            ))}
          </RecordList>
        )}
      </Section>

      <Section id="fraud" kicker="Trust" title="Fraud flags">
        {dossier.fraudFlags.length === 0 ? (
          <QuietEmpty>No fraud flags on this user’s clips or campaigns.</QuietEmpty>
        ) : (
          <RecordList>
            {dossier.fraudFlags.map((flag) => (
              <FraudRow key={flag.id} flag={flag} />
            ))}
          </RecordList>
        )}
      </Section>

      <Section id="alerts" kicker="Preferences" title="Notifications">
        <ul className="space-y-2">
          <Pref label="Email" on={profile.notifyEmail} />
          <Pref label="Withdrawals" on={profile.notifyWithdrawals} />
          <Pref label="Bookings" on={profile.notifyBookings} />
        </ul>
      </Section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1.5 font-display text-[1.65rem] leading-none tracking-tight text-foreground sm:text-[1.85rem]">
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[11px] text-muted-light">{hint}</p> : null}
    </div>
  );
}

function Pref({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
      <span className="text-sm">{label}</span>
      <Badge tone={on ? "success" : "muted"}>{on ? "On" : "Off"}</Badge>
    </li>
  );
}

function RecordList({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2.5">{children}</ul>;
}

function SocialGroup({ title, links }: { title: string; links: SocialLink[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => {
          const href = socialHref(link.platform, link.value);
          const chip = (
            <>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-white">
                <PlatformIcon platform={link.platform} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {PLATFORM_LABEL[link.platform]}
                </span>
                <span className="block truncate text-sm">{socialCaption(link.value)}</span>
                {link.status ? (
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-muted">
                    {link.status}
                  </span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={`${link.source}-${link.platform}-${link.value}`}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-border bg-white py-1.5 pl-1.5 pr-3.5 shadow-sm transition hover:border-gold/50"
                >
                  {chip}
                </a>
              ) : (
                <span className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-border bg-white py-1.5 pl-1.5 pr-3.5">
                  {chip}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SubmissionRow({ submission }: { submission: AdminSubmissionRow }) {
  const latest = submission.snapshots[0];
  return (
    <li className="list-row items-start">
      <div className="min-w-0">
        <p className="font-medium">{submission.campaignTitle ?? "Unknown campaign"}</p>
        <a href={submission.postUrl} className="section-link break-all" target="_blank" rel="noreferrer">
          {submission.postUrl}
        </a>
        <p className="mt-1 text-sm text-muted">
          {PLATFORM_LABEL[submission.platform]} · {formatNumber(submission.views)} views ·{" "}
          {formatMoney(submission.earningsCents)}
        </p>
        {submission.reviewNote ? <p className="mt-1 text-sm text-muted">{submission.reviewNote}</p> : null}
        <p className="mt-1 text-xs text-muted-light">
          {formatWhen(submission.createdAt)}
          {submission.snapshots.length > 0
            ? ` · ${formatNumber(submission.snapshots.length)} view snapshot${submission.snapshots.length === 1 ? "" : "s"}`
            : " · no view snapshots"}
          {latest ? ` · latest ${formatNumber(latest.views)} on ${formatWhen(latest.recordedAt)}` : ""}
        </p>
      </div>
      <Badge tone={statusTone(submission.status)}>{submission.status}</Badge>
    </li>
  );
}

function BookingRow({ booking }: { booking: AdminBookingRow }) {
  const side =
    booking.side === "both" ? "Brand and influencer" : booking.side === "brand" ? "As brand" : "As influencer";
  return (
    <li className="list-row items-start">
      <div className="min-w-0">
        <p className="font-medium">{booking.rateTitle ?? "Booking"}</p>
        <p className="text-sm text-muted">
          {side}
          {booking.counterpartyName ? ` · ${booking.counterpartyName}` : ""}
        </p>
        {booking.brief ? <p className="mt-1 text-sm leading-relaxed text-muted">{booking.brief}</p> : null}
        {booking.deliverableUrl ? (
          <a href={booking.deliverableUrl} className="section-link break-all" target="_blank" rel="noreferrer">
            {booking.deliverableUrl}
          </a>
        ) : null}
        <p className="mt-1 text-xs text-muted-light">{formatWhen(booking.createdAt)}</p>
      </div>
      <div className="text-right">
        <p className="font-display text-xl">{formatMoney(booking.amountCents)}</p>
        <Badge tone={statusTone(booking.status)}>{booking.status}</Badge>
      </div>
    </li>
  );
}

function FraudRow({ flag }: { flag: AdminFraudRow }) {
  return (
    <li className="list-row items-start">
      <div className="min-w-0">
        <p className="font-medium">{flag.reason}</p>
        <p className="text-sm text-muted">
          {flag.relation}
          {flag.campaignTitle ? ` · ${flag.campaignTitle}` : ""}
        </p>
        {flag.postUrl ? (
          <a href={flag.postUrl} className="section-link break-all" target="_blank" rel="noreferrer">
            {flag.postUrl}
          </a>
        ) : null}
        <p className="mt-1 text-xs text-muted-light">
          {formatWhen(flag.createdAt)}
          {flag.resolvedAt ? ` · resolved ${formatWhen(flag.resolvedAt)}` : ""}
        </p>
      </div>
      <Badge tone={statusTone(flag.status)}>{flag.status}</Badge>
    </li>
  );
}
