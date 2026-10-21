import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { EMAIL_TEMPLATES, isEmailTemplateId, renderEmailPreview } from "@/lib/email/catalog";
import { appUrl } from "@/lib/email/config";
import { cn } from "@/lib/utils";

function previewSrcDoc(html: string): string {
  const base = appUrl();
  return html
    .replaceAll(base, "")
    .replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi, "");
}

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; device?: string }>;
}) {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const params = await searchParams;
  const template = isEmailTemplateId(params.template) ? params.template : "welcome-brand";
  const device = params.device === "mobile" ? "mobile" : "desktop";
  const preview = renderEmailPreview(template);
  const groups = Array.from(new Set(EMAIL_TEMPLATES.map((item) => item.group)));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Email previews"
        description="Sample copies of every transactional email. Opening a preview does not send anything."
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="panel p-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-light">
                {group}
              </p>
              <ul className="space-y-0.5">
                {EMAIL_TEMPLATES.filter((item) => item.group === group).map((item) => {
                  const active = item.id === template;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/dashboard/admin/emails?template=${item.id}&device=${device}`}
                        className={cn(
                          "block rounded-xl px-2.5 py-2 text-sm",
                          active
                            ? "bg-foreground font-medium text-white"
                            : "text-muted hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Subject: <span className="font-medium text-foreground">{preview.subject}</span>
            </p>
            <div className="flex rounded-2xl border border-border bg-white p-1">
              {(["desktop", "mobile"] as const).map((option) => (
                <Link
                  key={option}
                  href={`/dashboard/admin/emails?template=${template}&device=${option}`}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-sm font-medium capitalize",
                    device === option ? "bg-foreground text-white" : "text-muted hover:text-foreground",
                  )}
                >
                  {option}
                </Link>
              ))}
            </div>
          </div>

          <div
            className={cn(
              "overflow-hidden rounded-[1.35rem] border border-border bg-[#f4f3ef] shadow-sm",
              device === "mobile" ? "mx-auto w-full max-w-[390px]" : "w-full",
            )}
          >
            <iframe
              title={`Preview of ${preview.label}`}
              srcDoc={previewSrcDoc(preview.html)}
              sandbox="allow-same-origin"
              className="h-[920px] w-full bg-[#f4f3ef]"
            />
          </div>

          <details className="panel mt-4 p-4">
            <summary className="cursor-pointer text-sm font-medium">Plain text version</summary>
            <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted">
              {preview.text}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
