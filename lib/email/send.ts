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
    if (process.env.NODE_ENV !== "production") {
      await writeDevOutbox(messages);
      return;
    }
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

/**
 * Local development without Resend keys: save each email to data/dev-mail/
 * (gitignored) and log its subject and links, so sign-up, sign-in and reset
 * flows can be tested end to end. Never runs in production.
 */
async function writeDevOutbox(messages: OutboundEmail[]): Promise<void> {
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "data", "dev-mail");
    await mkdir(dir, { recursive: true });
    for (const message of messages) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const slug = message.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const base = path.join(dir, `${stamp}-${slug}`);
      await writeFile(`${base}.html`, message.html, "utf8");
      await writeFile(`${base}.txt`, `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`, "utf8");
      const links = message.text.match(/https?:\/\/\S+/g) ?? [];
      console.info(`[fweta] dev mail -> ${message.to}: ${message.subject}\n  ${base}.html`);
      for (const link of links.filter((l) => !l.includes("/email/"))) console.info(`  link: ${link}`);
    }
  } catch (err) {
    console.warn("[fweta] dev mail outbox failed:", err instanceof Error ? err.message : err);
  }
}
