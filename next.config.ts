import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // geoip-lite ships binary data files — keep it external for Node runtime
  serverExternalPackages: ["geoip-lite"],
};

export default nextConfig;
