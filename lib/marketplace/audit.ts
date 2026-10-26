import { newId, nowIso } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";

export function pushAudit(
  store: DatabaseStore,
  input: {
    actorId: string;
    action: string;
    summary: string;
    targetType: string;
    targetId?: string | null;
    actorEmail?: string;
    amountCents?: number;
    note?: string;
  },
) {
  if (!Array.isArray(store.auditLog)) store.auditLog = [];
  const entry: DatabaseStore["auditLog"][number] = {
    id: newId(),
    actorId: input.actorId,
    action: input.action,
    summary: input.summary.replace(/\s+/g, " ").trim().slice(0, 240),
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    createdAt: nowIso(),
  };
  const email = input.actorEmail?.trim();
  if (email) entry.actorEmail = email.slice(0, 160);
  if (input.amountCents != null) entry.amountCents = input.amountCents;
  const note = input.note?.replace(/\s+/g, " ").trim();
  if (note) entry.note = note.slice(0, 240);
  store.auditLog.push(entry);
}
