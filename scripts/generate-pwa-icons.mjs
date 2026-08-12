// Generates the PWA app icons from the brand logo. Run: `node scripts/generate-pwa-icons.mjs`.
// - icon-192 / icon-512: standard "any" icons (logo on the dark brand square).
// - icon-maskable-512: extra padding so Android's adaptive-icon mask (circle/
//   squircle) never crops the logo — the safe zone is the centre ~66%.
import sharp from "sharp";

const SRC = "public/logos/logo-unbeaten.png";
const BG = { r: 7, g: 11, b: 16, alpha: 1 }; // #070b10, the app background

async function make(size, logoFraction, out) {
  const logoPx = Math.round(size * logoFraction);
  const logo = await sharp(SRC)
    .resize(logoPx, logoPx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(out);
  console.log("wrote", out);
}

await make(192, 0.82, "public/icon-192.png");
await make(512, 0.82, "public/icon-512.png");
await make(512, 0.62, "public/icon-maskable-512.png");
