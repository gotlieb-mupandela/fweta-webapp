import { NextResponse } from "next/server";

/**
 * Webhook endpoint placeholder for Stripe, PayFast, etc.
 * POST /api/webhooks
 *
 * Phase 13 — implement signature verification and event routing.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  // Stub: acknowledge receipt without processing
  if (contentType.includes("application/json")) {
    try {
      await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  return NextResponse.json(
    {
      received: true,
      status: "not_implemented",
      message: "Webhook handler stub — Phase 13",
    },
    { status: 202 },
  );
}
