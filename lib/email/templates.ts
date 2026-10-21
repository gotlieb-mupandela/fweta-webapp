import type { Profile } from "@/lib/db/types";
import { appUrl } from "@/lib/email/config";
import type { EmailDocument } from "@/lib/email/layout";
import type { PreferenceLinks } from "@/lib/email/preferences";
import { unsubscribeLabel } from "@/lib/email/preferences";
import { greetingName, welcomeVariant, type WelcomeVariant } from "@/lib/notifications/audience";
import { formatMoney } from "@/lib/utils";
import type { SocialPlatform, UserRole } from "@/types/enums";

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
  instagram: "Instagram Reels",
  facebook: "Facebook Reels",
  x: "X",
};

export function platformLabel(platform: SocialPlatform): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function linksFor(scope: "email" | "bookings" | "withdrawals", links: PreferenceLinks) {
  return {
    preferencesHref: links.preferencesHref,
    unsubscribeHref: links.unsubscribeHref,
    unsubscribeLabel: unsubscribeLabel(scope),
  };
}

function absolute(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function welcomeEmail(input: {
  profile: Pick<Profile, "displayName" | "email" | "firstName" | "roles" | "primaryRole">;
  links: PreferenceLinks;
}): EmailDocument {
  const variant = welcomeVariant(input.profile.roles, input.profile.primaryRole);
  const name = greetingName(input.profile);
  const hello = name ? `${name}, we are glad you are here.` : "We are glad you are here.";
  const alsoCreator =
    input.profile.roles.includes("brand") &&
    (input.profile.roles.includes("influencer") || input.profile.roles.includes("clipper"));
  const alsoBrand =
    input.profile.roles.includes("brand") &&
    variant !== "brand" &&
    (input.profile.roles.includes("influencer") || input.profile.roles.includes("clipper"));

  const shared = {
    subject: "Welcome to fweta",
    preheader: "You are in. Stay close for campaigns and brand deals.",
    eyebrow: "You're in",
    ...linksFor("email", input.links),
    footnote: "Windhoek-built, for African creators and the brands who work with them.",
  };

  return { ...shared, ...welcomeBody(variant, hello, alsoCreator, alsoBrand) };
}

function welcomeBody(
  variant: WelcomeVariant,
  hello: string,
  alsoCreator: boolean,
  alsoBrand: boolean,
): Pick<EmailDocument, "headline" | "kicker" | "paragraphs" | "steps" | "actions"> {
  if (variant === "brand") {
    return {
      headline: "Welcome to fweta.",
      kicker: "Your campaigns, your creators, one wallet.",
      paragraphs: [
        hello,
        "fweta is where brands pay for distribution and creators set the terms. You are on the brand side: choose a budget, set a CPM, and let clippers and influencers carry the work.",
        "Stay close. New creators, campaign results, and brand deals all show up here.",
        alsoCreator
          ? "This same account can also clip campaigns and take bookings. Switch roles whenever you like."
          : "",
      ].filter(Boolean),
      steps: [
        "Complete your profile so creators know who they are working with.",
        "Fund your wallet. A campaign draws from that balance when you launch it.",
        "Post your first campaign and open it to clippers and influencers.",
      ],
      actions: [
        { label: "Complete your profile", href: absolute("/onboarding") },
        { label: "Fund your wallet", href: absolute("/dashboard/brand/deposits"), tone: "secondary" },
        { label: "Post a campaign", href: absolute("/dashboard/brand/campaigns/new"), tone: "secondary" },
      ],
    };
  }

  if (variant === "influencer") {
    return {
      headline: "Welcome. Your rate, your terms.",
      kicker: "Set the rate. Take the work you want.",
      paragraphs: [
        hello,
        "Brands can book you directly from your rate card. You can also join open campaigns and earn per verified view.",
        "Stay connected. Campaigns and brand deals land here first, so you do not have to chase them.",
        alsoBrand ? "You also have a brand workspace on this account, whenever you want to fund a campaign of your own." : "",
      ].filter(Boolean),
      steps: [
        "Complete your profile.",
        "Add the socials you actually post on.",
        "Publish a rate card so brands can request a booking.",
      ],
      actions: [
        { label: "Complete your profile", href: absolute("/onboarding") },
        { label: "Add your socials", href: absolute("/dashboard/influencer/profile"), tone: "secondary" },
        { label: "Set your rate card", href: absolute("/dashboard/influencer/rate-cards"), tone: "secondary" },
      ],
    };
  }

  if (variant === "clipper") {
    return {
      headline: "Welcome. Your views can pay.",
      kicker: "Clips in. Verified views. Paid out.",
      paragraphs: [
        hello,
        "Browse open campaigns, post where your audience already is, and submit the link. You earn per verified view, up to the campaign cap.",
        "Stay connected so you hear when a new campaign goes live.",
        alsoBrand ? "You also have a brand workspace on this account, whenever you want to fund a campaign of your own." : "",
      ].filter(Boolean),
      steps: [
        "Complete your profile.",
        "Add your socials.",
        "Browse live campaigns and submit your first clip.",
      ],
      actions: [
        { label: "Complete your profile", href: absolute("/onboarding") },
        { label: "Add your socials", href: absolute("/onboarding"), tone: "secondary" },
        { label: "Browse campaigns", href: absolute("/campaigns"), tone: "secondary" },
      ],
    };
  }

  return {
    headline: "Welcome. Campaigns and brand deals, together.",
    kicker: "Bookings and campaigns, on your terms.",
    paragraphs: [
      hello,
      "You can clip open campaigns for per-view pay, and take direct bookings from your rate card.",
      "Stay connected. We will tell you when a campaign goes live and when a brand wants to work with you.",
      alsoBrand ? "You also have a brand workspace on this account, whenever you want to fund a campaign of your own." : "",
    ].filter(Boolean),
    steps: [
      "Complete your profile and add your socials.",
      "Publish a rate card for direct bookings.",
      "Browse live campaigns when you want per-view work.",
    ],
    actions: [
      { label: "Complete your profile", href: absolute("/onboarding") },
      { label: "Set your rate card", href: absolute("/dashboard/influencer/rate-cards"), tone: "secondary" },
      { label: "Browse campaigns", href: absolute("/campaigns"), tone: "secondary" },
    ],
  };
}

export function campaignLiveEmail(input: {
  title: string;
  brandName: string;
  typeLabel: string;
  budgetCents: number;
  cpmCents: number;
  capCents: number;
  platforms: SocialPlatform[];
  campaignPath: string;
  links: PreferenceLinks;
}): EmailDocument {
  const platforms = joinList(input.platforms.map(platformLabel));
  return {
    subject: `New campaign: ${input.title}`,
    preheader: `${input.brandName} just opened ${input.title}.`,
    eyebrow: "Now live",
    headline: `${input.title} is open.`,
    kicker: "A new brief is waiting.",
    paragraphs: [
      `${input.brandName} just launched a ${input.typeLabel.toLowerCase()} campaign.`,
      `The budget is ${formatMoney(input.budgetCents)}. Creators earn ${formatMoney(input.cpmCents)} per 1,000 qualified views, up to ${formatMoney(input.capCents)} per video.`,
      "Stay connected for the next one. If this brief fits, submit while the budget is still open.",
    ],
    details: [
      { label: "Brand", value: input.brandName },
      { label: "Type", value: input.typeLabel },
      { label: "Budget", value: formatMoney(input.budgetCents) },
      { label: "CPM", value: `${formatMoney(input.cpmCents)} / 1,000 views` },
      { label: "Per video cap", value: formatMoney(input.capCents) },
      { label: "Platforms", value: platforms || "See the brief" },
    ],
    actions: [{ label: "View campaign", href: absolute(input.campaignPath) }],
    footnote: "You are receiving this because you create on fweta.",
    ...linksFor("email", input.links),
  };
}

export function budgetLowEmail(input: {
  title: string;
  spentCents: number;
  totalCents: number;
  campaignPath: string;
  links: PreferenceLinks;
}): EmailDocument {
  const remaining = Math.max(0, input.totalCents - input.spentCents);
  const pct = input.totalCents > 0 ? Math.round((input.spentCents / input.totalCents) * 100) : 100;
  const usedUp = remaining <= 0;
  return {
    subject: usedUp ? `${input.title} is out of budget` : `${input.title} is nearly out of budget`,
    preheader: usedUp
      ? `The budget on ${input.title} is used up.`
      : `${pct}% of the budget on ${input.title} is used.`,
    eyebrow: "Budget",
    headline: usedUp ? "This budget is used up." : "This campaign is running low.",
    kicker: input.title,
    paragraphs: usedUp
      ? [
          `The budget on ${input.title} is used up, so it has stopped paying out.`,
          "Fund your wallet if you want to launch another campaign, or open this one if you plan to extend it.",
        ]
      : [
          `${input.title} has used ${pct}% of its budget. About ${formatMoney(remaining)} is left of ${formatMoney(input.totalCents)}.`,
          "Earnings stop when the budget hits zero. Open the campaign if you want to adjust it before that happens.",
        ],
    details: [
      { label: "Spent", value: formatMoney(input.spentCents) },
      { label: "Budget", value: formatMoney(input.totalCents) },
      { label: "Remaining", value: formatMoney(remaining) },
    ],
    actions: [
      { label: "View campaign", href: absolute(input.campaignPath) },
      { label: "Wallet", href: absolute("/dashboard/settings/wallet"), tone: "secondary" },
    ],
    ...linksFor("email", input.links),
  };
}

export function submissionDecisionEmail(input: {
  approved: boolean;
  campaignTitle: string;
  brandName: string;
  note?: string | null;
  links: PreferenceLinks;
}): EmailDocument {
  const note = input.note?.trim();
  if (input.approved) {
    return {
      subject: `Approved: ${input.campaignTitle}`,
      preheader: `${input.brandName} approved your submission.`,
      eyebrow: "Submission",
      headline: "Your clip was approved.",
      kicker: input.campaignTitle,
      paragraphs: [
        `${input.brandName} approved your post on ${input.campaignTitle}.`,
        "Verified views now count toward earnings at the campaign CPM, up to the per-video cap.",
        note ? `Note from the brand: ${note}` : "",
      ].filter(Boolean),
      actions: [{ label: "View your submissions", href: absolute("/dashboard/clipper/submissions") }],
      ...linksFor("email", input.links),
    };
  }
  return {
    subject: `Update on ${input.campaignTitle}`,
    preheader: `${input.brandName} did not approve this submission.`,
    eyebrow: "Submission",
    headline: "This submission was not approved.",
    kicker: input.campaignTitle,
    paragraphs: [
      `${input.brandName} did not approve your post on ${input.campaignTitle}.`,
      note ? `Note from the brand: ${note}` : "",
      "The campaign may still be open. A different post can be submitted if it fits the brief.",
    ].filter(Boolean),
    actions: [
      { label: "View your submissions", href: absolute("/dashboard/clipper/submissions") },
      { label: "Browse campaigns", href: absolute("/campaigns"), tone: "secondary" },
    ],
    ...linksFor("email", input.links),
  };
}

export function bookingRequestedEmail(input: {
  brandName: string;
  offerTitle: string;
  amountCents: number;
  brief?: string;
  links: PreferenceLinks;
}): EmailDocument {
  const brief = input.brief?.trim();
  return {
    subject: `${input.brandName} wants to book you`,
    preheader: `${input.offerTitle} for ${formatMoney(input.amountCents)}.`,
    eyebrow: "Booking",
    headline: "A brand wants to work with you.",
    kicker: input.offerTitle,
    paragraphs: [
      `${input.brandName} requested ${input.offerTitle} for ${formatMoney(input.amountCents)}.`,
      "Funds are held in escrow until you deliver and they approve. Review the brief, then accept or decline.",
      brief ? `Brief: ${brief}` : "",
    ].filter(Boolean),
    details: [
      { label: "Brand", value: input.brandName },
      { label: "Offer", value: input.offerTitle },
      { label: "Amount", value: formatMoney(input.amountCents) },
    ],
    actions: [{ label: "Review the request", href: absolute("/dashboard/influencer/bookings") }],
    ...linksFor("bookings", input.links),
  };
}

export function bookingAcceptedEmail(input: {
  creatorName: string;
  offerTitle: string;
  amountCents: number;
  links: PreferenceLinks;
}): EmailDocument {
  return {
    subject: `${input.creatorName} accepted your booking`,
    preheader: `${input.offerTitle} is confirmed.`,
    eyebrow: "Booking",
    headline: "You are booked.",
    kicker: input.offerTitle,
    paragraphs: [
      `${input.creatorName} accepted ${input.offerTitle} for ${formatMoney(input.amountCents)}.`,
      "They will deliver against your brief. Escrow stays held until you approve the work.",
    ],
    details: [
      { label: "Creator", value: input.creatorName },
      { label: "Offer", value: input.offerTitle },
      { label: "In escrow", value: formatMoney(input.amountCents) },
    ],
    actions: [{ label: "View booking", href: absolute("/dashboard/brand/bookings") }],
    ...linksFor("bookings", input.links),
  };
}

export function bookingDeclinedEmail(input: {
  creatorName: string;
  offerTitle: string;
  amountCents: number;
  links: PreferenceLinks;
}): EmailDocument {
  return {
    subject: `${input.creatorName} declined the booking`,
    preheader: `${formatMoney(input.amountCents)} is back in your wallet.`,
    eyebrow: "Booking",
    headline: "The booking was declined.",
    kicker: input.offerTitle,
    paragraphs: [
      `${input.creatorName} declined ${input.offerTitle}.`,
      `${formatMoney(input.amountCents)} has been returned to your available wallet balance.`,
    ],
    actions: [
      { label: "View bookings", href: absolute("/dashboard/brand/bookings") },
      { label: "Browse creators", href: absolute("/influencers"), tone: "secondary" },
    ],
    ...linksFor("bookings", input.links),
  };
}

export function bookingCompletedCreatorEmail(input: {
  brandName: string;
  offerTitle: string;
  amountCents: number;
  links: PreferenceLinks;
}): EmailDocument {
  return {
    subject: `Payment released: ${formatMoney(input.amountCents)}`,
    preheader: `${input.brandName} approved your delivery.`,
    eyebrow: "Booking",
    headline: "The work is approved. You have been paid.",
    kicker: input.offerTitle,
    paragraphs: [
      `${input.brandName} approved your delivery for ${input.offerTitle}.`,
      `${formatMoney(input.amountCents)} is now in your fweta wallet. You can withdraw from N$100 whenever you are ready.`,
    ],
    actions: [{ label: "View wallet", href: absolute("/dashboard/settings/wallet") }],
    ...linksFor("bookings", input.links),
  };
}

export function bookingCompletedBrandEmail(input: {
  creatorName: string;
  offerTitle: string;
  amountCents: number;
  links: PreferenceLinks;
}): EmailDocument {
  return {
    subject: `Booking complete with ${input.creatorName}`,
    preheader: `${formatMoney(input.amountCents)} has been released.`,
    eyebrow: "Booking",
    headline: "You approved the delivery.",
    kicker: input.offerTitle,
    paragraphs: [
      `Escrow of ${formatMoney(input.amountCents)} has been released to ${input.creatorName} for ${input.offerTitle}.`,
      "Thank you for closing the loop. Creators get paid when brands do this promptly.",
    ],
    actions: [{ label: "View booking", href: absolute("/dashboard/brand/bookings") }],
    ...linksFor("bookings", input.links),
  };
}

export function withdrawalRequestedEmail(input: {
  amountCents: number;
  links: PreferenceLinks;
}): EmailDocument {
  return {
    subject: `Withdrawal requested: ${formatMoney(input.amountCents)}`,
    preheader: "We have the request and will send it by EFT.",
    eyebrow: "Payout",
    headline: "We have your withdrawal.",
    paragraphs: [
      `You asked to withdraw ${formatMoney(input.amountCents)} by EFT.`,
      "Our team sends this manually. You will get another email when it is marked paid.",
      "The amount sits in pending until then, so it will not be spent twice.",
    ],
    actions: [{ label: "View withdrawal", href: absolute("/dashboard/settings/withdraw") }],
    ...linksFor("withdrawals", input.links),
  };
}

export function withdrawalPaidEmail(input: {
  amountCents: number;
  bankReference?: string | null;
  links: PreferenceLinks;
}): EmailDocument {
  const reference = input.bankReference?.trim();
  return {
    subject: "Your withdrawal was paid",
    preheader: `${formatMoney(input.amountCents)} is on the way by EFT.`,
    eyebrow: "Payout",
    headline: "Your payout is on the way.",
    paragraphs: [
      `${formatMoney(input.amountCents)} has been sent by EFT.`,
      reference
        ? `Bank reference: ${reference}. It can take a little time to appear, depending on the receiving bank.`
        : "It can take a little time to show at your bank, depending on the receiving bank.",
    ],
    actions: [{ label: "View wallet", href: absolute("/dashboard/settings/wallet") }],
    ...linksFor("withdrawals", input.links),
  };
}

export function withdrawalRejectedEmail(input: {
  amountCents: number;
  note?: string | null;
  links: PreferenceLinks;
}): EmailDocument {
  const note = input.note?.trim();
  return {
    subject: "Withdrawal update",
    preheader: `${formatMoney(input.amountCents)} is back in your wallet.`,
    eyebrow: "Payout",
    headline: "This withdrawal was not sent.",
    paragraphs: [
      `${formatMoney(input.amountCents)} is back in your available balance.`,
      note ? `Note: ${note}` : "You can request it again whenever you are ready.",
    ].filter(Boolean),
    actions: [{ label: "View wallet", href: absolute("/dashboard/settings/wallet") }],
    ...linksFor("withdrawals", input.links),
  };
}

export function withdrawalAdminEmail(input: {
  creatorName: string;
  creatorEmail: string;
  amountCents: number;
  links: PreferenceLinks;
}): EmailDocument {
  return {
    subject: `Payout to send: ${formatMoney(input.amountCents)}`,
    preheader: `${input.creatorName} requested a withdrawal.`,
    eyebrow: "Admin",
    headline: "A creator requested a withdrawal.",
    paragraphs: [
      `${input.creatorName} (${input.creatorEmail}) asked to withdraw ${formatMoney(input.amountCents)}.`,
      "Send the EFT from the payout queue, then mark the request paid and add the bank reference. Bank details stay in the dashboard and are not included here.",
    ],
    details: [
      { label: "Creator", value: input.creatorName },
      { label: "Email", value: input.creatorEmail },
      { label: "Amount", value: formatMoney(input.amountCents) },
    ],
    actions: [{ label: "Open the payout queue", href: absolute("/dashboard/admin/withdrawals") }],
    ...linksFor("withdrawals", input.links),
  };
}

export function depositConfirmedEmail(input: {
  amountCents: number;
  note?: string | null;
  links: PreferenceLinks;
}): EmailDocument {
  const note = input.note?.trim();
  const showNote = Boolean(note && note !== "Manual deposit (v1)" && note !== "Brand deposit (manual)");
  return {
    subject: `Deposit confirmed: ${formatMoney(input.amountCents)}`,
    preheader: `${formatMoney(input.amountCents)} is in your fweta wallet.`,
    eyebrow: "Wallet",
    headline: "Your deposit is in.",
    paragraphs: [
      `${formatMoney(input.amountCents)} has been added to your fweta wallet.`,
      showNote ? `Note: ${note}` : "",
      "You can fund a campaign or book a creator whenever you are ready.",
    ].filter(Boolean),
    actions: [
      { label: "Post a campaign", href: absolute("/dashboard/brand/campaigns/new") },
      { label: "View wallet", href: absolute("/dashboard/settings/wallet"), tone: "secondary" },
    ],
    ...linksFor("email", input.links),
  };
}

export function previewWelcomeProfile(
  variant: WelcomeVariant,
): Pick<Profile, "displayName" | "email" | "firstName" | "roles" | "primaryRole"> {
  if (variant === "brand") {
    return {
      displayName: "Desert Brands",
      email: "brand@fweta.test",
      firstName: "Lina",
      roles: ["brand"] as UserRole[],
      primaryRole: "brand",
    };
  }
  if (variant === "influencer") {
    return {
      displayName: "Amara Nangolo",
      email: "creator@fweta.test",
      firstName: "Amara",
      roles: ["influencer"],
      primaryRole: "influencer",
    };
  }
  if (variant === "clipper") {
    return {
      displayName: "Kai Clips",
      email: "clipper@fweta.test",
      firstName: "Kai",
      roles: ["clipper"],
      primaryRole: "clipper",
    };
  }
  return {
    displayName: "Amara Nangolo",
    email: "creator@fweta.test",
    firstName: "Amara",
    roles: ["influencer", "clipper"],
    primaryRole: "influencer",
  };
}
