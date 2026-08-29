import { NextResponse } from "next/server";

/**
 * Webhook endpoint placeholder for Stripe, PayFast, etc.
 * POST /api/webhooks
 */
export async function POST() {
  return NextResponse.json(
    { error: "Webhook handler not implemented" },
    { status: 501 },
  );
}
