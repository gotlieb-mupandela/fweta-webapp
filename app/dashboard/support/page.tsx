import { redirect } from "next/navigation";

import { NewTicketForm, TicketReplyForm } from "@/components/forms/support-forms";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const store = await readStore();
  const tickets = store.supportTickets
    .filter((item) => item.userId === session.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="dash-stack">
      <PageHeader title="Support" description="Write to the Fweta team from inside the app. No email account is required." />
      <Card>
        <NewTicketForm />
      </Card>
      <section>
        <SectionHeader title="Your tickets" />
        {tickets.length === 0 ? (
          <EmptyState title="No tickets" description="Open one if a payout, campaign, or booking is stuck." />
        ) : (
          <ul className="space-y-3">
            {tickets.map((ticket) => {
              const messages = store.supportMessages.filter((item) => item.ticketId === ticket.id);
              return (
                <li key={ticket.id} className="panel space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{ticket.subject}</p>
                    <Badge tone={ticket.status === "closed" ? "muted" : "gold"}>{ticket.status}</Badge>
                  </div>
                  <ul className="space-y-2">
                    {messages.map((message) => {
                      const author = store.profiles.find((item) => item.id === message.authorId);
                      return (
                        <li key={message.id} className="text-sm">
                          <p className="text-xs text-muted">
                            {author?.id === session.id ? "You" : author?.displayName || "Fweta"} ·{" "}
                            {new Date(message.createdAt).toLocaleString()}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                        </li>
                      );
                    })}
                  </ul>
                  {ticket.status !== "closed" ? <TicketReplyForm ticketId={ticket.id} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
