import { resendConfig, warnResendUnset } from "@/lib/email/config";

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

const BATCH_SIZE = 100;

/**
 * Send through Resend's batch endpoint. Missing credentials log one warning
 * and return without throwing, so signup and campaign actions still succeed.
 */
export async function sendEmails(messages: OutboundEmail[]): Promise<void> {
  if (messages.length === 0) return;
  const config = resendConfig();
  if (!config) {
    warnResendUnset(messages[0]?.subject);
    return;
  }

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((message) => ({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            headers: message.headers,
          })),
        ),
      });
      if (!res.ok) {
        const body = await res.text();
        console.warn(`[fweta] Resend batch failed (${res.status}): ${body.slice(0, 300)}`);
      }
    } catch (err) {
      console.warn("[fweta] Resend batch failed:", err instanceof Error ? err.message : err);
    }
  }
}
