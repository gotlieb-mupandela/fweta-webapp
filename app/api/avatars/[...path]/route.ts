import { NextResponse } from "next/server";

import { readStore } from "@/lib/db/store";
import { publishedAvatarPath } from "@/lib/storage/access";
import { openDownload } from "@/lib/storage/download";
import { isSafeStoragePath } from "@/lib/storage/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const name = path.join("/");
  if (!isSafeStoragePath(name) || !name.includes("/avatar/")) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const store = await readStore();
  const published = store.profiles.some((profile) => publishedAvatarPath(profile.avatarUrl) === name);
  const influencer = store.influencerProfiles.some((profile) => publishedAvatarPath(profile.avatarUrl) === name);
  if (!published && !influencer) return NextResponse.json({ ok: false }, { status: 404 });

  const loaded = await openDownload({
    purpose: "avatar",
    name,
    requesterId: "",
    ownerIds: [],
    isAdmin: false,
    filenameBase: "avatar",
    attachment: false,
    publicAvatar: true,
  });
  if (!loaded) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(new Uint8Array(loaded.bytes), { status: 200, headers: loaded.headers });
}
