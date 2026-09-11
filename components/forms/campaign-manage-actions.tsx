"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelCampaignAction,
  deleteCampaignAction,
  duplicateCampaignAction,
} from "@/app/actions/campaigns";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";
import type { CampaignStatus } from "@/types/enums";

export function CampaignManageActions({
  campaignId,
  status,
  leftoverCents,
  hasSubmissions,
}: {
  campaignId: string;
  status: CampaignStatus;
  leftoverCents: number;
  hasSubmissions: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ended = status === "completed" || status === "cancelled";
  const canDelete = !hasSubmissions;
  const canCancel = !ended && (status === "active" || status === "paused" || leftoverCents > 0);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await duplicateCampaignAction(campaignId);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push(`/dashboard/brand/campaigns/${res.id}`);
              router.refresh();
            });
          }}
        >
          Duplicate
        </Button>
        {canCancel ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const leftoverNote =
                leftoverCents > 0
                  ? ` Unused budget of ${formatMoney(leftoverCents)} will return to your wallet.`
                  : "";
              if (!window.confirm(`Cancel this campaign?${leftoverNote}`)) return;
              setError(null);
              startTransition(async () => {
                const res = await cancelCampaignAction(campaignId);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            {leftoverCents > 0
              ? `Cancel & refund ${formatMoney(leftoverCents)}`
              : "Cancel campaign"}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => {
              const leftoverNote =
                leftoverCents > 0
                  ? ` Unused budget of ${formatMoney(leftoverCents)} will return to your wallet.`
                  : "";
              if (!window.confirm(`Delete this campaign permanently?${leftoverNote}`)) return;
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
        ) : null}
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
