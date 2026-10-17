import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "fweta_session";

/** Clears a session the server no longer accepts (suspended account or rotated password). */
export async function GET(request: Request) {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  const reason = new URL(request.url).searchParams.get("reason");
  const safe = reason === "suspended" || reason === "expired" ? reason : "ended";
  return NextResponse.redirect(new URL(`/login?reason=${safe}`, request.url));
}
