import type { ViewObservation } from "./observation";

const DEFAULT_ACTOR = "agentx~all-video-scraper";

type ApifyVideoRecord = {
  view_count?: number | null;
  play_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  platform?: string | null;
  source_url?: string | null;
  author?: string | null;
  channel?: string | null;
  uploader?: string | null;
  description?: string | null;
  bio?: string | null;
  published_at?: string | null;
  available?: boolean | null;
};

/**
 * Fetch public view count for a video URL via Apify All Video Scraper.
 * Requires APIFY_API_TOKEN. ~$0.10 per URL on Apify free tier credits.
 * @see https://apify.com/agentx/all-video-scraper
 */
async function runApifyActor(actorId: string, body: unknown): Promise<unknown> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  const endpoint = new URL(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", "120");
  const controller = new AbortController();
  const timeoutMs = Number(process.env.APIFY_TIMEOUT_MS ?? 30000);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 30000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Apify request failed (${response.status}): ${detail.slice(0, 200)}`);
    }
    return response.json();
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === "AbortError" ? "Apify request timed out" : e instanceof Error ? e.message : "Apify request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

function assertHttpUrl(postUrl: string) {
  try {
    const parsed = new URL(postUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
  } catch {
    throw new Error("Invalid post URL");
  }
}

function countOf(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.max(0, Math.floor(Number(value)));
}

export async function fetchVideoViewsFromApify(postUrl: string): Promise<number | null> {
  if (process.env.APIFY_VIEWS_ENABLED !== "true") return null;
  const observation = await fetchApifyObservation(postUrl);
  return observation?.views ?? null;
}

/** Empty dataset is unknown, not a deleted post. */
export async function fetchApifyObservation(postUrl: string): Promise<ViewObservation | null> {
  if (process.env.APIFY_VIEWS_ENABLED !== "true") return null;
  if (!isApifyConfigured()) return null;
  assertHttpUrl(postUrl);
  const actorId = process.env.APIFY_ACTOR_ID ?? DEFAULT_ACTOR;
  const items = (await runApifyActor(actorId, {
    video_url: postUrl,
    video_quality: "metadata",
    max_comments: 0,
  })) as ApifyVideoRecord[];
  const record = items[0];
  if (!record) return null;
  const views = countOf(record.view_count ?? record.play_count);
  if (views == null) return null;
  return {
    views,
    live: record.available === false ? false : true,
    likes: countOf(record.like_count),
    comments: countOf(record.comment_count),
    authorHandle: record.author ?? record.channel ?? record.uploader ?? null,
    authorBio: null,
    publishedAt: record.published_at ?? null,
    providerId: "apify",
  };
}

/** Bio only when APIFY_PROFILE_ACTOR_ID is set. Otherwise null. */
export async function fetchApifyProfileBio(platform: string, handle: string): Promise<string | null> {
  if (process.env.APIFY_VIEWS_ENABLED !== "true") return null;
  const actorId = process.env.APIFY_PROFILE_ACTOR_ID?.trim();
  if (!actorId || !isApifyConfigured()) return null;
  const items = (await runApifyActor(actorId, {
    platform,
    handle: handle.replace(/^@/, ""),
    username: handle.replace(/^@/, ""),
  })) as ApifyVideoRecord[];
  const record = items[0];
  if (!record) return null;
  if (typeof record.bio === "string") return record.bio;
  if (typeof record.description === "string") return record.description;
  return null;
}

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}
