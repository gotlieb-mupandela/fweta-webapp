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
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide",
        tone === "neutral" && "bg-surface-2 text-foreground",
        tone === "gold" && "bg-gold-soft text-foreground",
        tone === "success" && "bg-emerald-50 text-success",
        tone === "danger" && "bg-red-50 text-danger",
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
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-start gap-3 border-dashed px-6 py-12">
      <h3 className="font-display text-2xl text-foreground">{title}</h3>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {action}
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
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between md:mb-9">
      <div className="space-y-1.5 md:space-y-2">
        {/* Mobile uses top bar title — keep denser screen heading on md+ */}
        <h1 className="hidden font-display text-[2rem] leading-none tracking-tight text-foreground md:block md:text-[2.35rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted md:text-sm md:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="panel p-5 md:p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-3 font-display text-[2rem] leading-none text-foreground md:text-3xl">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-muted-light">{hint}</p> : null}
    </div>
  );
}
