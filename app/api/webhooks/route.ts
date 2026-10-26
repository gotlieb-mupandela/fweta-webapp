import { NextResponse } from "next/server";

/**
 * fweta does not accept payment-gateway webhooks.
 * Brand deposits are recorded manually. Creator payouts are manual EFT.
 * Gateway posts are rejected. Nothing is applied.
 */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}
