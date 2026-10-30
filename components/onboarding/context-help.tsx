import { Hint } from "@/components/onboarding/hint";

export function ContextHelp({
  title,
  body,
  hint,
}: {
  title: string;
  body: string;
  hint?: string;
}) {
  return (
    <aside className="rounded-2xl bg-surface-2/70 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        {hint ? <Hint text={hint} label="More" /> : null}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </aside>
  );
}
