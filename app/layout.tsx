import type { Metadata, Viewport } from "next";
import { Karla, Newsreader, Red_Hat_Mono } from "next/font/google";

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

const redHatMono = Red_Hat_Mono({
  variable: "--font-redhat-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: {
    default: "fweta",
    template: "%s · fweta",
  },
  description: "fweta workspace — campaigns, bookings, and payouts.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.fweta.com"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "fweta",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f7f4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${karla.variable} ${newsreader.variable} ${redHatMono.variable} h-full`}
    >
      <body
        className={`${karla.className} min-h-full flex flex-col bg-background text-foreground antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
