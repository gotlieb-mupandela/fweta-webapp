import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.fweta.com").replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/campaigns", "/influencers", "/legal", "/directory", "/business", "/creators", "/llms.txt"],
      disallow: ["/dashboard", "/onboarding", "/api", "/login", "/signup"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
