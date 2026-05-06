/**
 * One-shot: resize + convert lab avatars from giant 1024x1024 PNGs
 * (~1.3MB each) to webp sized for actual display use.
 *
 * Avatars are displayed at 32px (Claude.ai-style chat) or 28px (presence
 * grid). 256x256 webp covers up to 4x retina. Target: <30KB per avatar.
 *
 * Verdict banner is displayed full-width up to ~720px hero, so we keep
 * a larger 1280x720 webp for it. Target: <100KB.
 *
 * Run:  node scripts/optimize-lab-avatars.mjs
 *
 * Outputs replace the *-v2.png files with *-v2.webp. Old PNGs are
 * deleted to avoid lingering 9MB git history.
 */

import sharp from "sharp";
import { readdir, unlink, stat } from "node:fs/promises";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "public", "lab", "avatars");

// Filename → target dimensions. Banner is wider; everyone else is square avatar.
const TARGETS = {
  "verdict-banner": { width: 1280, height: 720, fit: "cover" },
  // any other name → 256x256
};

function targetFor(name) {
  return TARGETS[name] || { width: 256, height: 256, fit: "cover" };
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
  if (!files.length) {
    console.log("No PNGs found in", DIR);
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;

  for (const f of files) {
    const inputPath = join(DIR, f);
    const stem = basename(f, extname(f));        // e.g. "proposer-v2"
    const baseName = stem.replace(/-v\d+$/, ""); // e.g. "proposer"
    const target = targetFor(baseName);
    const outputPath = join(DIR, `${stem}.webp`);

    const before = (await stat(inputPath)).size;
    totalBefore += before;

    await sharp(inputPath)
      .resize(target.width, target.height, { fit: target.fit })
      .webp({ quality: 82, effort: 6 })  // good quality, small file
      .toFile(outputPath);

    const after = (await stat(outputPath)).size;
    totalAfter += after;

    await unlink(inputPath);  // remove the giant PNG

    console.log(
      `${f.padEnd(28)} ${(before / 1024).toFixed(0).padStart(5)} KB  →  ${stem}.webp ${(after / 1024).toFixed(0).padStart(5)} KB  (${target.width}x${target.height})`,
    );
  }

  console.log(
    `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024).toFixed(0)} KB ` +
    `(${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% smaller)`,
  );
}

main().catch((e) => {
  console.error("[FAIL]", e);
  process.exit(1);
});
