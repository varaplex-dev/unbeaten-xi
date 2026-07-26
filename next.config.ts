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
      {
        // Player photos for the national era squads, which carry SportMonks
        // identity metadata (see scripts/sportmonks/). Without this,
        // next/image throws and takes the whole squad-select page down.
        protocol: "https",
        hostname: "cdn.sportmonks.com",
      },
    ],
  },
};

export default nextConfig;
