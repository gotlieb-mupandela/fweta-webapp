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
  return <div className={cn("panel p-5 md:p-6", className)}>{children}</div>;
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
        "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide wrap-anywhere",
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
    <div className="mb-5 flex min-w-0 flex-col gap-3.5 sm:mb-7 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between md:mb-8">
      <div className="min-w-0 flex-1 space-y-1.5 max-lg:basis-full">
        <p className="sr-only">{title}</p>
        {description ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted md:text-sm md:text-[15px] wrap-anywhere">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 max-lg:basis-full">{action}</div>
      ) : null}
    </div>
  );
}

export function SectionHeader({
  title,
  href,
  linkLabel = "View all →",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-3">
      <h2 className="font-display text-[1.7rem] leading-none tracking-tight text-foreground md:text-2xl">
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2.5 font-display text-[1.85rem] leading-none tracking-tight text-foreground md:text-[2.05rem]">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cn("stat-card block pl-5 transition hover:border-gold/40", className)}>
        {body}
      </Link>
    );
  }
  return <div className={cn("stat-card pl-5", className)}>{body}</div>;
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}
