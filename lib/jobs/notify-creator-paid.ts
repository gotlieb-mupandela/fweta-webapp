/**
 * Event-driven alert when an admin marks a withdrawal paid.
 */
import { notifyWithdrawalPaid } from "@/lib/notifications/events";

export async function notifyCreatorPaid(withdrawalRequestId: string) {
  await notifyWithdrawalPaid(withdrawalRequestId);
  return { ok: true as const };
}
