"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCampaignAction, setCampaignStatusAction } from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { campaignClipperVisibility } from "@/lib/campaigns/visibility";
import type { CampaignStatus } from "@/types/enums";

export function CampaignStatusButtons({
  campaignId,
  status,
}: {
  campaignId: string;
  status: CampaignStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setStatus(next: CampaignStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setCampaignStatusAction(campaignId, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const visibility = campaignClipperVisibility(status);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        <span className="font-medium text-foreground">{visibility.label}.</span> {visibility.detail}
      </p>
      <div className="flex flex-wrap gap-2">
        {status === "draft" || status === "paused" || status === "pending" ? (
          <Button size="sm" variant="gold" disabled={pending} onClick={() => setStatus("active")}>
            Publish to clippers
          </Button>
        ) : null}
        {status === "active" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus("paused")}>
            Pause
          </Button>
        ) : null}
        {status !== "completed" ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus("completed")}>
            Mark completed
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                "Delete this campaign? Unused budget is returned to your wallet. Pending submissions will be removed.",
              )
            ) {
              return;
            }
            setError(null);
            startTransition(async () => {
              const res = await deleteCampaignAction(campaignId);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push("/dashboard/brand/campaigns");
              router.refresh();
            });
          }}
        >
          Delete
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
