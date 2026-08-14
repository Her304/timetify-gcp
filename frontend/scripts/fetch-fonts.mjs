/**
 * Downloads the brand webfonts for self-hosting.
 *
 * Run: node scripts/fetch-fonts.mjs
 *
 * Why self-host: the fonts were loaded from fonts.googleapis.com via a
 * stylesheet in <head>. That is render-blocking and costs a DNS lookup plus TLS
 * handshake to two third-party origins (googleapis + gstatic) before any text
 * can paint — directly penalising Largest Contentful Paint on the landing page,
 * which is where search traffic arrives.
 *
 * Two deliberate reductions versus the old <link>:
 *   - Only the latin and latin-ext subsets are kept. The Google CSS also serves
 *     cyrillic, greek and vietnamese, which this product does not use.
 *   - Weights are requested as variable ranges rather than discrete values, so
 *     each family is a single file covering every weight instead of one file
 *     per weight.
 *
 * Writes public/fonts/*.woff2 and public/fonts/fonts.css. The contents of
 * fonts.css are inlined into index.html — if you regenerate the fonts, re-inline
 * that block.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "fonts");

// A modern browser UA is required, or the API serves legacy truetype instead
// of woff2.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FAMILIES = [
  "Bricolage+Grotesque:opsz,wght@12..96,300..700",
  "Geist:wght@300..700",
  "Geist+Mono:wght@400..600",
];

const KEEP_SUBSETS = new Set(["latin", "latin-ext"]);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const url = `https://fonts.googleapis.com/css2?${FAMILIES.map(
    (f) => `family=${f}`,
  ).join("&")}&display=swap`;

  const css = await (await fetch(url, { headers: { "User-Agent": UA } })).text();

  // The API emits a /* subset */ comment before each @font-face block.
  const blocks = css.split("/*").slice(1);
  const kept = [];

  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf("*/")).trim();
    if (!KEEP_SUBSETS.has(subset)) continue;

    const face = block.slice(block.indexOf("*/") + 2);
    const remoteUrl = face.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    const family = face.match(/font-family:\s*'([^']+)'/)?.[1];
    if (!remoteUrl || !family) continue;

    const filename = `${family.toLowerCase().replace(/\s+/g, "-")}-${subset}.woff2`;
    const bytes = Buffer.from(
      await (await fetch(remoteUrl, { headers: { "User-Agent": UA } })).arrayBuffer(),
    );
    await writeFile(path.join(OUT_DIR, filename), bytes);

    kept.push(
      `/* ${family} — ${subset} */\n@font-face {${face
        .replace(/url\(https:\/\/[^)]+\.woff2\)/, `url(/fonts/${filename})`)
        .trim()
        .replace(/^@font-face\s*\{/, "")}`,
    );
    console.log(`[fonts] ${filename} (${(bytes.length / 1024).toFixed(1)} kB)`);
  }

  const out = kept.join("\n\n") + "\n";
  await writeFile(path.join(OUT_DIR, "fonts.css"), out, "utf8");
  console.log(`[fonts] wrote fonts.css with ${kept.length} @font-face rules`);
}

main().catch((err) => {
  console.error("[fonts] failed:", err);
  process.exit(1);
});
