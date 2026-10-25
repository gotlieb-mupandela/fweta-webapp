import type { MetadataRoute } from "next";

/**
 * Installed app chrome. theme_color matches the viewport in app/layout.tsx.
 * background_color matches the page background that layout paints.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "fweta",
    short_name: "fweta",
    description: "Campaigns, bookings, and payouts for African creators.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f3ef",
    theme_color: "#f7f7f4",
    lang: "en",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
