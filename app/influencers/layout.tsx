import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Influencers",
  description: "Browse fweta creator profiles and book at the rates they publish.",
  openGraph: {
    title: "Influencers · fweta",
    description: "Browse creator profiles and book at listed rates.",
  },
};

export default function InfluencersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
