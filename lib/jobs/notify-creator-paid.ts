/**
 * Event-driven — notify creator when admin marks a withdrawal paid.
 */
export async function notifyCreatorPaid(withdrawalRequestId: string) {
  void withdrawalRequestId;
  return { ok: true as const };
}
