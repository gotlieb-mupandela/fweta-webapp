const ALLOWED_HOSTS = new Set([
  "www.tiktok.com",
  "tiktok.com",
  "www.instagram.com",
  "instagram.com",
  "www.youtube.com",
  "youtube.com",
  "x.com",
  "www.x.com",
]);

/** Reads a public profile page. Only https hosts on the allowlist are fetched. */
export async function readPublicProfileHtml(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html",
        "user-agent": "FwetaBioCheck/1.0",
      },
    });
    if (!response.ok) return null;
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(finalUrl.hostname)) return null;
    const text = await response.text();
    return text.slice(0, 400_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
