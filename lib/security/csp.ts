export function contentSecurityPolicy(options?: {
  supabaseHost?: string;
  allowEval?: boolean;
}): string {
  const host = options?.supabaseHost?.trim();
  const connect = host ? ` https://${host} wss://${host}` : "";
  const script = options?.allowEval ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    script,
    `connect-src 'self'${connect}`,
  ].join("; ");
}
