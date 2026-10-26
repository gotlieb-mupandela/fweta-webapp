import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open campaigns",
  description: "Browse Fweta content rewards campaigns and submit clips on allowed platforms.",
  openGraph: {
    title: "Open campaigns · Fweta",
    description: "Browse content rewards campaigns and submit clips.",
  },
};

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
