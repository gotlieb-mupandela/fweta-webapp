/**
 * Security headers for every route.
 *
 * CSP is enforced. A nonce policy would force every page to render dynamically,
 * which this app does not do. Next.js inline scripts and the style attributes
 * in the UI are allowed with 'unsafe-inline'. Development also allows
 * 'unsafe-eval' because React's dev overlay uses it. Production adds HSTS
 * and upgrade-insecure-requests. Those are omitted in development so
 * `next dev` can load over http.
 */

export type SecurityHeader = { key: string; value: string };

function supabaseOrigin(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!/^[a-z0-9.-]+$/i.test(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(input: {
  nodeEnv: string | undefined;
  supabaseUrl?: string;
}): string {
  const dev = input.nodeEnv === "development";
  const prod = input.nodeEnv === "production";
  const origin = supabaseOrigin(input.supabaseUrl);
  const extraOrigin = origin ? ` ${origin}` : "";
  const parts = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${extraOrigin}`,
    "font-src 'self'",
    `connect-src 'self'${extraOrigin}${dev ? " ws: wss:" : ""}`,
    "frame-src 'self' https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (prod) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(input: {
  nodeEnv: string | undefined;
  supabaseUrl?: string;
}): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(input) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
  if (input.nodeEnv === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  }
  return headers;
}
