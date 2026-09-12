import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export async function PublicChrome({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const session = await getSession();

  return (
    <div className="bg-atmosphere min-h-dvh">
      <header className="public-header sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Logo href={session ? "/dashboard" : "/login"} />
          {session ? (
            <Link href="/dashboard">
              <Button size="sm" variant="secondary">
                Dashboard
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button size="sm" variant="ghost">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-12">
        {title ? (
          <div className="mb-8 animate-fade-up md:mb-10">
            <h1 className="font-display text-4xl tracking-tight text-foreground md:text-5xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
        ) : null}
        <div className="animate-fade-up delay-1">{children}</div>
      </main>
    </div>
  );
}
