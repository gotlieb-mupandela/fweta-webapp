import { NextResponse } from "next/server";

/**
 * fweta does not accept payment-gateway webhooks.
 * Brand deposits are recorded manually. Creator payouts are manual EFT.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: true,
      message: "No payment webhook is configured. Deposits and payouts are manual.",
    },
    { status: 202 },
  );
}
