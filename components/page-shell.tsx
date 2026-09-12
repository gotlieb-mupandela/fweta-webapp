type PageShellProps = {
  title: string;
  description?: string;
};

export function PageShell({ title, description }: PageShellProps) {
  return (
    <main className="bg-atmosphere mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center gap-3 px-6 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-light">
        fweta
      </p>
      <h1 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">{title}</h1>
      {description ? (
        <p className="max-w-xl text-base leading-relaxed text-muted">{description}</p>
      ) : null}
    </main>
  );
}
