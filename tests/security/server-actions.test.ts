import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

/**
 * Intended server actions. Each entry has a comment.
 * Helpers that sign a session, return a password hash, or write without a
 * session stay out of "use server" files, so they are not in this list.
 */
const ALLOWED_ACTIONS: { file: string; name: string }[] = [
  // Signed-in user lists their social accounts.
  { file: "app/actions/accounts.ts", name: "listMySocialAccounts" },
  // Signed-in user adds a social account.
  { file: "app/actions/accounts.ts", name: "addSocialAccountAction" },
  // Signed-in user asks for a social review.
  { file: "app/actions/accounts.ts", name: "requestSocialReviewAction" },
  // Signed-in user regenerates a bio code.
  { file: "app/actions/accounts.ts", name: "regenerateSocialCodeAction" },
  // Signed-in user picks a default social account.
  { file: "app/actions/accounts.ts", name: "setDefaultSocialAccountAction" },
  // Signed-in user removes one of their social accounts.
  { file: "app/actions/accounts.ts", name: "removeSocialAccountAction" },
  // Admin approves or rejects a social account.
  { file: "app/actions/accounts.ts", name: "adminReviewSocialAccountAction" },
  // Admin shortcut that calls the review action.
  { file: "app/actions/accounts.ts", name: "adminVerifySocialAccountAction" },
  // Admin removes a social account.
  { file: "app/actions/accounts.ts", name: "adminRemoveSocialAccountAction" },
  // Login form. Rate limited, then login().
  { file: "app/actions/auth.ts", name: "loginAction" },
  // Signup form. Rate limited, then signup().
  { file: "app/actions/auth.ts", name: "signupAction" },
  // Clears the session cookie and redirects home.
  { file: "app/actions/auth.ts", name: "logoutAction" },
  // Signed-in user switches among roles already on the account.
  { file: "app/actions/auth.ts", name: "switchPrimaryRoleAction" },
  // Signed-in user uploads a profile image.
  { file: "app/actions/avatar.ts", name: "uploadAvatarAction" },
  // Signed-in brand requests a booking.
  { file: "app/actions/bookings.ts", name: "requestBookingAction" },
  // Signed-in influencer accepts or declines a booking.
  { file: "app/actions/bookings.ts", name: "respondBookingAction" },
  // Signed-in influencer submits a deliverable.
  { file: "app/actions/bookings.ts", name: "deliverBookingAction" },
  // Signed-in brand approves a delivery.
  { file: "app/actions/bookings.ts", name: "approveBookingAction" },
  // Signed-in brand lists their bookings.
  { file: "app/actions/bookings.ts", name: "listBrandBookings" },
  // Signed-in influencer lists their bookings.
  { file: "app/actions/bookings.ts", name: "listInfluencerBookings" },
  // Signed-in brand or admin lists campaigns they can see.
  { file: "app/actions/campaigns.ts", name: "listBrandCampaigns" },
  // Signed-in brand creates a campaign.
  { file: "app/actions/campaigns.ts", name: "createCampaignAction" },
  // Signed-in brand edits their campaign.
  { file: "app/actions/campaigns.ts", name: "updateCampaignAction" },
  // Signed-in brand changes campaign status.
  { file: "app/actions/campaigns.ts", name: "setCampaignStatusAction" },
  // Signed-in brand copies a campaign.
  { file: "app/actions/campaigns.ts", name: "duplicateCampaignAction" },
  // Signed-in brand deletes a campaign.
  { file: "app/actions/campaigns.ts", name: "deleteCampaignAction" },
  // Signed-in brand saves a directory listing.
  { file: "app/actions/directory.ts", name: "saveListingAction" },
  // Signed-in user submits a directory review.
  { file: "app/actions/directory.ts", name: "submitReviewAction" },
  // Signed-in participant takes down a review.
  { file: "app/actions/directory.ts", name: "takedownReviewAction" },
  // Admin publishes or takes down a listing.
  { file: "app/actions/directory.ts", name: "moderateListingAction" },
  // Admin publishes, rejects, or takes down a review.
  { file: "app/actions/directory.ts", name: "moderateReviewAction" },
  // Signed preference link saves notification toggles. Token is checked before the write helper.
  { file: "app/actions/email-preferences.ts", name: "saveTokenPreferencesAction" },
  // Signed unsubscribe link turns one scope off. Token is checked before the write helper.
  { file: "app/actions/email-preferences.ts", name: "confirmUnsubscribeAction" },
  // One-click unsubscribe. Token is checked before the write helper.
  { file: "app/actions/email-preferences.ts", name: "unsubscribeByToken" },
  // Signed-in user saves or unsaves a campaign.
  { file: "app/actions/growth.ts", name: "toggleSavedCampaignAction" },
  // Signed-in user opens a support ticket.
  { file: "app/actions/growth.ts", name: "createSupportTicketAction" },
  // Signed-in participant replies on a ticket.
  { file: "app/actions/growth.ts", name: "replySupportTicketAction" },
  // Signed-in participant closes a ticket.
  { file: "app/actions/growth.ts", name: "closeSupportTicketAction" },
  // Admin sets the platform fee.
  { file: "app/actions/growth.ts", name: "setPlatformFeeAction" },
  // Admin reviews a KYC submission.
  { file: "app/actions/growth.ts", name: "reviewKycAction" },
  // Signed-in user uploads a KYC document.
  { file: "app/actions/growth.ts", name: "uploadKycDocumentAction" },
  // Admin awards weekly prizes.
  { file: "app/actions/growth.ts", name: "awardWeeklyPrizesAction" },
  // Signed-in user gets a referral code.
  { file: "app/actions/growth.ts", name: "ensureReferralCodeAction" },
  // Signed-in influencer saves their public profile.
  { file: "app/actions/influencer.ts", name: "upsertInfluencerProfileAction" },
  // Signed-in user reads their influencer profile.
  { file: "app/actions/influencer.ts", name: "getMyInfluencerProfile" },
  // Signed-in influencer adds a rate card.
  { file: "app/actions/influencer.ts", name: "addRateCardAction" },
  // Signed-in influencer activates or pauses a rate.
  { file: "app/actions/influencer.ts", name: "toggleRateCardAction" },
  // Signed-in user lists their rate cards.
  { file: "app/actions/influencer.ts", name: "listMyRateCards" },
  // Signed-in user dismisses a journey prompt.
  { file: "app/actions/journey.ts", name: "dismissJourneyAction" },
  // Signed-in brand creates a UGC brief.
  { file: "app/actions/licensing.ts", name: "createBriefAction" },
  // Signed-in brand opens a brief.
  { file: "app/actions/licensing.ts", name: "openBriefAction" },
  // Signed-in brand pauses or resumes a brief.
  { file: "app/actions/licensing.ts", name: "pauseBriefAction" },
  // Signed-in brand closes a brief.
  { file: "app/actions/licensing.ts", name: "closeBriefAction" },
  // Signed-in creator applies to a brief.
  { file: "app/actions/licensing.ts", name: "applyBriefAction" },
  // Signed-in brand invites a creator.
  { file: "app/actions/licensing.ts", name: "inviteCreatorAction" },
  // Signed-in brand accepts or declines an application.
  { file: "app/actions/licensing.ts", name: "decideApplicationAction" },
  // Signed-in creator submits a delivery.
  { file: "app/actions/licensing.ts", name: "submitDeliveryAction" },
  // Signed-in brand requests a revision.
  { file: "app/actions/licensing.ts", name: "requestRevisionAction" },
  // Signed-in brand declines a delivery.
  { file: "app/actions/licensing.ts", name: "declineDeliveryAction" },
  // Signed-in brand approves a delivery.
  { file: "app/actions/licensing.ts", name: "approveDeliveryAction" },
  // Signed-in participant opens a dispute.
  { file: "app/actions/licensing.ts", name: "openDisputeAction" },
  // Admin resolves a dispute.
  { file: "app/actions/licensing.ts", name: "resolveDisputeAction" },
  // Signed-in creator saves portfolio items.
  { file: "app/actions/licensing.ts", name: "savePortfolioAction" },
  // Signed-in user marks one notification read.
  { file: "app/actions/notifications.ts", name: "markNotificationReadAction" },
  // Signed-in user marks every notification read.
  { file: "app/actions/notifications.ts", name: "markAllNotificationsReadAction" },
  // Signed-in user reads their onboarding state.
  { file: "app/actions/onboarding.ts", name: "getOnboardingState" },
  // Signed-in user finishes onboarding.
  { file: "app/actions/onboarding.ts", name: "completeOnboardingAction" },
  // Signed-in user saves one onboarding step.
  { file: "app/actions/onboarding.ts", name: "saveOnboardingStepAction" },
  // Signed-in user leaves onboarding.
  { file: "app/actions/onboarding.ts", name: "exitOnboardingAction" },
  // Signed-in user sets a social handle.
  { file: "app/actions/onboarding.ts", name: "setSocialHandleAction" },
  // Signed-in user verifies a social account.
  { file: "app/actions/onboarding.ts", name: "verifySocialAction" },
  // Signed-in user saves payout details during onboarding.
  { file: "app/actions/onboarding.ts", name: "saveOnboardingPayoutAction" },
  // Signed-in brand saves the onboarding campaign step.
  { file: "app/actions/onboarding.ts", name: "saveOnboardingCampaignAction" },
  // Signed-in user marks the product tour seen.
  { file: "app/actions/onboarding.ts", name: "markProductTourSeenAction" },
  // Signed-in user dismisses the checklist.
  { file: "app/actions/onboarding.ts", name: "dismissChecklistAction" },
  // Signed-in user reads their onboarding draft.
  { file: "app/actions/onboarding.ts", name: "getOnboardingDraftForSession" },
  // Signed-in brand requests a manual pay-in.
  { file: "app/actions/payin.ts", name: "requestPayInAction" },
  // Admin confirms a pay-in.
  { file: "app/actions/payin.ts", name: "confirmPayInAction" },
  // Signed-in user updates their profile.
  { file: "app/actions/settings.ts", name: "updateProfileAction" },
  // Signed-in user updates their roles.
  { file: "app/actions/settings.ts", name: "updateRolesAction" },
  // Signed-in user updates notification settings.
  { file: "app/actions/settings.ts", name: "updateNotificationsAction" },
  // Signed-in user changes their password.
  { file: "app/actions/settings.ts", name: "changePasswordAction" },
  // Admin lists users.
  { file: "app/actions/settings.ts", name: "adminListUsers" },
  // Admin suspends or restores a user.
  { file: "app/actions/settings.ts", name: "adminSetUserSuspended" },
  // Admin grants or removes a role.
  { file: "app/actions/settings.ts", name: "adminAssignRole" },
  // Admin reads platform stats.
  { file: "app/actions/settings.ts", name: "getPlatformStats" },
  // Admin lists fraud flags.
  { file: "app/actions/settings.ts", name: "listFraudFlags" },
  // Admin resolves or dismisses a fraud flag.
  { file: "app/actions/settings.ts", name: "resolveFraudFlag" },
  // Signed-in clipper submits a clip.
  { file: "app/actions/submissions.ts", name: "submitClipAction" },
  // Signed-in brand reviews a submission.
  { file: "app/actions/submissions.ts", name: "reviewSubmissionAction" },
  // Signed-in brand records checked views.
  { file: "app/actions/submissions.ts", name: "recordCheckedViewsAction" },
  // Signed-in clipper lists their submissions.
  { file: "app/actions/submissions.ts", name: "listClipperSubmissions" },
  // Signed-in brand lists submissions on their campaign.
  { file: "app/actions/submissions.ts", name: "listCampaignSubmissions" },
  // Signed-in clipper appeals a decision.
  { file: "app/actions/submissions.ts", name: "appealClipAction" },
  // Signed-in user lists linked accounts.
  { file: "app/actions/submissions.ts", name: "listMyLinkedAccounts" },
  // Signed-in user starts linking an account.
  { file: "app/actions/submissions.ts", name: "startLinkAccountAction" },
  // Signed-in user verifies a linked account.
  { file: "app/actions/submissions.ts", name: "verifyLinkAccountAction" },
  // Signed-in user requests a verification code.
  { file: "app/actions/verification.ts", name: "requestVerificationCodeAction" },
  // Admin reviews a verification request.
  { file: "app/actions/verification.ts", name: "reviewVerificationAction" },
  // Admin saves one view count.
  { file: "app/actions/views.ts", name: "saveAdminViewAction" },
  // Admin saves view counts in bulk.
  { file: "app/actions/views.ts", name: "saveBulkViewsAction" },
  // Signed-in creator reports a view count.
  { file: "app/actions/views.ts", name: "reportCreatorViewsAction" },
  // Admin confirms a creator-reported view count.
  { file: "app/actions/views.ts", name: "confirmCreatorViewAction" },
  // Admin records views on a submission.
  { file: "app/actions/views.ts", name: "recordSubmissionViewsAction" },
  // Admin sets a manual view count.
  { file: "app/actions/views.ts", name: "setManualViewsAction" },
  // Signed-in user reads their wallet.
  { file: "app/actions/wallet.ts", name: "getMyWallet" },
  // Signed-in user reads their ledger.
  { file: "app/actions/wallet.ts", name: "getMyLedger" },
  // Admin credits a wallet.
  { file: "app/actions/wallet.ts", name: "adminCreditWalletAction" },
  // Signed-in user saves payout details.
  { file: "app/actions/wallet.ts", name: "savePayoutMethodAction" },
  // Signed-in user reads a masked payout method.
  { file: "app/actions/wallet.ts", name: "getMyPayoutMethodMasked" },
  // Admin reads a payout method for a user.
  { file: "app/actions/wallet.ts", name: "getPayoutMethodForAdmin" },
  // Signed-in user requests a withdrawal.
  { file: "app/actions/wallet.ts", name: "requestWithdrawalAction" },
  // Signed-in user lists their withdrawals.
  { file: "app/actions/wallet.ts", name: "listMyWithdrawals" },
  // Admin lists the payout queue.
  { file: "app/actions/wallet.ts", name: "listPendingWithdrawalsAdmin" },
  // Admin marks a withdrawal paid.
  { file: "app/actions/wallet.ts", name: "markWithdrawalPaidAction" },
  // Admin rejects a withdrawal.
  { file: "app/actions/wallet.ts", name: "rejectWithdrawalAction" },
  // Signed-in brand records a deposit.
  { file: "app/actions/wallet.ts", name: "brandDepositAction" },
  // Admin confirms a brand deposit.
  { file: "app/actions/wallet.ts", name: "confirmBrandDepositAction" },
  // Admin rejects a brand deposit.
  { file: "app/actions/wallet.ts", name: "rejectBrandDepositAction" },
  // Returns the signed-in user id, or null. Does not read the store.
  { file: "app/actions/wallet.ts", name: "currentUserId" },
  // Signed-in user saves KYC details.
  { file: "app/actions/wallet.ts", name: "saveKycAction" },
  // Signed-in user reads their KYC record.
  { file: "app/actions/wallet.ts", name: "getMyKyc" },
  // Signed-in brand ensures a workspace exists.
  { file: "app/actions/workspaces.ts", name: "ensureBrandWorkspaceAction" },
  // Signed-in brand creates a workspace.
  { file: "app/actions/workspaces.ts", name: "createWorkspaceAction" },
  // Signed-in member switches workspace.
  { file: "app/actions/workspaces.ts", name: "switchWorkspaceAction" },
  // Signed-in owner or admin invites a member.
  { file: "app/actions/workspaces.ts", name: "inviteMemberAction" },
  // Signed-in user accepts an invite.
  { file: "app/actions/workspaces.ts", name: "acceptInviteAction" },
  // Signed-in owner or admin revokes a member.
  { file: "app/actions/workspaces.ts", name: "revokeMemberAction" },
  // Admin sets a workspace member role.
  { file: "app/actions/workspaces.ts", name: "adminSetMemberRoleAction" },
];

const BLOCKED_ACTION_NAMES = new Set([
  "refreshSessionFromProfile",
  "getProfileById",
  "ensureDiscoverableCreators",
  "signup",
  "login",
  "clearSession",
  "ensureAdminAccount",
]);

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function isUseServer(source: string): boolean {
  return /^\s*["']use server["'];?/m.test(source);
}

function exportedFunctions(source: string): { name: string; body: string }[] {
  const parts = source.split(/\n(?=export )/);
  const found: { name: string; body: string }[] = [];
  for (const part of parts) {
    const match = part.match(/^export (?:async )?function (\w+)/);
    if (match) found.push({ name: match[1], body: part });
  }
  return found;
}

const SESSION_OR_ROLE = /requireSession\(|getSession\(|\.roles\.includes|session\.roles|assertBrand\(/;
const STORE_TOUCH = /\b(readStore|updateStore|commitStoreToSupabase)\b/;

test("use server files only export allowlisted actions that check the session first", () => {
  const sessionSource = readFileSync(path.join(root, "lib/auth/session.ts"), "utf8");
  assert.equal(isUseServer(sessionSource), false);
  assert.match(sessionSource, /import "server-only"/);

  const files = walk(root).filter((file) => isUseServer(readFileSync(file, "utf8")));
  const libHits = files.filter((file) => file.includes(`${path.sep}lib${path.sep}`));
  assert.deepEqual(libHits, []);

  const seen = new Set<string>();
  for (const file of files) {
    const rel = path.relative(root, file);
    const source = readFileSync(file, "utf8");
    for (const fn of exportedFunctions(source)) {
      const key = `${rel} ${fn.name}`;
      seen.add(key);
      assert.equal(BLOCKED_ACTION_NAMES.has(fn.name), false, key);
      const allowed = ALLOWED_ACTIONS.some((entry) => entry.file === rel && entry.name === fn.name);
      assert.equal(allowed, true, `${key} is not an allowlisted action`);
      const storeAt = fn.body.search(STORE_TOUCH);
      if (storeAt === -1) continue;
      const checkAt = fn.body.search(SESSION_OR_ROLE);
      assert.ok(checkAt !== -1 && checkAt < storeAt, `${key} touches the store before a session or role check`);
    }
  }

  for (const entry of ALLOWED_ACTIONS) {
    assert.equal(seen.has(`${entry.file} ${entry.name}`), true, `allowlist entry missing: ${entry.file} ${entry.name}`);
  }
});
