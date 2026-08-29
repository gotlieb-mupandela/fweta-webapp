type PageShellProps = {
  title: string;
  description?: string;
};

export function PageShell({ title, description }: PageShellProps) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center gap-3 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Placeholder
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      {description ? (
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
    </main>
  );
}
