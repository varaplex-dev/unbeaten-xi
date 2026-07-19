// Instagram has no URL-based share intent the way X/WhatsApp/Facebook do —
// it only accepts actual image files via the OS share sheet (or manual
// upload). This renders a branded result card to a canvas and exports it as
// a PNG Blob, which ShareMenu then either hands to navigator.share({files})
// (Instagram shows up as a target for that on mobile) or offers as a
// download for the user to post manually.

export interface ShareCardData {
  wins: number;
  losses: number;
  unbeaten: boolean;
  teamRating: number;
  netRunRate: number;
  mvpName: string | null;
  siteUrl: string;
}

const SIZE = 1080;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // best-effort — falls back to the canvas default font stack below
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const accent = "#22e6a8";
  const gold = "#e8b34c";
  const saffron = "#ff7a3d";
  const fg = "#f5f7fa";
  const fgMuted = "#8b96a5";
  const sans = "'Geist', -apple-system, 'Segoe UI', sans-serif";

  // Background
  const bg = ctx.createRadialGradient(SIZE / 2, SIZE * 0.38, 80, SIZE / 2, SIZE * 0.5, SIZE * 0.75);
  bg.addColorStop(0, "#131c27");
  bg.addColorStop(1, "#0b0f14");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Kicker
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = `700 32px ${sans}`;
  ctx.textBaseline = "alphabetic";
  ctx.save();
  ctx.letterSpacing = "8px";
  ctx.fillText("THE UNBEATEN XI", SIZE / 2, 150);
  ctx.restore();

  ctx.fillStyle = saffron;
  ctx.font = `700 28px ${sans}`;
  ctx.save();
  ctx.letterSpacing = "6px";
  ctx.fillText("T20 LEAGUE · FINAL RECORD", SIZE / 2, 210);
  ctx.restore();

  // Record
  ctx.fillStyle = fg;
  ctx.font = `italic 900 320px ${sans}`;
  ctx.fillText(`${data.wins}-${data.losses}`, SIZE / 2, 540);

  ctx.fillStyle = data.unbeaten ? accent : fg;
  ctx.font = `italic 900 64px ${sans}`;
  ctx.save();
  ctx.letterSpacing = "2px";
  ctx.fillText(data.unbeaten ? "UNBEATEN SEASON" : "SEASON COMPLETE", SIZE / 2, 620);
  ctx.restore();

  // Stat row
  const stats: { label: string; value: string }[] = [
    { label: "Team Rating", value: String(data.teamRating) },
    { label: "Net Run Rate", value: data.netRunRate.toFixed(2) },
  ];
  if (data.mvpName) stats.push({ label: "MVP", value: data.mvpName });

  const tileW = 300;
  const tileH = 150;
  const gap = 24;
  const totalW = stats.length * tileW + (stats.length - 1) * gap;
  const startX = (SIZE - totalW) / 2;
  const tileY = 720;

  stats.forEach((stat, i) => {
    const x = startX + i * (tileW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundedRect(ctx, x, tileY, tileW, tileH, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 2;
    roundedRect(ctx, x, tileY, tileW, tileH, 20);
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.font = `900 44px ${sans}`;
    ctx.fillText(stat.value.length > 14 ? stat.value.slice(0, 13) + "…" : stat.value, x + tileW / 2, tileY + 70);

    ctx.fillStyle = fgMuted;
    ctx.font = `700 22px ${sans}`;
    ctx.save();
    ctx.letterSpacing = "1px";
    ctx.fillText(stat.label.toUpperCase(), x + tileW / 2, tileY + 112);
    ctx.restore();
  });

  // Footer
  ctx.fillStyle = fgMuted;
  ctx.font = `600 30px ${sans}`;
  ctx.fillText("Can you go 14-0?", SIZE / 2, 960);
  ctx.fillStyle = gold;
  ctx.font = `700 30px ${sans}`;
  ctx.fillText(data.siteUrl.replace(/^https?:\/\//, ""), SIZE / 2, 1010);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to render share card"));
    }, "image/png");
  });
}
