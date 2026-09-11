"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setCampaignStatusAction } from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import type { CampaignStatus } from "@/types/enums";

export function CampaignStatusButtons({
  campaignId,
  status,
  leftoverCents = 0,
}: {
  campaignId: string;
  status: CampaignStatus;
  leftoverCents?: number;
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

  if (status === "completed" || status === "cancelled") {
    return null;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "draft" || status === "paused" || status === "pending" ? (
          <Button size="sm" variant="gold" disabled={pending} onClick={() => setStatus("active")}>
            Activate
          </Button>
        ) : null}
        {status === "active" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus("paused")}>
            Pause
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus("completed")}>
          {leftoverCents > 0 ? "Mark completed (refund unused)" : "Mark completed"}
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
