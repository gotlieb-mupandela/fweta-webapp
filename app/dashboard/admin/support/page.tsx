import { redirect } from "next/navigation";

import { TicketReplyForm } from "@/components/forms/support-forms";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function AdminSupportPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const tickets = [...store.supportTickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="dash-stack">
      <PageHeader title="Support queue" description="Reply in the app. Closing a ticket keeps the thread." />
      {tickets.length === 0 ? (
        <EmptyState title="No tickets" description="Creator and brand messages will land here." />
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => {
            const person = store.profiles.find((item) => item.id === ticket.userId);
            const messages = store.supportMessages.filter((item) => item.ticketId === ticket.id);
            return (
              <li key={ticket.id} className="panel space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted">{person?.displayName} · {person?.email}</p>
                  </div>
                  <Badge tone={ticket.status === "open" ? "gold" : "muted"}>{ticket.status}</Badge>
                </div>
                <ul className="space-y-2">
                  {messages.map((message) => (
                    <li key={message.id} className="text-sm">
                      <p className="whitespace-pre-wrap">{message.body}</p>
                    </li>
                  ))}
                </ul>
                {ticket.status !== "closed" ? <TicketReplyForm ticketId={ticket.id} admin /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
