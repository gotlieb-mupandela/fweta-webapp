import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Fail builds on type errors — surfacing breakage in CI, not prod.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
