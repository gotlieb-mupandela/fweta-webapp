import { redirect } from "next/navigation";

import { VerificationRequestButton } from "@/components/forms/verification-request-button";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { getProfileById, getSession } from "@/lib/auth/session";

export default async function VerificationSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");

  const isCreator = profile.roles.includes("clipper") || profile.roles.includes("influencer");
  const verification = profile.verification;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Verification"
        description="Put the code in a public social bio. An admin checks it and marks the account verified."
      />
      {!isCreator ? (
        <Card>
          <p className="text-sm text-muted">
            Bio codes are for clippers and influencers. Brand accounts are confirmed when an admin credits an EFT.
          </p>
        </Card>
      ) : (
        <Card className="max-w-xl space-y-4">
          {verification ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">Your code</p>
              <p className="font-display text-3xl tracking-tight">{verification.code}</p>
              <Badge
                tone={
                  verification.status === "verified"
                    ? "success"
                    : verification.status === "rejected"
                      ? "danger"
                      : "gold"
                }
              >
                {verification.status}
              </Badge>
              <p className="text-sm text-muted">
                Add this code to your TikTok, Instagram, Facebook, YouTube, or X bio, then wait for the admin queue.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Request a code, paste it into a social bio, and an admin will confirm it.
            </p>
          )}
          {verification?.status === "verified" ? null : (
            <VerificationRequestButton pendingAlready={verification?.status === "pending"} />
          )}
        </Card>
      )}
    </div>
  );
}
