/**
 * Generate PWA icons for L-TEX.
 *
 * Usage:
 *   npx tsx apps/store/scripts/generate-icons.ts
 *
 * Requires: sharp (pnpm add -D sharp)
 *
 * Creates:
 *   apps/store/public/icon-192.png
 *   apps/store/public/icon-512.png
 */

import sharp from "sharp";
import path from "path";

const BRAND_GREEN = "#16a34a";
const WHITE = "#ffffff";

function buildSvg(size: number, maskable = false): string {
  const fontSize = Math.round(size * (maskable ? 0.26 : 0.32));
  const borderRadius = Math.round(size * 0.18);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : borderRadius}" fill="${BRAND_GREEN}"/>
  <text
    x="50%" y="54%"
    dominant-baseline="central"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="bold"
    font-size="${fontSize}"
    fill="${WHITE}"
    letter-spacing="${Math.round(size * 0.01)}"
  >LT</text>
</svg>`;
}

async function main() {
  const outDir = path.resolve(__dirname, "../public");

  for (const size of [192, 512]) {
    const svg = Buffer.from(buildSvg(size));
    const outPath = path.join(outDir, `icon-${size}.png`);
    await sharp(svg).png().toFile(outPath);
    console.log(`Created ${outPath}`);
  }

  // Maskable icon (no border-radius, smaller text for safe zone)
  const maskableSvg = Buffer.from(buildSvg(512, true));
  const maskablePath = path.join(outDir, "icon-maskable-512.png");
  await sharp(maskableSvg).png().toFile(maskablePath);
  console.log(`Created ${maskablePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
