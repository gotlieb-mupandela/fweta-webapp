export type HelpArticle = {
  id: string;
  group: string;
  question: string;
  answer: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "what-is-fweta",
    group: "Getting started",
    question: "What is fweta?",
    answer:
      "fweta is a marketplace for brands and creators. Brands fund campaigns and pay per 1,000 qualified views. Creators post clips and earn into a wallet. Payouts are sent manually by EFT.",
  },
  {
    id: "roles",
    group: "Getting started",
    question: "Can one login be both a brand and a creator?",
    answer:
      "Yes. Add both roles in Settings, then use the role switcher in the sidebar. Brand tools and creator tools stay separate, and you can move between them without a second login.",
  },
  {
    id: "setup",
    group: "Getting started",
    question: "What happens after signup?",
    answer:
      "A short setup asks for your name and, depending on your role, a company profile or your topics, social accounts, and payout details. You can skip a step. The checklist on the dashboard keeps the unfinished ones.",
  },
  {
    id: "first-campaign",
    group: "Campaigns",
    question: "How do I run a first campaign?",
    answer:
      "Create a draft with the rate per 1,000 views, the budget, a minimum view floor, and a per-clip cap. Request a bank transfer confirmation. After an admin credits the wallet, activate the campaign so creators can submit.",
  },
  {
    id: "funding",
    group: "Campaigns",
    question: "How is a campaign funded?",
    answer:
      "You transfer the budget by EFT and request confirmation in Deposits. An admin checks the transfer and credits the wallet. There is no card checkout. Activating the campaign moves that balance into the campaign budget.",
  },
  {
    id: "going-live",
    group: "Campaigns",
    question: "When does a campaign go live?",
    answer:
      "A draft stays private. Activate it from the campaign page once the wallet covers the budget. Creators then see it and can submit links.",
  },
  {
    id: "review",
    group: "Campaigns",
    question: "How do approvals and rejections work?",
    answer:
      "Each submitted link waits in the queue. Approve clips that match the brief. Reject the ones that do not, and add a note so the creator knows why. Only approved clips can earn.",
  },
  {
    id: "socials",
    group: "Social accounts",
    question: "Can I connect more than one account per platform?",
    answer:
      "Yes. Add each TikTok, Instagram, YouTube, or X account with its own bio code. It stays pending until an admin confirms it. Then choose a default and pick that account when you submit. Stats are kept per account.",
  },
  {
    id: "bio-code",
    group: "Social accounts",
    question: "How does bio verification work?",
    answer:
      "Each account gets a short code that starts with FWETA-. Copy it, add it to that account's public bio, then tap I've added it. The account stays Pending verification and cannot be used on a clip until an admin opens the profile and approves it. If they reject it, you get the reason and can generate a new code. After approval you may remove the code from your bio.",
  },
  {
    id: "team",
    group: "Brand team",
    question: "How do brand teams and extra brands work?",
    answer:
      "A login can own more than one brand workspace and switch between them. Invite teammates by email as a manager or a viewer. Owners and managers can edit campaigns. Viewers can look, but not change them. Teammates accept the invite after they sign in with that email.",
  },
  {
    id: "earnings",
    group: "Earnings and payouts",
    question: "When do clip earnings show up?",
    answer:
      "After a clip is approved, an admin records the qualified view count. Earnings are calculated from the campaign rate per 1,000 views, then capped by the per-clip maximum and the remaining budget. The amount is added to the creator wallet.",
  },
  {
    id: "payout",
    group: "Earnings and payouts",
    question: "How do I get paid?",
    answer:
      "Add your bank details, then request a withdrawal of at least N$100. An admin sends the EFT and marks the request paid. fweta does not pay out to a card.",
  },
  {
    id: "admin",
    group: "Admins",
    question: "What does an admin do on the first day?",
    answer:
      "Confirm brand pay-ins, confirm social accounts in Account verification, record view checks on approved clips, and pay withdrawal requests by EFT. The onboarding page shows who has finished setup. Also publish directory listings and reviews, and read license disputes.",
  },
  {
    id: "ugc-brief",
    group: "UGC for ads",
    question: "What is a UGC brief?",
    answer:
      "A brand posts a brief for videos it will use itself, in paid ads, on its website, or in promos. The creator does not have to post the video on their own feed. The brand sets the format, length, number of videos, whether raw files are required, the usage rights, the term, the platforms, the territory, and a fixed fee per video. Opening the brief reserves that fee times the number of videos from the brand wallet.",
  },
  {
    id: "ugc-license",
    group: "UGC for ads",
    question: "When does a licensed video get paid?",
    answer:
      "Apply, or accept an invite, then upload the file. The brand can request revisions up to the limit on the brief, or approve the file. Approval pays the fixed fee into the creator wallet and stores a license with the terms. Download the license summary from the brief. Closing a brief returns any fee that was reserved but not paid. Payout from the wallet is still a manual EFT.",
  },
  {
    id: "ugc-income",
    group: "UGC for ads",
    question: "How are view earnings different from UGC fees?",
    answer:
      "View earnings come from campaigns that pay per 1,000 qualified views. UGC fees are a fixed amount per approved file. Earnings shows the two amounts separately. Both sit in the same wallet.",
  },
  {
    id: "directory",
    group: "Trust directory",
    question: "How does a business get a public review page?",
    answer:
      "The brand saves a business listing and opts in to creator reviews. A creator writes a recommendation and opts in too. An admin publishes the listing and the review before they appear on /directory and the business page. Either the creator or an admin can take a review down. Public pages include the business name, city, creator, rating, and date so they can be cited.",
  },
];

export function collectHelpCopy(): string[] {
  const lines: string[] = ["Help center", "Answers for the first campaign, the first clip, UGC licenses, the trust directory, and the first payout."];
  for (const article of HELP_ARTICLES) {
    lines.push(article.group, article.question, article.answer);
  }
  return lines;
}
