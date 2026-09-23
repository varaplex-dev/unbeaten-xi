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
  async rewrites() {
    return [
      // Digital Asset Links for the Android TWA. Next can't serve a dot-folder
      // from /public, so route the well-known path to a route handler.
      { source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" },
    ];
  },
};

export default nextConfig;
