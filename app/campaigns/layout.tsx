import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Open campaigns", template: "%s · Fweta" },
  description: "Browse open Fweta campaigns and submit clips on allowed platforms.",
  openGraph: {
    title: "Open campaigns · Fweta",
    description: "Browse open campaigns and submit clips.",
  },
};

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
