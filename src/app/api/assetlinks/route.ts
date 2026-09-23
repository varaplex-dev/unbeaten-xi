import { NextResponse } from "next/server";

// Digital Asset Links for the Android TWA (package com.unbeatengame.app).
// Exposed at /.well-known/assetlinks.json through a rewrite in next.config.ts —
// Next.js does NOT serve dot-folders (like /public/.well-known), so a route
// handler is the reliable way to serve this on Vercel.
//
// The array can hold multiple certs. We include:
//  - the PWABuilder UPLOAD key (covers apps installed from the raw .aab/.apk)
//  - (add) the Play App Signing key SHA-256 from Play Console, so apps
//    DELIVERED BY GOOGLE PLAY (which Google re-signs) also verify and open
//    full-screen. Get it from: Play Console → your app → the App signing /
//    App bundle explorer page → "App signing key certificate" SHA-256.
const SHA256_FINGERPRINTS = [
  // PWABuilder upload key
  "8B:EA:20:E7:BF:9C:6F:CE:BE:DC:83:38:61:83:BA:DC:F6:C3:C6:9C:53:EC:81:E5:A2:A7:9A:72:2D:49:AA:BE",
  // Play App Signing key SHA-256 goes here once retrieved from Play Console.
];

export function GET() {
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.unbeatengame.app",
        sha256_cert_fingerprints: SHA256_FINGERPRINTS,
      },
    },
  ]);
}

// Static — the content only changes when we edit this file.
export const dynamic = "force-static";
