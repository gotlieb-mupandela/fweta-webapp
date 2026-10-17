import { revalidatePath } from "next/cache";

import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { AppNotification, NotificationKind, Profile } from "@/lib/db/types";
import {
  bookingAcceptedEmail,
  bookingCompletedBrandEmail,
  bookingCompletedCreatorEmail,
  bookingDeclinedEmail,
  bookingRequestedEmail,
  budgetLowEmail,
  campaignLiveEmail,
  depositConfirmedEmail,
  submissionDecisionEmail,
  welcomeEmail,
  withdrawalAdminEmail,
  withdrawalPaidEmail,
  withdrawalRejectedEmail,
  withdrawalRequestedEmail,
} from "@/lib/email/templates";
import type { EmailDocument } from "@/lib/email/layout";
import { renderEmail } from "@/lib/email/layout";
import {
  preferencesUrl,
  signPrefsToken,
  unsubscribeHeaders,
  unsubscribePageUrl,
  type EmailScope,
  type PreferenceLinks,
} from "@/lib/email/preferences";
import type { OutboundEmail } from "@/lib/email/send";
import { sendEmails } from "@/lib/email/send";
import { allowsEmail, isCreator, publicName } from "@/lib/notifications/audience";
import { alreadyDispatched, claimDispatch, pushNotification } from "@/lib/notifications/inbox";
import { runAfterResponse } from "@/lib/notifications/schedule";
import { campaignMatchesCreator } from "@/lib/marketplace/growth";
import { formatMoney } from "@/lib/utils";

type Notice = {
  user: Profile;
  dedupeKey: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  email?: {
    scope: EmailScope;
    transactional?: boolean;
    build: (links: PreferenceLinks) => EmailDocument;
  };
};

function excerpt(value: string | null | undefined, max = 280): string {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

function typeLabel(type: string): string {
  return type === "ugc" ? "UGC" : "Clipping";
}

async function dispatch(notices: Notice[], options?: { defer?: boolean }) {
  const defer = options?.defer ?? true;
  const actionable = notices.filter((notice) => notice.user && !notice.user.suspended);
  if (actionable.length === 0) return;

  const snapshot = await readStore();
  const fresh = actionable.filter((notice) => !alreadyDispatched(snapshot, notice.dedupeKey));
  if (fresh.length === 0) return;

  const rendered = new Map<string, OutboundEmail>();
  for (const notice of fresh) {
    if (!notice.email) continue;
    const allowed =
      notice.email.transactional || allowsEmail(notice.user, notice.email.scope);
    if (!allowed) continue;
    try {
      const token = await signPrefsToken(notice.user.id);
      const doc = notice.email.build({
        preferencesHref: preferencesUrl(token),
        unsubscribeHref: unsubscribePageUrl(token, notice.email.scope),
      });
      const view = renderEmail(doc);
      rendered.set(notice.dedupeKey, {
        to: notice.user.email,
        subject: view.subject,
        html: view.html,
        text: view.text,
        headers: unsubscribeHeaders(token, notice.email.scope),
      });
    } catch (err) {
      console.warn("[fweta] email render skipped:", err instanceof Error ? err.message : err);
    }
  }

  const outbound: OutboundEmail[] = [];
  await updateStore((store) => {
    for (const notice of fresh) {
      if (!claimDispatch(store, notice.dedupeKey)) continue;
      const row: AppNotification = {
        id: newId(),
        userId: notice.user.id,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        href: notice.href,
        readAt: null,
        createdAt: nowIso(),
      };
      pushNotification(store, row);
      const email = rendered.get(notice.dedupeKey);
      if (email) outbound.push(email);
    }
  });

  try {
    revalidatePath("/dashboard/notifications");
    revalidatePath("/dashboard", "layout");
  } catch {
    // revalidatePath is a no-op outside a Next request.
  }

  if (outbound.length === 0) return;
  if (defer) runAfterResponse(() => sendEmails(outbound));
  else await sendEmails(outbound);
}

export async function notifyWelcome(profile: Profile) {
  await dispatch([
    {
      user: profile,
      dedupeKey: `welcome:${profile.id}`,
      kind: "welcome",
      title: "Welcome to fweta",
      body: welcomeBody(profile),
      href: welcomeHref(profile),
      email: {
        scope: "email",
        transactional: true,
        build: (links) => welcomeEmail({ profile, links }),
      },
    },
  ]);
}

function welcomeBody(profile: Profile): string {
  if (profile.roles.includes("brand") && !isCreator(profile)) {
    return "Your workspace is ready. Fund your wallet, then post a campaign.";
  }
  if (profile.roles.includes("influencer") && profile.roles.includes("clipper")) {
    return "Add your socials and rate card, then watch for campaigns and brand deals.";
  }
  if (profile.roles.includes("influencer")) {
    return "Finish your profile and publish a rate card so brands can book you.";
  }
  return "Finish your profile, then browse live campaigns and submit a clip.";
}

function welcomeHref(profile: Profile): string {
  if (profile.primaryRole === "brand" || (profile.roles.includes("brand") && !isCreator(profile))) {
    return "/dashboard/brand/deposits";
  }
  if (profile.roles.includes("influencer")) return "/dashboard/influencer/rate-cards";
  return "/campaigns";
}

export async function notifyCampaignLive(campaignId: string) {
  const store = await readStore();
  const campaign = store.campaigns.find((item) => item.id === campaignId);
  if (!campaign || campaign.status !== "active") return;
  const brand = store.profiles.find((item) => item.id === campaign.brandId);
  const brandName = publicName(brand);
  const recipients = store.profiles.filter(
    (profile) => isCreator(profile) && !profile.suspended && profile.id !== campaign.brandId,
  );

  await dispatch(
    recipients.map((user) => ({
      user,
      dedupeKey: `campaign.live:${campaign.id}:${user.id}`,
      kind: "campaign_live" as const,
      title: campaign.title,
      body: `${brandName} posted a ${typeLabel(campaign.type).toLowerCase()} campaign. Budget ${formatMoney(campaign.budgetTotalCents)}, CPM ${formatMoney(campaign.cpmCents)}.${
        campaignMatchesCreator(user, campaign, store.savedCampaigns ?? [], store.campaigns)
          ? " It matches a campaign you saved or a country you listed."
          : ""
      }`,
      href: `/campaigns/${campaign.id}`,
      email: {
        scope: "email" as const,
        build: (links) =>
          campaignLiveEmail({
            title: campaign.title,
            brandName,
            typeLabel: typeLabel(campaign.type),
            budgetCents: campaign.budgetTotalCents,
            cpmCents: campaign.cpmCents,
            capCents: campaign.maxPayoutPerSubmissionCents,
            platforms: campaign.platforms,
            campaignPath: `/campaigns/${campaign.id}`,
            links,
          }),
      },
    })),
  );
}

export async function deliverBudgetAlerts() {
  const store = await readStore();
  const alerts: Array<{
    campaignId: string;
    title: string;
    brandId: string;
    spentRatio: number;
  }> = [];
  const notices: Notice[] = [];

  for (const campaign of store.campaigns) {
    if (campaign.budgetTotalCents <= 0) continue;
    if (campaign.status !== "active" && campaign.status !== "completed") continue;
    const ratio = campaign.budgetSpentCents / campaign.budgetTotalCents;
    if (ratio < 0.8) continue;
    alerts.push({
      campaignId: campaign.id,
      title: campaign.title,
      brandId: campaign.brandId,
      spentRatio: ratio,
    });
    const brand = store.profiles.find((item) => item.id === campaign.brandId);
    if (!brand || brand.suspended) continue;
    const remaining = Math.max(0, campaign.budgetTotalCents - campaign.budgetSpentCents);
    const pct = Math.round(ratio * 100);
    notices.push({
      user: brand,
      dedupeKey: `campaign.budget-low:${campaign.id}`,
      kind: "campaign_budget_low",
      title: remaining <= 0 ? "Campaign budget used up" : "Campaign budget is low",
      body:
        remaining <= 0
          ? `${campaign.title} has used its full budget and stopped paying out.`
          : `${campaign.title} has used ${pct}% of its budget. About ${formatMoney(remaining)} is left.`,
      href: `/dashboard/brand/campaigns/${campaign.id}`,
      email: {
        scope: "email",
        build: (links) =>
          budgetLowEmail({
            title: campaign.title,
            spentCents: campaign.budgetSpentCents,
            totalCents: campaign.budgetTotalCents,
            campaignPath: `/dashboard/brand/campaigns/${campaign.id}`,
            links,
          }),
      },
    });
  }

  await dispatch(notices, { defer: false });
  return alerts;
}

export async function notifySubmissionReviewed(submissionId: string) {
  const store = await readStore();
  const submission = store.submissions.find((item) => item.id === submissionId);
  if (!submission) return;
  if (submission.status !== "approved" && submission.status !== "rejected") return;
  const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
  const creator = store.profiles.find((item) => item.id === submission.clipperId);
  if (!campaign || !creator) return;
  const brand = store.profiles.find((item) => item.id === campaign.brandId);
  const brandName = publicName(brand);
  const approved = submission.status === "approved";

  await dispatch([
    {
      user: creator,
      dedupeKey: `submission.${submission.status}:${submission.id}`,
      kind: approved ? "submission_approved" : "submission_rejected",
      title: approved ? "Submission approved" : "Submission not approved",
      body: approved
        ? `${brandName} approved your post on ${campaign.title}. Views can now earn.`
        : `${brandName} did not approve your post on ${campaign.title}.`,
      href: "/dashboard/clipper/submissions",
      email: {
        scope: "email",
        build: (links) =>
          submissionDecisionEmail({
            approved,
            campaignTitle: campaign.title,
            brandName,
            note: excerpt(submission.reviewNote, 400),
            links,
          }),
      },
    },
  ]);
}

async function bookingContext(bookingId: string) {
  const store = await readStore();
  const booking = store.bookings.find((item) => item.id === bookingId);
  if (!booking) return null;
  const brand = store.profiles.find((item) => item.id === booking.brandId);
  const creator = store.profiles.find((item) => item.id === booking.influencerId);
  const rate = store.rateCards.find((item) => item.id === booking.rateCardItemId);
  if (!brand || !creator) return null;
  return {
    booking,
    brand,
    creator,
    offerTitle: rate?.title || "a booking",
    brandName: publicName(brand),
    creatorName: publicName(creator),
  };
}

export async function notifyBookingRequested(bookingId: string) {
  const ctx = await bookingContext(bookingId);
  if (!ctx || ctx.booking.status !== "requested") return;
  await dispatch([
    {
      user: ctx.creator,
      dedupeKey: `booking.requested:${ctx.booking.id}`,
      kind: "booking_requested",
      title: "New booking request",
      body: `${ctx.brandName} requested ${ctx.offerTitle} for ${formatMoney(ctx.booking.amountCents)}.`,
      href: "/dashboard/influencer/bookings",
      email: {
        scope: "bookings",
        build: (links) =>
          bookingRequestedEmail({
            brandName: ctx.brandName,
            offerTitle: ctx.offerTitle,
            amountCents: ctx.booking.amountCents,
            brief: excerpt(ctx.booking.brief),
            links,
          }),
      },
    },
  ]);
}

export async function notifyBookingAccepted(bookingId: string) {
  const ctx = await bookingContext(bookingId);
  if (!ctx || ctx.booking.status !== "accepted") return;
  await dispatch([
    {
      user: ctx.brand,
      dedupeKey: `booking.accepted:${ctx.booking.id}`,
      kind: "booking_accepted",
      title: "Booking accepted",
      body: `${ctx.creatorName} accepted ${ctx.offerTitle} for ${formatMoney(ctx.booking.amountCents)}.`,
      href: "/dashboard/brand/bookings",
      email: {
        scope: "bookings",
        build: (links) =>
          bookingAcceptedEmail({
            creatorName: ctx.creatorName,
            offerTitle: ctx.offerTitle,
            amountCents: ctx.booking.amountCents,
            links,
          }),
      },
    },
  ]);
}

export async function notifyBookingDeclined(bookingId: string) {
  const ctx = await bookingContext(bookingId);
  if (!ctx) return;
  await dispatch([
    {
      user: ctx.brand,
      dedupeKey: `booking.declined:${ctx.booking.id}`,
      kind: "booking_declined",
      title: "Booking declined",
      body: `${ctx.creatorName} declined ${ctx.offerTitle}. ${formatMoney(ctx.booking.amountCents)} is back in your wallet.`,
      href: "/dashboard/brand/bookings",
      email: {
        scope: "bookings",
        build: (links) =>
          bookingDeclinedEmail({
            creatorName: ctx.creatorName,
            offerTitle: ctx.offerTitle,
            amountCents: ctx.booking.amountCents,
            links,
          }),
      },
    },
  ]);
}

export async function notifyBookingCompleted(bookingId: string) {
  const ctx = await bookingContext(bookingId);
  if (!ctx || ctx.booking.status !== "approved") return;
  await dispatch([
    {
      user: ctx.creator,
      dedupeKey: `booking.completed:${ctx.booking.id}:${ctx.creator.id}`,
      kind: "booking_completed",
      title: "Booking paid",
      body: `${ctx.brandName} approved ${ctx.offerTitle}. ${formatMoney(ctx.booking.amountCents)} is in your wallet.`,
      href: "/dashboard/settings/wallet",
      email: {
        scope: "bookings",
        build: (links) =>
          bookingCompletedCreatorEmail({
            brandName: ctx.brandName,
            offerTitle: ctx.offerTitle,
            amountCents: ctx.booking.amountCents,
            links,
          }),
      },
    },
    {
      user: ctx.brand,
      dedupeKey: `booking.completed:${ctx.booking.id}:${ctx.brand.id}`,
      kind: "booking_completed",
      title: "Booking complete",
      body: `You released ${formatMoney(ctx.booking.amountCents)} to ${ctx.creatorName} for ${ctx.offerTitle}.`,
      href: "/dashboard/brand/bookings",
      email: {
        scope: "bookings",
        build: (links) =>
          bookingCompletedBrandEmail({
            creatorName: ctx.creatorName,
            offerTitle: ctx.offerTitle,
            amountCents: ctx.booking.amountCents,
            links,
          }),
      },
    },
  ]);
}

export async function notifyWithdrawalRequested(withdrawalId: string) {
  const store = await readStore();
  const request = store.withdrawalRequests.find((item) => item.id === withdrawalId);
  if (!request || request.status !== "pending") return;
  const creator = store.profiles.find((item) => item.id === request.userId);
  if (!creator) return;
  const admins = store.profiles.filter(
    (profile) => profile.roles.includes("admin") && !profile.suspended && profile.id !== creator.id,
  );
  const creatorName = publicName(creator);

  await dispatch([
    {
      user: creator,
      dedupeKey: `withdrawal.requested:${request.id}`,
      kind: "withdrawal_requested",
      title: "Withdrawal requested",
      body: `${formatMoney(request.amountCents)} is pending. We will email you when the EFT is sent.`,
      href: "/dashboard/settings/withdraw",
      email: {
        scope: "withdrawals",
        build: (links) => withdrawalRequestedEmail({ amountCents: request.amountCents, links }),
      },
    },
    ...admins.map((admin) => ({
      user: admin,
      dedupeKey: `withdrawal.requested.admin:${request.id}:${admin.id}`,
      kind: "withdrawal_requested" as const,
      title: "Withdrawal to pay",
      body: `${creatorName} requested ${formatMoney(request.amountCents)} by EFT.`,
      href: "/dashboard/admin/withdrawals",
      email: {
        scope: "withdrawals" as const,
        build: (links: PreferenceLinks) =>
          withdrawalAdminEmail({
            creatorName,
            creatorEmail: creator.email,
            amountCents: request.amountCents,
            links,
          }),
      },
    })),
  ]);
}

export async function notifyWithdrawalPaid(withdrawalId: string) {
  const store = await readStore();
  const request = store.withdrawalRequests.find((item) => item.id === withdrawalId);
  if (!request || request.status !== "paid") return;
  const creator = store.profiles.find((item) => item.id === request.userId);
  if (!creator) return;
  await dispatch([
    {
      user: creator,
      dedupeKey: `withdrawal.paid:${request.id}`,
      kind: "withdrawal_paid",
      title: "Withdrawal paid",
      body: request.bankReference
        ? `${formatMoney(request.amountCents)} was sent by EFT. Reference ${request.bankReference}.`
        : `${formatMoney(request.amountCents)} was sent by EFT.`,
      href: "/dashboard/settings/wallet",
      email: {
        scope: "withdrawals",
        build: (links) =>
          withdrawalPaidEmail({
            amountCents: request.amountCents,
            bankReference: request.bankReference,
            links,
          }),
      },
    },
  ]);
}

export async function notifyWithdrawalRejected(withdrawalId: string) {
  const store = await readStore();
  const request = store.withdrawalRequests.find((item) => item.id === withdrawalId);
  if (!request || request.status !== "rejected") return;
  const creator = store.profiles.find((item) => item.id === request.userId);
  if (!creator) return;
  await dispatch([
    {
      user: creator,
      dedupeKey: `withdrawal.rejected:${request.id}`,
      kind: "withdrawal_rejected",
      title: "Withdrawal returned",
      body: `${formatMoney(request.amountCents)} is back in your available balance.`,
      href: "/dashboard/settings/wallet",
      email: {
        scope: "withdrawals",
        build: (links) =>
          withdrawalRejectedEmail({
            amountCents: request.amountCents,
            note: excerpt(request.adminNote, 400),
            links,
          }),
      },
    },
  ]);
}

export async function notifyDepositConfirmed(depositId: string) {
  const store = await readStore();
  const deposit = store.brandDeposits.find((item) => item.id === depositId);
  if (!deposit || deposit.status !== "credited") return;
  const brand = store.profiles.find((item) => item.id === deposit.brandId);
  if (!brand) return;
  await dispatch([
    {
      user: brand,
      dedupeKey: `deposit.confirmed:${deposit.id}`,
      kind: "deposit_confirmed",
      title: "Deposit confirmed",
      body: `${formatMoney(deposit.amountCents)} is in your wallet.`,
      href: "/dashboard/brand/deposits",
      email: {
        scope: "email",
        build: (links) =>
          depositConfirmedEmail({
            amountCents: deposit.amountCents,
            note: deposit.note,
            links,
          }),
      },
    },
  ]);
}
