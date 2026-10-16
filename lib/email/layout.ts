import { appUrl } from "@/lib/email/config";

export type EmailAction = {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
};

export type EmailDetail = {
  label: string;
  value: string;
};

export type EmailDocument = {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  /** Short italic line under the headline. */
  kicker?: string;
  paragraphs: string[];
  steps?: string[];
  details?: EmailDetail[];
  actions: EmailAction[];
  footnote?: string;
  preferencesHref: string;
  unsubscribeHref?: string;
  unsubscribeLabel?: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(href: string): string {
  const trimmed = href.trim();
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  ) {
    return escapeHtml(trimmed);
  }
  return "#";
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function renderEmail(doc: EmailDocument): RenderedEmail {
  const subject = oneLine(doc.subject);
  const base = appUrl();
  const logo = `${base}/brand/fweta-mark.webp`;
  const preheader = escapeHtml(oneLine(doc.preheader));

  const paragraphs = doc.paragraphs
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#12110f;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const kicker = doc.kicker
    ? `<p style="margin:14px 0 0;font-family:'Newsreader',Georgia,'Times New Roman',serif;font-style:italic;font-size:20px;line-height:1.35;color:#8f7420;">${escapeHtml(doc.kicker)}</p>`
    : "";

  const steps = doc.steps?.length
    ? `<p style="margin:8px 0 12px;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#9a958c;">Next steps</p>
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
         ${doc.steps
           .map(
             (step, index) => `<tr>
               <td width="40" valign="top" style="padding:0 0 14px;width:40px;">
                 <div style="width:26px;height:26px;border-radius:999px;background:#f3edd9;color:#8f7420;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${index + 1}</div>
               </td>
               <td valign="top" style="padding:2px 0 14px;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#12110f;">${escapeHtml(step)}</td>
             </tr>`,
           )
           .join("")}
       </table>`
    : "";

  const details = doc.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 22px;background:#f7f6f2;border-radius:16px;border:1px solid #e4e1da;">
        ${doc.details
          .map(
            (row, index) => `<tr>
              <td style="padding:13px 16px;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:13px;color:#6f6b63;border-top:${index === 0 ? "0" : "1px solid #e4e1da"};">${escapeHtml(row.label)}</td>
              <td align="right" style="padding:13px 16px;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#12110f;border-top:${index === 0 ? "0" : "1px solid #e4e1da"};">${escapeHtml(row.value)}</td>
            </tr>`,
          )
          .join("")}
      </table>`
    : "";

  const actions = doc.actions.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px;">
        ${doc.actions
          .map((action, index) => {
            const primary = (action.tone ?? (index === 0 ? "primary" : "secondary")) === "primary";
            const style = primary
              ? "display:inline-block;background:#12110f;color:#ffffff;text-decoration:none;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:1;padding:14px 22px;border-radius:14px;border:1px solid #12110f;"
              : "display:inline-block;background:#ffffff;color:#12110f;text-decoration:none;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:1;padding:14px 22px;border-radius:14px;border:1px solid #d0cbc2;";
            return `<tr>
              <td class="btn" align="left" style="padding:0 0 10px;">
                <a href="${safeHref(action.href)}" style="${style}">${escapeHtml(action.label)}</a>
              </td>
            </tr>`;
          })
          .join("")}
      </table>`
    : "";

  const footnote = doc.footnote
    ? `<p style="margin:18px 0 0;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6f6b63;">${escapeHtml(doc.footnote)}</p>`
    : "";

  const unsub = doc.unsubscribeHref
    ? ` &nbsp;&middot;&nbsp; <a href="${safeHref(doc.unsubscribeHref)}" style="color:#6f6b63;text-decoration:underline;">${escapeHtml(doc.unsubscribeLabel || "Unsubscribe")}</a>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(subject)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;600;700&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,600;1,6..72,500&display=swap" rel="stylesheet" />
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; border-radius: 18px !important; }
      .pad { padding: 28px 20px 8px !important; }
      .foot { padding: 4px 20px 28px !important; }
      .h1 { font-size: 32px !important; line-height: 1.08 !important; }
      .btn { display: block !important; width: 100% !important; padding-right: 0 !important; }
      .btn a { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f3ef;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}${"&nbsp;&zwnj;".repeat(8)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f3ef;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:560px;background:#ffffff;border-radius:24px;border:1px solid #e4e1da;overflow:hidden;">
          <tr>
            <td style="height:4px;background:#b8962e;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="pad" style="padding:36px 40px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:10px;">
                    <img src="${escapeHtml(logo)}" width="28" height="31" alt="" style="display:block;border:0;outline:none;" />
                  </td>
                  <td valign="middle" style="font-family:'Karla',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#12110f;">fweta</td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#b8962e;">${escapeHtml(doc.eyebrow)}</p>
              <h1 class="h1" style="margin:10px 0 0;font-family:'Newsreader',Georgia,'Times New Roman',serif;font-size:40px;line-height:1.05;font-weight:600;letter-spacing:-0.02em;color:#12110f;">${escapeHtml(doc.headline)}</h1>
              ${kicker}
              <div style="height:1px;background:#e4e1da;margin:22px 0 22px;font-size:0;line-height:0;">&nbsp;</div>
              ${paragraphs}
              ${steps}
              ${details}
              ${actions}
              ${footnote}
            </td>
          </tr>
          <tr>
            <td class="foot" style="padding:8px 40px 32px;">
              <p style="margin:0;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6f6b63;">
                You are receiving this because you have a fweta account.<br />
                <a href="${safeHref(doc.preferencesHref)}" style="color:#6f6b63;text-decoration:underline;">Email preferences</a>${unsub}
              </p>
              <p style="margin:14px 0 0;font-family:'Karla',Helvetica,Arial,sans-serif;font-size:12px;color:#9a958c;">fweta &middot; Windhoek</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    "fweta",
    "",
    doc.eyebrow,
    doc.headline,
    doc.kicker ? doc.kicker : "",
    "",
    ...doc.paragraphs.filter((p) => p.trim()),
    "",
  ];
  if (doc.steps?.length) {
    textParts.push("Next steps");
    doc.steps.forEach((step, index) => textParts.push(`${index + 1}. ${step}`));
    textParts.push("");
  }
  if (doc.details?.length) {
    for (const row of doc.details) textParts.push(`${row.label}: ${row.value}`);
    textParts.push("");
  }
  for (const action of doc.actions) textParts.push(`${action.label}: ${action.href}`);
  if (doc.footnote) {
    textParts.push("");
    textParts.push(doc.footnote);
  }
  textParts.push("");
  textParts.push(`Email preferences: ${doc.preferencesHref}`);
  if (doc.unsubscribeHref) {
    textParts.push(`${doc.unsubscribeLabel || "Unsubscribe"}: ${doc.unsubscribeHref}`);
  }
  textParts.push("");
  textParts.push("fweta, Windhoek");

  return {
    subject,
    html,
    text: textParts.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n"),
  };
}
