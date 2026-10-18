"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminRemoveSocialAccountAction, adminReviewSocialAccountAction } from "@/app/actions/accounts";
import { adminSetMemberRoleAction, revokeMemberAction } from "@/app/actions/workspaces";
import { Button } from "@/components/ui/button";
import type { WorkspaceRole } from "@/lib/db/types";

export function AdminAccountActions({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await adminRemoveSocialAccountAction(accountId);
            router.refresh();
          });
        }}
      >
        Remove
      </Button>
    </div>
  );
}

export function AccountReviewActions({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function review(decision: "verified" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res = await adminReviewSocialAccountAction({ accountId, decision, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-stretch gap-2 sm:items-end">
      <Button size="sm" disabled={pending} onClick={() => review("verified")}>
        {pending ? "Saving..." : "Approve"}
      </Button>
      <label className="sr-only" htmlFor={`reject-${accountId}`}>
        Rejection reason
      </label>
      <input
        id={`reject-${accountId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason if you reject"
        className="input-capsule h-9 w-full text-sm"
      />
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => review("rejected")}>
        Reject
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function AdminMemberActions({
  memberId,
  role,
}: {
  memberId: string;
  role: WorkspaceRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (role === "owner") return null;

  function setRole(next: WorkspaceRole) {
    startTransition(async () => {
      await adminSetMemberRoleAction(memberId, next);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {role !== "manager" ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setRole("manager")}>
          Make manager
        </Button>
      ) : (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setRole("viewer")}>
          Make viewer
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await revokeMemberAction(memberId);
            router.refresh();
          });
        }}
      >
        Remove
      </Button>
    </div>
  );
}
