"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setCampaignStatusAction } from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import type { CampaignStatus } from "@/types/enums";

export function CampaignStatusButtons({
  campaignId,
  status,
}: {
  campaignId: string;
  status: CampaignStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(next: CampaignStatus) {
    startTransition(async () => {
      await setCampaignStatusAction(campaignId, next);
      router.refresh();
    });
  }

  return (
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
  );
}
