import { Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("panel p-5 md:p-7", className)}>{children}</div>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "success" | "danger" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "neutral" && "bg-surface-2 text-foreground",
        tone === "gold" && "bg-gold-soft text-foreground",
        tone === "success" && "bg-success-soft text-success",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "muted" && "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("empty-panel", className)}>
      <div className="flex size-9 items-center justify-center rounded-full bg-gold-soft text-gold-deep">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h3 className="font-display text-[1.35rem] leading-tight tracking-tight text-foreground md:text-[1.5rem]">
          {title}
        </h3>
        {description ? (
          <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1.5 max-lg:basis-full">
        <p className="sr-only">{title}</p>
        {description ? (
          <p className="max-w-xl text-sm leading-relaxed text-muted wrap-anywhere">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 max-lg:basis-full max-sm:[&>a]:flex-1 max-sm:[&>div]:w-full max-sm:[&>div>a]:flex-1 max-sm:[&_button]:w-full">{action}</div>
      ) : null}
    </div>
  );
}

export function SectionHeader({
  title,
  href,
  linkLabel = "View all",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight text-foreground md:text-lg">
        {title}
      </h2>
      {href ? (
        <Link href={href} className="section-link shrink-0 pb-0.5">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ListRow({
  className,
  children,
  href,
}: {
  className?: string;
  children: React.ReactNode;
  href?: string;
}) {
  if (href) {
    return (
      <Link href={href} className={cn("list-row", className)}>
        {children}
      </Link>
    );
  }
  return <div className={cn("list-row", className)}>{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  href,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-3 font-display text-[clamp(1.15rem,5.4vw,1.75rem)] leading-none tracking-tight text-foreground tabular-nums md:text-[clamp(1.4rem,2.6vw,2rem)] lg:text-[clamp(1.4rem,2vw,2.15rem)]">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cn("stat-card block transition hover:shadow-[var(--shadow-lift)]", className)}>
        {body}
      </Link>
    );
  }
  return <div className={cn("stat-card", className)}>{body}</div>;
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}
