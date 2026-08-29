"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { resolveFraudFlag } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";

export function FraudFlagActions({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="gold"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await resolveFraudFlag(flagId, "resolved");
            router.refresh();
          })
        }
      >
        Resolve
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await resolveFraudFlag(flagId, "dismissed");
            router.refresh();
          })
        }
      >
        Dismiss
      </Button>
    </div>
  );
}
