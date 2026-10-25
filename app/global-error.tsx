"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Karla, Newsreader } from "next/font/google";

import { TryAgain } from "@/components/errors/try-again";
import { Button } from "@/components/ui/button";

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
      <title>Something went wrong · Fweta</title>
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
            Fweta hit an unexpected error. Try again, or go back home.
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

