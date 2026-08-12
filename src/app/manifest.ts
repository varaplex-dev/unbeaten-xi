import type { MetadataRoute } from "next";

/** Web app manifest — makes the game installable to the home screen on Android
 * (with a maskable adaptive icon and a themed splash) and iOS (via Add to Home
 * Screen). Next serves this at /manifest.webmanifest and links it automatically. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Unbeaten XI",
    short_name: "Unbeaten XI",
    description:
      "Draft a T20 Playing XI from real players and real career stats, then chase an undefeated season.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b10",
    theme_color: "#070b10",
    lang: "en",
    categories: ["games", "sports"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android adaptive-icon mask crops to the centre — this one is padded for it.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
