const ALLOWED_HOSTS = new Set([
  "www.tiktok.com",
  "tiktok.com",
  "www.instagram.com",
  "instagram.com",
  "www.facebook.com",
  "facebook.com",
  "m.facebook.com",
  "www.youtube.com",
  "youtube.com",
  "x.com",
  "www.x.com",
]);

const ERROR_PAGE =
  /requested url|not found on this server|all we know|could not be satisfied|access denied|error 404|404 not found|page isn.t available|log in to (instagram|facebook|tiktok)|please log in|something went wrong|rate limit|temporarily blocked/i;

/** True when the body is a block page, a 404, or a login wall rather than a profile. */
export function htmlLooksLikeErrorPage(html: string): boolean {
  return ERROR_PAGE.test(html.slice(0, 20_000));
}

/** Reads a public profile page. Only https hosts on the allowlist are fetched. */
export async function readPublicProfileHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    const body = text.slice(0, 400_000);
    if (htmlLooksLikeErrorPage(body)) return null;
    return body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
