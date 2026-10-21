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
  description: "fweta workspace for campaigns, bookings, and payouts for African creators.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.fweta.com"),
  openGraph: {
    title: "fweta",
    description: "Campaigns, bookings, and payouts for African creators.",
    siteName: "fweta",
    type: "website",
  },
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
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
