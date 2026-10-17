"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { adminRemoveSocialAccountAction, adminVerifySocialAccountAction } from "@/app/actions/accounts";
import { adminSetMemberRoleAction, revokeMemberAction } from "@/app/actions/workspaces";
import { Button } from "@/components/ui/button";
import type { WorkspaceRole } from "@/lib/db/types";

export function AdminAccountActions({
  accountId,
  verified,
}: {
  accountId: string;
  verified: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {verified ? null : (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await adminVerifySocialAccountAction(accountId);
              router.refresh();
            });
          }}
        >
          Mark verified
        </Button>
      )}
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
