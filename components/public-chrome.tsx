import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { LegalFooter } from "@/components/legal-footer";
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
      <header className="public-header relative top-0 z-40 md:sticky">
        <div className="mx-auto grid min-w-0 max-w-5xl grid-cols-[1fr_auto] items-center gap-x-3 px-4 pt-3 md:flex md:justify-between md:px-8 md:py-4">
          <div className="contents md:flex md:min-w-0 md:items-center md:gap-6">
            <Logo href={session ? "/dashboard" : "/login"} />
            <nav aria-label="Public" className="order-last col-span-2 -mx-4 flex gap-1 overflow-x-auto px-3 pb-1 text-sm text-muted md:order-none md:mx-0 md:gap-5 md:overflow-visible md:p-0 [&>a]:flex [&>a]:min-h-11 [&>a]:shrink-0 [&>a]:items-center [&>a]:px-2 md:[&>a]:min-h-0 md:[&>a]:px-0">
              <Link href="/campaigns" className="hover:text-foreground">
                Campaigns
              </Link>
              <Link href="/directory" className="hover:text-foreground">
                Directory
              </Link>
              <Link href="/influencers" className="hover:text-foreground">
                Creators
              </Link>
              <Link href="/leaderboard" className="hover:text-foreground">
                Leaderboard
              </Link>
            </nav>
          </div>
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

      <main id="main" className="mx-auto min-w-0 max-w-5xl px-5 py-10 md:px-8 md:py-12">
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
      <footer className="mx-auto w-full max-w-5xl space-y-3 px-5 pb-10 md:px-8">
        <nav aria-label="Company">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <li>
              <Link href="/about" className="underline-offset-2 hover:text-foreground hover:underline">
                About
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="underline-offset-2 hover:text-foreground hover:underline">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/faq" className="underline-offset-2 hover:text-foreground hover:underline">
                FAQ
              </Link>
            </li>
            <li>
              <Link href="/contact" className="underline-offset-2 hover:text-foreground hover:underline">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/help" className="underline-offset-2 hover:text-foreground hover:underline">
                Help
              </Link>
            </li>
          </ul>
        </nav>
        <LegalFooter />
      </footer>
    </div>
  );
}
