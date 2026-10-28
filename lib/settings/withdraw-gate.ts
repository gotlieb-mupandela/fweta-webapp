export type WithdrawKyc = {
  status?: string | null;
  documentOnFile: boolean;
};

export type WithdrawGate =
  | { kind: "missing_payout" }
  | { kind: "need_identity"; reason: "missing" | "rejected" | "needs_document" }
  | { kind: "awaiting_review" }
  | { kind: "ready" };

/**
 * The amount field opens only when a payout method is stored for this user
 * and identity is verified with a photo on file. KYC is not a payout-method flag.
 * The withdrawal action still enforces the payout method and the N$100 minimum.
 */
export function withdrawGate(input: {
  hasPayoutMethod: boolean;
  /** True only from payoutIdentityReady: legal name, ID, photo, and verified status. */
  identityReady: boolean;
  kyc: WithdrawKyc | null;
}): WithdrawGate {
  if (!input.hasPayoutMethod) return { kind: "missing_payout" };
  if (input.identityReady) return { kind: "ready" };
  if (!input.kyc) return { kind: "need_identity", reason: "missing" };
  if (input.kyc.status === "rejected") return { kind: "need_identity", reason: "rejected" };
  if (!input.kyc.documentOnFile) return { kind: "need_identity", reason: "needs_document" };
  return { kind: "awaiting_review" };
}

export function withdrawGateMessage(gate: Exclude<WithdrawGate, { kind: "ready" }>): {
  title: string;
  body: string;
  href: string;
  action: string;
} {
  if (gate.kind === "missing_payout") {
    return {
      title: "No payout method saved",
      body: "This account has no bank details on file, so there is no amount field yet. Add a payout method. The minimum withdrawal is N$100.",
      href: "/dashboard/settings/payout",
      action: "Add payout method",
    };
  }
  if (gate.kind === "need_identity" && gate.reason === "rejected") {
    return {
      title: "Identity photo needs another try",
      body: "Your payout method is saved. The last ID photo was rejected, so the amount field stays closed until you submit a new one and an admin verifies it. The minimum is N$100 after that.",
      href: "#identity",
      action: "Update identity",
    };
  }
  if (gate.kind === "need_identity" && gate.reason === "needs_document") {
    return {
      title: "ID photo missing",
      body: "Your payout method is saved. An ID photo is still required before you can enter an amount. An admin verifies it, and the minimum withdrawal is N$100.",
      href: "#identity",
      action: "Add ID photo",
    };
  }
  if (gate.kind === "need_identity") {
    return {
      title: "Identity required",
      body: "Your payout method is saved. Add an ID photo before you can enter an amount. An admin verifies it, and the minimum withdrawal is N$100.",
      href: "#identity",
      action: "Add identity",
    };
  }
  return {
    title: "Waiting for identity review",
    body: "Your payout method is saved. An admin still has to verify the ID photo before the amount field opens. The minimum withdrawal is N$100 after verification.",
    href: "#identity",
    action: "View identity",
  };
}
