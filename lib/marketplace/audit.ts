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
  },
) {
  if (!Array.isArray(store.auditLog)) store.auditLog = [];
  store.auditLog.push({
    id: newId(),
    actorId: input.actorId,
    action: input.action,
    summary: input.summary.replace(/\s+/g, " ").trim().slice(0, 240),
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    createdAt: nowIso(),
  });
}
