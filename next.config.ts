import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Player photos served by cricketdata.org (CricAPI) for the
        // All-Time XI real-player mode.
        protocol: "https",
        hostname: "h.cricapi.com",
      },
    ],
  },
};

export default nextConfig;
