import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export async function PublicSiteHeader({
  backHref,
  backLabel,
}: {
  backHref?: string;
  backLabel?: string;
}) {
  const session = await getSession();

  return (
    <header className="border-b border-border/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
        <Logo href={session ? "/dashboard" : "/"} />
        <div className="flex items-center gap-3">
          {backHref ? (
            <Link href={backHref} className="text-sm text-muted">
              {backLabel ?? "Back"}
            </Link>
          ) : null}
          <Link href={session ? "/dashboard" : "/login"}>
            <Button size="sm" variant="secondary">
              {session ? "Dashboard" : "Log in"}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
