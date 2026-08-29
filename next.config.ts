import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 rewrites an agent-rules block into AGENTS.md on every `next dev`.
  // Disable it so the curated AGENTS.md stays the single source of truth.
  agentRules: false,
};

export default nextConfig;
