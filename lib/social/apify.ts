const DEFAULT_ACTOR = "agentx~all-video-scraper";

type ApifyVideoRecord = {
  view_count?: number | null;
  platform?: string | null;
  source_url?: string | null;
};

/**
 * Fetch public view count for a video URL via Apify All Video Scraper.
 * Requires APIFY_API_TOKEN. ~$0.10 per URL on Apify free tier credits.
 * @see https://apify.com/agentx/all-video-scraper
 */
export async function fetchVideoViewsFromApify(postUrl: string): Promise<number | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }
  try {
    const parsed = new URL(postUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
  } catch {
    throw new Error("Invalid post URL");
  }

  const actorId = process.env.APIFY_ACTOR_ID ?? DEFAULT_ACTOR;
  const endpoint = new URL(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`,
  );
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", "120");

  // Bound the upstream call: without this a hung Apify run can hold the
  // cron/job slot until Vercel kills it at maxDuration.
  const controller = new AbortController();
  const timeoutMs = Number(process.env.APIFY_TIMEOUT_MS ?? 30000);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 30000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_url: postUrl,
        video_quality: "metadata",
        max_comments: 0,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === "AbortError" ? "Apify request timed out" : "Apify request failed",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Apify request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const items = (await response.json()) as ApifyVideoRecord[];
  const record = items[0];
  if (!record || record.view_count == null || Number.isNaN(Number(record.view_count))) {
    return null;
  }

  return Math.max(0, Math.floor(Number(record.view_count)));
}

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN?.trim());
}
