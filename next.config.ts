import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: must be loaded by Node at runtime, never bundled by webpack.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "ddragon.leagueoflegends.com" }],
  },
};

export default nextConfig;
