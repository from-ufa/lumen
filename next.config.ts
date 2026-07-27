import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // geoip-lite ships binary data files — keep it external for Node runtime
  serverExternalPackages: ["geoip-lite"],
  experimental: {
    // Soft route morphs (Node ↔ Oracles) via React/Next View Transitions
    viewTransition: true,
  },
};

export default nextConfig;
