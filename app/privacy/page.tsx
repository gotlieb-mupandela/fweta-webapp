import type { Metadata } from "next";

import { PublicChrome } from "@/components/public-chrome";
import PrivacyArticle from "../legal/privacy/page";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How fweta handles account, wallet, and bank-detail data.",
};

export default function PrivacyPage() {
  return (
    <PublicChrome>
      <PrivacyArticle />
    </PublicChrome>
  );
}
