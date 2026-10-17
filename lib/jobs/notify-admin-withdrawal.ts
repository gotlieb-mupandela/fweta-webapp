/**
 * Event-driven alert when a creator requests a withdrawal.
 * In-app notification plus email (Resend) for admins and the creator.
 */
import { notifyWithdrawalRequested } from "@/lib/notifications/events";

export async function notifyAdminWithdrawal(withdrawalRequestId: string) {
  await notifyWithdrawalRequested(withdrawalRequestId);
  return { ok: true as const };
}
