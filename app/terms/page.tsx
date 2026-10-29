import type { Metadata } from "next";

import { PublicChrome } from "@/components/public-chrome";
import TermsArticle from "../legal/terms/page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using the fweta workspace, campaigns, bookings, and manual payouts.",
};

export default function TermsPage() {
  return (
    <PublicChrome>
      <TermsArticle />
    </PublicChrome>
  );
}
