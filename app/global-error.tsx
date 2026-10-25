"use client";

import { Component, useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Karla, Newsreader } from "next/font/google";

import { Button } from "@/components/ui/button";
import { recoverGlobalError } from "@/lib/errors/recover-global-error";

import "./globals.css";

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  adjustFontFallback: false,
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  adjustFontFallback: false,
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/observability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest ?? "",
        source: "global",
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en" className={`${karla.variable} ${newsreader.variable} h-full`}>
      <body
        className={`${karla.className} flex min-h-full flex-col bg-background text-foreground antialiased`}
      >
        <div className="bg-atmosphere flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="fweta">
            <Image
              src="/brand/fweta-mark.png"
              alt=""
              width={29}
              height={32}
              className="shrink-0 object-contain"
              aria-hidden
            />
            <span className="text-[1.05rem] font-semibold tracking-tight text-foreground">fweta</span>
          </Link>
          <h1 className="mt-6 font-display text-3xl tracking-tight text-foreground md:text-4xl">
            Something went wrong
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            fweta hit an unexpected error. Try again, or go back home.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <TryAgain reset={reset} />
            <Link href="/">
              <Button variant="secondary">Back home</Button>
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}

function TryAgainWithRouter({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <Button type="button" onClick={() => recoverGlobalError(reset, () => router.refresh())}>
      Try again
    </Button>
  );
}

class TryAgainBoundary extends Component<{ reset: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Button type="button" onClick={() => recoverGlobalError(this.props.reset)}>
          Try again
        </Button>
      );
    }
    return this.props.children;
  }
}

function TryAgain({ reset }: { reset: () => void }) {
  return (
    <TryAgainBoundary reset={reset}>
      <TryAgainWithRouter reset={reset} />
    </TryAgainBoundary>
  );
}
