import type { NextConfig } from "next";

import { contentSecurityPolicy } from "./lib/security/csp";

const supabaseHost = (() => {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  try {
    return raw ? new URL(raw).hostname : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Do not log server function arguments. They can include passwords.
  logging: {
    serverFunctions: false,
  },
  // Default Server Action body limit is 1 MB, which turns a 2 MB photo into a
  // dashboard error. 5 MB leaves room for a 4 MB ID photo plus multipart overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy({
              supabaseHost,
              allowEval: process.env.NODE_ENV !== "production",
            }),
          },
        ],
      },
    ];
  },
  // Fail builds on type errors, surfacing breakage in CI, not prod.
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
