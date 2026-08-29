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

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "draft" || status === "paused" ? (
          <Button size="sm" variant="gold" disabled={pending} onClick={() => setStatus("active")}>
            Activate
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
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
