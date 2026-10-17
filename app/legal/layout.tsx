import type { Metadata } from "next";

import { PublicChrome } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "Legal",
  description: "Terms, privacy, and creator terms for fweta.",
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
