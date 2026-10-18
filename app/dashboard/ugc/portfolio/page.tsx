import { redirect } from "next/navigation";

import { PortfolioForm } from "@/components/forms/licensing-forms";
import { PageHeader } from "@/components/ui/card";
import { ContextHelp } from "@/components/onboarding/context-help";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("clipper") && !session.roles.includes("influencer") && !session.roles.includes("admin")) {
    redirect("/dashboard");
  }
  const store = await readStore();
  const portfolio = store.creatorPortfolios.find((item) => item.userId === session.id);
  const feeNad = portfolio ? (portfolio.ugcFeeCents / 100).toFixed(2) : "";

  return (
    <div className="dash-stack">
      <PageHeader
        title="UGC portfolio"
        description="Sample videos and the rate brands should expect for a licensed file."
      />
      <ContextHelp
        title="This is public only when you publish it"
        body="Sample links can be posts you already made. Licensed brief files stay private and are not shown here."
      />
      <PortfolioForm
        headline={portfolio?.headline ?? ""}
        about={portfolio?.about ?? ""}
        sampleUrls={(portfolio?.sampleUrls ?? []).join("\n")}
        feeNad={feeNad}
        published={portfolio?.published ?? false}
      />
    </div>
  );
}
