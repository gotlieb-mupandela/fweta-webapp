"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acceptInviteAction,
  createWorkspaceAction,
  inviteMemberAction,
  revokeMemberAction,
} from "@/app/actions/workspaces";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select } from "@/components/ui/input";
import type { WorkspaceMember } from "@/lib/db/types";

export function TeamPanel({
  canInvite,
  invites,
}: {
  canInvite: boolean;
  invites: WorkspaceMember[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {invites.length > 0 ? (
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-sm font-medium">Invites for you</p>
          <ul className="mt-3 space-y-2">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {invite.role} invite
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
                        setSuccess("Invite accepted. This brand is now open.");
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
        </div>
      ) : null}

      {canInvite ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const fd = new FormData(form);
            setError(null);
            setSuccess(null);
            startTransition(async () => {
              const res = await inviteMemberAction({
                email: String(fd.get("email") || ""),
                role: String(fd.get("role") || "viewer"),
              });
              if (!res.ok) setError(res.error);
              else {
                setSuccess("Invite saved. They accept it after signing in with that email.");
                form.reset();
                router.refresh();
              }
            });
          }}
        >
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" required placeholder="teammate@brand.com" />
          </div>
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <Select id="invite-role" name="role" defaultValue="manager">
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </Select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Invite teammate"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">Viewers can see this brand. Owners and managers send invites.</p>
      )}

      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
    </div>
  );
}

export function NewWorkspaceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        setError(null);
        startTransition(async () => {
          const res = await createWorkspaceAction({ name: String(fd.get("name") || "") });
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="workspace-name">Brand name</Label>
        <Input id="workspace-name" name="name" required minLength={2} placeholder="Second brand" />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Creating..." : "Add brand"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function RemoveMemberButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
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
  );
}
