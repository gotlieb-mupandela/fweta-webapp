import { renderEmail, type RenderedEmail } from "@/lib/email/layout";
import { samplePreferenceLinks } from "@/lib/email/preferences";
import {
  bookingAcceptedEmail,
  bookingCompletedBrandEmail,
  bookingCompletedCreatorEmail,
  bookingDeclinedEmail,
  bookingRequestedEmail,
  budgetLowEmail,
  campaignLiveEmail,
  depositConfirmedEmail,
  previewWelcomeProfile,
  submissionDecisionEmail,
  welcomeEmail,
  withdrawalAdminEmail,
  passwordResetEmail,
  withdrawalPaidEmail,
  withdrawalRejectedEmail,
  withdrawalRequestedEmail,
} from "@/lib/email/templates";

export type EmailTemplateId =
  | "welcome-brand"
  | "welcome-influencer"
  | "welcome-clipper"
  | "welcome-creator"
  | "campaign-live"
  | "campaign-budget-low"
  | "submission-approved"
  | "submission-rejected"
  | "booking-requested"
  | "booking-accepted"
  | "booking-declined"
  | "booking-completed-creator"
  | "booking-completed-brand"
  | "withdrawal-requested"
  | "withdrawal-paid"
  | "withdrawal-rejected"
  | "withdrawal-admin"
  | "deposit-confirmed"
  | "password-reset";

export type EmailTemplateMeta = {
  id: EmailTemplateId;
  group: string;
  label: string;
};

export const EMAIL_TEMPLATES: EmailTemplateMeta[] = [
  { id: "welcome-brand", group: "Welcome", label: "Welcome, brand" },
  { id: "welcome-influencer", group: "Welcome", label: "Welcome, influencer" },
  { id: "welcome-clipper", group: "Welcome", label: "Welcome, clipper" },
  { id: "welcome-creator", group: "Welcome", label: "Welcome, influencer and clipper" },
  { id: "campaign-live", group: "Campaigns", label: "Campaign is live" },
  { id: "campaign-budget-low", group: "Campaigns", label: "Campaign nearly out of budget" },
  { id: "submission-approved", group: "Submissions", label: "Submission approved" },
  { id: "submission-rejected", group: "Submissions", label: "Submission rejected" },
  { id: "booking-requested", group: "Bookings", label: "Booking requested" },
  { id: "booking-accepted", group: "Bookings", label: "Booking accepted" },
  { id: "booking-declined", group: "Bookings", label: "Booking declined" },
  { id: "booking-completed-creator", group: "Bookings", label: "Booking completed, creator" },
  { id: "booking-completed-brand", group: "Bookings", label: "Booking completed, brand" },
  { id: "deposit-confirmed", group: "Wallet", label: "Deposit confirmed" },
  { id: "withdrawal-requested", group: "Wallet", label: "Withdrawal requested" },
  { id: "withdrawal-paid", group: "Wallet", label: "Withdrawal paid" },
  { id: "withdrawal-rejected", group: "Wallet", label: "Withdrawal returned" },
  { id: "withdrawal-admin", group: "Wallet", label: "Withdrawal requested, admin" },
  { id: "password-reset", group: "Account", label: "Password reset" },
];

export function isEmailTemplateId(value: string | undefined): value is EmailTemplateId {
  return EMAIL_TEMPLATES.some((item) => item.id === value);
}

export function renderEmailPreview(id: EmailTemplateId): RenderedEmail & { label: string; group: string } {
  const links = samplePreferenceLinks();
  const meta = EMAIL_TEMPLATES.find((item) => item.id === id)!;
  const doc = (() => {
    switch (id) {
      case "welcome-brand":
        return welcomeEmail({ profile: previewWelcomeProfile("brand"), links });
      case "welcome-influencer":
        return welcomeEmail({ profile: previewWelcomeProfile("influencer"), links });
      case "welcome-clipper":
        return welcomeEmail({ profile: previewWelcomeProfile("clipper"), links });
      case "welcome-creator":
        return welcomeEmail({ profile: previewWelcomeProfile("creator"), links });
      case "campaign-live":
        return campaignLiveEmail({
          title: "Dune Radio: clip the interview",
          brandName: "Desert Brands",
          typeLabel: "Clipping",
          budgetCents: 1_200_000,
          cpmCents: 8_000,
          capCents: 25_000,
          platforms: ["tiktok", "instagram", "youtube"],
          campaignPath: "/campaigns/preview",
          links,
        });
      case "campaign-budget-low":
        return budgetLowEmail({
          title: "Dune Radio: clip the interview",
          spentCents: 1_032_000,
          totalCents: 1_200_000,
          campaignPath: "/dashboard/brand/campaigns/preview",
          links,
        });
      case "submission-approved":
        return submissionDecisionEmail({
          approved: true,
          campaignTitle: "Dune Radio: clip the interview",
          brandName: "Desert Brands",
          note: "Love the opening hook. Keep the logo in the first two seconds.",
          links,
        });
      case "submission-rejected":
        return submissionDecisionEmail({
          approved: false,
          campaignTitle: "Dune Radio: clip the interview",
          brandName: "Desert Brands",
          note: "The clip uses footage from outside the brief. Try the interview cut.",
          links,
        });
      case "booking-requested":
        return bookingRequestedEmail({
          brandName: "Desert Brands",
          offerTitle: "TikTok post",
          amountCents: 250_000,
          brief: "One TikTok about the new Dune Radio episode. Mention the guest by name and keep it under 30 seconds.",
          links,
        });
      case "booking-accepted":
        return bookingAcceptedEmail({
          creatorName: "Amara Nangolo",
          offerTitle: "TikTok post",
          amountCents: 250_000,
          links,
        });
      case "booking-declined":
        return bookingDeclinedEmail({
          creatorName: "Amara Nangolo",
          offerTitle: "TikTok post",
          amountCents: 250_000,
          links,
        });
      case "booking-completed-creator":
        return bookingCompletedCreatorEmail({
          brandName: "Desert Brands",
          offerTitle: "TikTok post",
          amountCents: 250_000,
          links,
        });
      case "booking-completed-brand":
        return bookingCompletedBrandEmail({
          creatorName: "Amara Nangolo",
          offerTitle: "TikTok post",
          amountCents: 250_000,
          links,
        });
      case "deposit-confirmed":
        return depositConfirmedEmail({
          amountCents: 500_000,
          note: "EFT from FNB, reference DESERT-APR",
          links,
        });
      case "withdrawal-requested":
        return withdrawalRequestedEmail({ amountCents: 180_000, links });
      case "withdrawal-paid":
        return withdrawalPaidEmail({
          amountCents: 180_000,
          bankReference: "FWETA-18421",
          links,
        });
      case "withdrawal-rejected":
        return withdrawalRejectedEmail({
          amountCents: 180_000,
          note: "The account name did not match. Update the payout method and try again.",
          links,
        });
      case "withdrawal-admin":
        return withdrawalAdminEmail({
          creatorName: "Amara Nangolo",
          creatorEmail: "creator@fweta.test",
          amountCents: 180_000,
          links,
        });
      case "password-reset":
        return passwordResetEmail({
          resetUrl: "https://app.fweta.com/reset-password?token=preview",
          links,
        });
      default:
        return welcomeEmail({ profile: previewWelcomeProfile("brand"), links });
    }
  })();

  return { ...renderEmail(doc), label: meta.label, group: meta.group };
}
