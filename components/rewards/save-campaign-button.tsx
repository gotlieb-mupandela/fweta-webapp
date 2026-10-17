"use client";

import { useState, useTransition } from "react";

import { toggleSavedCampaignAction } from "@/app/actions/growth";
import { Button } from "@/components/ui/button";

export function SaveCampaignButton({ campaignId, saved }: { campaignId: string; saved: boolean }) {
  const [on, setOn] = useState(saved);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "gold" : "secondary"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await toggleSavedCampaignAction(campaignId);
          if (res.ok) setOn(res.saved);
        })
      }
    >
      {on ? "Saved" : "Save campaign"}
    </Button>
  );
}
