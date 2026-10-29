"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  closeSupportTicketAction,
  createSupportTicketAction,
  replySupportTicketAction,
} from "@/app/actions/growth";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";

export function NewTicketForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setError(null);
        startTransition(async () => {
          const res = await createSupportTicketAction({
            subject: String(data.get("subject") || ""),
            body: String(data.get("body") || ""),
          });
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required placeholder="Payout timing" />
      </div>
      <div>
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" name="body" required placeholder="What do you need help with?" />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Open ticket"}
      </Button>
    </form>
  );
}

export function TicketReplyForm({ ticketId, admin = false }: { ticketId: string; admin?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setError(null);
        startTransition(async () => {
          const res = await replySupportTicketAction(ticketId, { body: String(data.get("reply") || "") });
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <Label htmlFor={`reply-${ticketId}`}>Reply</Label>
      <Textarea id={`reply-${ticketId}`} name="reply" required />
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Send reply
        </Button>
        {admin ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await closeSupportTicketAction(ticketId);
                router.refresh();
              })
            }
          >
            Close
          </Button>
        ) : null}
      </div>
    </form>
  );
}
