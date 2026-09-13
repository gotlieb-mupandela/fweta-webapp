function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function AvatarCircle({
  src,
  name,
  size = "md",
}: {
  src: string | null | undefined;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "size-24" : size === "sm" ? "size-10" : "size-14";
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-lg";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URLs; avoid layout shift config deps
      <img
        src={src}
        alt={name}
        className={`${dim} shrink-0 rounded-full border border-border object-cover`}
      />
    );
  }

  return (
    <span
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-display ${text} text-muted`}
      aria-hidden
    >
      {initialsFromName(name) || "?"}
    </span>
  );
}
