/**
 * Event-driven — notify admin when a creator requests a withdrawal.
 */
export async function notifyAdminWithdrawal(withdrawalRequestId: string) {
  // Local MVP: dashboard is source of truth. Wire email provider later.
  void withdrawalRequestId;
  return { ok: true as const };
}
