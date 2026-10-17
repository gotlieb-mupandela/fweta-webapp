import { youtubeViewsEnabled } from "./flags";
import type { ViewObservation } from "./observation";

type YouTubeList<T> = { items?: T[] };

type VideoItem = {
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  snippet?: { publishedAt?: string; channelId?: string; channelTitle?: string };
  status?: { privacyStatus?: string };
};

type ChannelItem = { snippet?: { description?: string; customUrl?: string; title?: string } };

function apiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  return key || null;
}

export function youtubeConfigured(): boolean {
  return Boolean(apiKey());
}

export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery) return fromQuery;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex((part) => ["shorts", "embed", "live", "v"].includes(part));
      if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function asCount(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

export async function fetchYouTubeObservation(postUrl: string): Promise<ViewObservation | null> {
  if (!youtubeViewsEnabled()) return null;
  const key = apiKey();
  const id = youtubeVideoId(postUrl);
  if (!key || !id) return null;
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "statistics,snippet,status");
  endpoint.searchParams.set("id", id);
  endpoint.searchParams.set("key", key);
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const data = (await response.json()) as YouTubeList<VideoItem>;
  const item = data.items?.[0];
  if (!item) {
    return {
      views: 0,
      live: false,
      likes: null,
      comments: null,
      authorHandle: null,
      authorBio: null,
      publishedAt: null,
      providerId: "youtube-data",
    };
  }
  let authorHandle = item.snippet?.channelTitle ?? null;
  let authorBio: string | null = null;
  const channelId = item.snippet?.channelId;
  if (channelId) {
    const channel = await fetchYouTubeChannelById(channelId, key);
    if (channel) {
      authorBio = channel.bio;
      if (channel.handle) authorHandle = channel.handle;
    }
  }
  return {
    views: asCount(item.statistics?.viewCount) ?? 0,
    live: item.status?.privacyStatus === "public",
    likes: asCount(item.statistics?.likeCount),
    comments: asCount(item.statistics?.commentCount),
    authorHandle,
    authorBio,
    publishedAt: item.snippet?.publishedAt ?? null,
    providerId: "youtube-data",
  };
}

async function fetchYouTubeChannelById(
  channelId: string,
  key: string,
): Promise<{ bio: string | null; handle: string | null } | null> {
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/channels");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("id", channelId);
  endpoint.searchParams.set("key", key);
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const data = (await response.json()) as YouTubeList<ChannelItem>;
    const snippet = data.items?.[0]?.snippet;
    if (!snippet) return null;
    return {
      bio: typeof snippet.description === "string" ? snippet.description : null,
      handle: snippet.customUrl?.replace(/^@/, "") ?? snippet.title ?? null,
    };
  } catch {
    return null;
  }
}

/** Public channel description. Empty string means the bio was read and is blank. */
export async function fetchYouTubeChannelBio(handle: string): Promise<string | null> {
  if (!youtubeViewsEnabled()) return null;
  const key = apiKey();
  const forHandle = handle.trim().replace(/^@/, "");
  if (!key || !forHandle) return null;
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/channels");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("forHandle", forHandle);
  endpoint.searchParams.set("key", key);
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const data = (await response.json()) as YouTubeList<ChannelItem>;
    const snippet = data.items?.[0]?.snippet;
    if (!snippet) return null;
    return typeof snippet.description === "string" ? snippet.description : "";
  } catch {
    return null;
  }
}
