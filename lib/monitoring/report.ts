type ErrorContext = Record<string, string | number | boolean | null>;

/**
 * Forwards a short error report when ERROR_WEBHOOK_URL is set (Slack incoming
 * webhook, Sentry store endpoint, or any JSON collector). No-ops otherwise.
 * Never include bank details, passwords, or raw request bodies.
 */
export async function reportServerError(error: unknown, context: ErrorContext = {}): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("[fweta]", context.source ?? "error", message);

  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!url) return;

  const payload = {
    source: "fweta",
    message: message.slice(0, 500),
    context,
    at: new Date().toISOString(),
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    console.error(
      "[fweta] error webhook failed:",
      err instanceof Error ? err.message : "request failed",
    );
  }
}
