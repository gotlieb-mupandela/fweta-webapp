"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { acceptInviteAction } from "@/app/actions/workspaces";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

export function PendingInvites({
  invites,
}: {
  invites: { id: string; role: string; workspaceName: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (invites.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-border bg-white px-4 py-3.5">
      <p className="text-sm font-medium">Brand invites</p>
      <ul className="mt-3 space-y-2">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {invite.workspaceName} · {invite.role}
            </span>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await acceptInviteAction(invite.id);
                  if (!res.ok) setError(res.error);
                  else {
                    router.refresh();
                  }
                });
              }}
            >
              Accept
            </Button>
          </li>
        ))}
      </ul>
      <FieldError>{error}</FieldError>
    </div>
  );
}
